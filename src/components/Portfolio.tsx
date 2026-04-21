import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { AreaChart, Area, Tooltip, ResponsiveContainer, CartesianGrid, YAxis, XAxis } from 'recharts';
import { Icons } from '../constants';
import { api } from '../services/api';
import type { RepaymentSchedule } from '../types';

// Helper: deterministic avatar color from wallet address (matches sidebar logic)
const getAvatarHex = (addr: string) => {
  const colors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E']; // blue, violet, emerald, amber, rose
  const code = Math.abs(addr.charCodeAt(0));
  return colors[code % colors.length];
};

interface PortfolioProps {
  isWalletConnected?: boolean;
  onConnect?: () => void;
  onSettingsClick?: () => void;
  onLogout?: () => void;
  defaultTab?: 'personal' | 'enterprise';
}

const Portfolio: React.FC<PortfolioProps> = ({ isWalletConnected = false, onConnect, onSettingsClick, onLogout, defaultTab = 'personal' }) => {
  const [balance, setBalance] = useState(0);
  const [yieldAccumulated, setYieldAccumulated] = useState(0);
  const [isHidden, setIsHidden] = useState(false);
  const [greeting, setGreeting] = useState('Good Morning');
  const [apiHoldings, setApiHoldings] = useState<any[]>([]);
  const [apiInvestments, setApiInvestments] = useState<any[]>([]);
  const [apiHistory, setApiHistory] = useState<any[]>([]);
  const [apiChartData, setApiChartData] = useState<any[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'holdings' | 'activity'>('holdings');
  const [enterpriseDeductions, setEnterpriseDeductions] = useState<Record<string, { schedule: RepaymentSchedule[]; project: any }>>({});
  const enterpriseFetched = useRef(false);

  const { user, ready, authenticated } = usePrivy();
  const navigate = useNavigate();
  const avatarUserName = user?.google?.name || user?.twitter?.username || user?.email?.address?.split('@')[0] || 'User';

  const linkedWallets = (user?.linkedAccounts ?? []).filter(
    (acc) => (acc.type === 'wallet' || acc.type === 'smart_wallet') && 'address' in acc
  ) as Array<{ address: string; walletClientType?: string }>;
  const privyEmbeddedWallet = linkedWallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = privyEmbeddedWallet?.address ?? linkedWallets[0]?.address ?? '';
  const displayAddress = walletAddress || '0x1a2B3c4D5e6F7890AbCdEf1234567890aBcDeF12';
  const [copied, setCopied] = useState(false);
  const [timeframe, setTimeframe] = useState('7D');
  const [profileTab, setProfileTab] = useState<'personal' | 'enterprise'>(defaultTab);

  useEffect(() => {
    setProfileTab(defaultTab);
  }, [defaultTab]);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  // Enterprise verification
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyWizard, setShowVerifyWizard] = useState(false);
  const [verifyStep, setVerifyStep] = useState(0); // 0=companyInfo, 1=stripe
  const [verifyDone, setVerifyDone] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeApiKeyInput, setStripeApiKeyInput] = useState('');
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeKeyError, setStripeKeyError] = useState<string | null>(null);
  const [stripeRevenue, setStripeRevenue] = useState<{ mrr: number; last30dRev: number; momGrowth: number; lastSyncAt: string | null }>({ mrr: 0, last30dRev: 0, momGrowth: 0, lastSyncAt: null });
  const [verifyData, setVerifyData] = useState({
    companyName: '', country: '', registrationNo: '',
    description: '', website: '', foundedYear: '',
    categories: [] as string[],
    companyLogo: '', licenseDoc: '',
    uboName: '', uboIdDoc: ''
  });
  const [licenseUploading, setLicenseUploading] = useState(false);
  const licenseInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const VERIFY_TOTAL = 2;
  const [userProfile, setUserProfile] = useState({
    name: '',
    avatar: '',
    bio: '',
    twitter: '',
    linkedin: '',
    personalWebsite: '',
    isPublic: true
  });
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [enterpriseApplications, setEnterpriseApplications] = useState<any[]>([]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  useEffect(() => {
    if (!isWalletConnected || !api.isAuthenticated) return;
    setIsChartLoading(true);
    
    // Fetch profile and enterprise status
    api.getProfile().then(p => {
      if (p) setUserProfile(prev => ({ ...prev, name: p.name || '', avatar: p.avatar || '', bio: p.bio || '', twitter: p.twitter || '', linkedin: p.linkedin || '', personalWebsite: p.personalWebsite || '', isPublic: p.isPublic ?? true }));
      setIsProfileLoading(false);
    }).catch(() => setIsProfileLoading(false));

    api.getEnterpriseVerificationStatus().then(status => {
      if (status && status.step > 0) {
        setIsVerified(status.status === 'verified');
        setVerifyStep(status.step);
        if (status.stripeApiKeyEncrypted && status.stripeKeyStatus === 'active') setStripeConnected(true);
        // Restore form data from backend
        setVerifyData(prev => ({
          ...prev,
          companyName: status.companyName || '',
          country: status.country || '',
          registrationNo: status.registrationNo || '',
          description: status.description || '',
          website: status.website || '',
          foundedYear: status.foundedYear ? String(status.foundedYear) : '',
          categories: status.categories ? status.categories.split(',') : [],
          companyLogo: status.companyLogo || '',
          licenseDoc: status.licenseDoc || '',
          uboName: status.uboName || '',
          uboIdDoc: status.uboIdDoc || '',
        }));
        if (status.status === 'verified') setVerifyDone(true);
      }
    }).catch(console.error);

    // Fetch Stripe revenue data
    api.getStripeRevenue().then(rev => {
      if (rev && rev.connected) {
        setStripeConnected(true);
        setStripeRevenue({ mrr: rev.mrr, last30dRev: rev.last30dRev, momGrowth: rev.momGrowth, lastSyncAt: rev.lastSyncAt });
      }
    }).catch(console.error);

    Promise.all([
      api.getHoldings().catch(() => []),
      api.getInvestments().catch(() => []),
      api.getHistory().catch(() => []),
      api.getHistoricalBalance().catch(() => []),
    ]).then(async ([h, inv, hist, chart]) => {
      // dynamically fetch real on-chain USDC from Base Mainnet RPC
      if (walletAddress) {
        try {
          const rawAddr = walletAddress.replace('0x', '').toLowerCase();
          const data = '0x70a08231000000000000000000000000' + rawAddr;
          
          // Query both Native USDC and Bridged USDbC concurrently
          const usdcContracts = [
            '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Native USDC
            '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'  // USDbC (Bridged, e.g., Binance withdrawals)
          ];
          
          const calls = usdcContracts.map(contract => 
            fetch('https://mainnet.base.org', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{ to: contract, data }, 'latest'],
                id: 1
              })
            }).then(r => r.json())
          );
          
          const results = await Promise.all(calls);
          let totalOnchainUsdc = 0;
          
          results.forEach(json => {
            if (json.result && json.result !== '0x') {
              totalOnchainUsdc += parseInt(json.result, 16) / 1e6;
            }
          });

          if (totalOnchainUsdc > 0) {
            const existingUsdc = h.find((item:any) => item.asset === 'USDC');
            if (existingUsdc) {
              existingUsdc.amount += totalOnchainUsdc;
              existingUsdc.currentApy = 0; // Pure wallet balance
              existingUsdc.earnedYield = 0;
            } else {
              h.push({ asset: 'USDC', amount: totalOnchainUsdc, currentPrice: 1, currentApy: 0, earnedYield: 0 });
            }
          }
          
          // Fetch On-chain Token Transfers (USDC) from Basescan
          let basescanHistory: any[] = [];
          try {
            const bsRes = await fetch(`https://api.basescan.org/api?module=account&action=tokentx&address=${walletAddress}&page=1&offset=50&sort=desc`);
            const bsJson = await bsRes.json();
            if (bsJson.status === '1' && Array.isArray(bsJson.result)) {
              const myAddr = walletAddress.toLowerCase();
              const usdcTxs = bsJson.result.filter((tx: any) => usdcContracts.includes(tx.contractAddress?.toLowerCase()));
              
              basescanHistory = usdcTxs.map((tx: any) => {
                const isDeposit = tx.to.toLowerCase() === myAddr;
                return {
                  id: tx.hash,
                  type: isDeposit ? 'ONCHAIN_RECEIVED' : 'ONCHAIN_SENT',
                  amount: parseInt(tx.value) / 1e6,
                  asset: 'USDC',
                  createdAt: new Date(parseInt(tx.timeStamp) * 1000).toISOString()
                };
              });
            }
          } catch (e) {
            console.error('Failed to fetch Basescan history:', e);
          }
          
          // Merge Basescan history with backend history
          if (Array.isArray(hist)) {
            hist.push(...basescanHistory);
            hist.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          } else {
            hist = basescanHistory;
          }

        } catch (e) {
          console.error('Failed to fetch on-chain USDC data on Base:', e);
        }
      }

      if (Array.isArray(chart) && chart.length > 0) {
        setApiChartData(chart);
      }
      setIsChartLoading(false);

      if (Array.isArray(h) && h.length > 0) {
        setApiHoldings([...h]);
        const total = h.reduce((sum: number, item: any) => sum + ((item.amount || 0) * (item.currentPrice || 1.0)), 0);
        setBalance(total);
        const yTotal = h.reduce((sum: number, item: any) => sum + (item.earnedYield || 0), 0);
        setYieldAccumulated(yTotal);
      } else {
        setBalance(0);
        setYieldAccumulated(0);
      }
      if (Array.isArray(inv) && inv.length > 0) {
        setApiInvestments(inv);
        const invYield = inv.reduce((sum: number, item: any) => sum + (item.earnedYield || 0), 0);
        setYieldAccumulated(prev => prev + invYield);
      }
      if (Array.isArray(hist) && hist.length > 0) setApiHistory(hist);
    });
  }, [isWalletConnected, walletAddress]);

  const handleNextStep = async () => {
    try {
      const payload: any = {
        step: verifyStep + 1,
        companyName: verifyData.companyName,
        country: verifyData.country,
        registrationNo: verifyData.registrationNo || undefined,
        description: verifyData.description || undefined,
        website: verifyData.website || undefined,
        foundedYear: verifyData.foundedYear ? parseInt(verifyData.foundedYear) : undefined,
        categories: verifyData.categories.length > 0 ? verifyData.categories.join(',') : undefined,
        companyLogo: verifyData.companyLogo || undefined,
        licenseDoc: verifyData.licenseDoc || undefined,
        uboName: verifyData.uboName || undefined,
        uboIdDoc: verifyData.uboIdDoc || undefined,
      };

      if (verifyStep === 0) {
        // Step 0 -> 1: require company name & country
        if (!verifyData.companyName.trim() || !verifyData.country.trim()) {
          alert('Company Name and Country are required');
          return;
        }
      }

      if (verifyStep < VERIFY_TOTAL - 1) {
        await api.updateEnterpriseVerificationStep(payload);
        setVerifyStep(s => s + 1);
      } else {
        // Final step
        await api.updateEnterpriseVerificationStep({ ...payload, step: VERIFY_TOTAL });
        setVerifyDone(true);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save verification step');
    }
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLicenseUploading(true);
    try {
      const result = await api.uploadFile(file);
      setVerifyData(prev => ({ ...prev, licenseDoc: result.url }));
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload file. Please try again.');
    } finally {
      setLicenseUploading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const result = await api.uploadFile(file);
      setVerifyData(prev => ({ ...prev, companyLogo: result.url }));
    } catch (err) {
      console.error('Logo upload failed:', err);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setLogoUploading(false);
    }
  };

  const toggleCategory = (tag: string) => {
    setVerifyData(prev => ({
      ...prev,
      categories: prev.categories.includes(tag)
        ? prev.categories.filter(t => t !== tag)
        : [...prev.categories, tag]
    }));
  };

  // Enterprise specific stats calculation based on deductions data when enterprise tab is active
  useEffect(() => {
    if (profileTab !== 'enterprise' || !isWalletConnected) return;
    if (enterpriseFetched.current) return;
    enterpriseFetched.current = true;
    (async () => {
      try {
        // Try applications first (auth-required)
        let hasData = false;
        if (api.isAuthenticated) {
          const apps = await api.getApplications().catch(() => []);
          
          if (Array.isArray(apps)) {
            setEnterpriseApplications(apps);
          }

          if (Array.isArray(apps) && apps.length > 0) {
            const results: Record<string, { schedule: RepaymentSchedule[]; project: any }> = {};
            await Promise.all(
              apps.filter((a: any) => a.projectId).map(async (app: any) => {
                const schedule = await api.getRepaymentSchedule(app.projectId).catch(() => []);
                if (Array.isArray(schedule) && schedule.length > 0) {
                  results[app.projectId] = { schedule, project: { id: app.projectId, title: app.projectName || app.projectId } };
                }
              })
            );
            if (Object.keys(results).length > 0) {
              setEnterpriseDeductions(results);
            }
          }
        }
      } catch { /* ignore */ }
    })();
  }, [profileTab, isWalletConnected, enterpriseDeductions]);

  const getFilteredData = () => {
    const src = apiChartData.length > 0 ? apiChartData : [];
    if (timeframe === '7D') return src.slice(-7);
    if (timeframe === '30D') return src.slice(-30);
    if (timeframe === '3M') return src;
    return src;
  };

  const demoMode = !isWalletConnected;

  const filteredChartData = getFilteredData();

  // Compute dynamic stats from real data
  const assetCount = apiHoldings.length + apiInvestments.length;
  const profitLoss = filteredChartData.length >= 2
    ? filteredChartData[filteredChartData.length - 1].total - filteredChartData[0].total
    : yieldAccumulated;

  if (!ready || (authenticated && isProfileLoading)) {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center animate-fadeIn min-h-[500px]">
        <svg className="w-8 h-8 text-[#00E676] animate-spin mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Syncing Profile</p>
      </div>
    );
  }

  if (showEditProfile) {
    return (
      <EditProfilePage 
        profile={userProfile} 
        avatarUserName={avatarUserName}
        onSave={(p) => { 
          setUserProfile(p); 
          api.updateProfile(p).catch(console.error);
          // dispatch global event to reload avatar elsewhere
          window.dispatchEvent(new CustomEvent('loka-profile-updated', { detail: p }));
          setShowEditProfile(false); 
        }} 
        onClose={() => setShowEditProfile(false)} 
      />
    );
  }

  return (
    <>
      <div className="animate-fadeIn p-4 sm:p-8 md:p-10 lg:p-12 pb-28 md:pb-24 max-w-[1600px] mx-auto w-full min-h-full space-y-6">

        {/* Top bar: Title + Logout (personal only) */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[22px] font-semibold text-gray-900">{profileTab === 'enterprise' ? 'Enterprise' : 'Profile'}</h1>
          {profileTab === 'personal' && (
            <div className="flex items-center gap-2">
              <button
                onClick={onLogout}
                className="p-2 text-red-400 hover:text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                title="Log Out"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          )}
        </div>

        {profileTab === 'personal' ? (
          <>

            {/* TWO COLUMN PORTFOLIO HERO LAYOUT */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-0 pb-6">

              {/* --- Left Card: Profile & Overview --- */}
              <div className="md:col-span-5 bg-white border border-gray-100 rounded-xl shadow-sm p-4 sm:p-6 flex flex-col justify-between space-y-4 sm:space-y-6">

                {/* User Profile */}
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Gradient Avatar Mock */}
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0 overflow-hidden" style={userProfile.avatar ? {} : { backgroundColor: getAvatarHex(avatarUserName) }}>
                      {userProfile.avatar ? (
                        <img src={userProfile.avatar} className="w-full h-full object-cover" alt="Avatar" />
                      ) : (
                        <span>{avatarUserName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <h2 className="text-base sm:text-xl font-black text-black tracking-tight truncate">
                        {userProfile.name || avatarUserName}
                      </h2>
                      {user?.email?.address && (
                        <p className="text-[11px] text-gray-400 truncate">{user.email.address}</p>
                      )}
                      <p className="text-[11px] font-medium text-gray-400">Joined Nov {new Date().getFullYear()}</p>
                      {userProfile.bio && <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">{userProfile.bio}</p>}
                      {(userProfile.twitter || userProfile.linkedin || userProfile.personalWebsite) && (
                        <div className="flex flex-col gap-0.5 mt-1">
                          {userProfile.twitter && (
                            <a href={userProfile.twitter.startsWith('http') ? userProfile.twitter : `https://${userProfile.twitter}`} target="_blank" rel="noreferrer" className="text-[11px] text-gray-500 hover:text-black hover:underline truncate max-w-[200px] flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                              {userProfile.twitter.replace(/^https?:\/\/(www\.)?(twitter\.com\/|x\.com\/)?/, '@')}
                            </a>
                          )}
                          {userProfile.linkedin && (
                            <a href={userProfile.linkedin.startsWith('http') ? userProfile.linkedin : `https://${userProfile.linkedin}`} target="_blank" rel="noreferrer" className="text-[11px] text-gray-500 hover:text-blue-600 hover:underline truncate max-w-[200px] flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                              LinkedIn
                            </a>
                          )}
                          {userProfile.personalWebsite && (
                            <a href={userProfile.personalWebsite.startsWith('http') ? userProfile.personalWebsite : `https://${userProfile.personalWebsite}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-500 hover:underline truncate max-w-[200px] flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                              {userProfile.personalWebsite.replace(/^https?:\/\//, '')}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setShowEditProfile(true)} className="p-2 text-gray-400 hover:text-black bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                </div>

                {/* Stats Grid */}
                <div className="flex items-center justify-between py-2 border-y border-gray-50/80">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold tracking-widest mb-1">Net Worth</span>
                    <span className="text-base sm:text-lg font-black text-black">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold tracking-widest mb-1">Total Yield</span>
                    <span className="text-base sm:text-lg font-black text-[#00E676]">+${yieldAccumulated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold tracking-widest mb-1">Assets</span>
                    <span className="text-base sm:text-lg font-black text-black">{assetCount}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('loka-open-modal', { detail: 'deposit' }))}
                    className="w-full py-2.5 bg-black text-white hover:bg-gray-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                    Deposit
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('loka-open-modal', { detail: 'withdraw' }))}
                    className="w-full py-2.5 bg-gray-100 text-black hover:bg-gray-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                    Withdraw
                  </button>
                </div>

                {/* Invite Friends button */}
                <InvitationCodesTopEntry variant="card" />

              </div>

              {/* --- Right Card: Chart & History --- */}
              <div className="md:col-span-7 bg-white border border-gray-100 rounded-xl shadow-sm p-4 sm:p-6 flex flex-col justify-between">

                {/* Chart Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00E676] animate-pulse"></div>
                      <span className="text-[10px] text-gray-500 font-bold tracking-widest ">Profit / Loss</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-black">{profitLoss >= 0 ? '+' : '-'}${Math.abs(profitLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
                    <p className="text-[11px] font-bold text-gray-400 mt-1  tracking-widest">{timeframe === 'ALL' ? 'All Time' : `Past ${timeframe}`}</p>
                  </div>

                  {/* Toggles */}
                  <div className="flex bg-gray-50 p-1 rounded-full border border-gray-100 gap-0.5 mt-3 sm:mt-0 self-start">
                    {['7D', '30D', '3M', 'ALL'].map(t => (
                      <button
                        key={t}
                        onClick={() => setTimeframe(t)}
                        className={`px-3 py-1.5 text-[10px] font-black rounded-full transition-all ${timeframe === t ? 'bg-white text-black shadow-sm border border-gray-200/50' : 'text-gray-400 hover:text-black'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chart Container */}
                <div className="h-[150px] w-full mt-6 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredChartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00E676" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                        tickFormatter={(tick) => {
                          const date = new Date(tick);
                          if (timeframe === '7D') return date.toLocaleDateString('en-US', { weekday: 'short' });
                          if (timeframe === '30D') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          return date.toLocaleDateString('en-US', { month: 'short' });
                        }}
                        tick={{ fontSize: 9, fill: '#9CA3AF', fontWeight: 'bold' }}
                        dy={5}
                      />
                      <YAxis domain={['dataMin - 200', 'dataMax + 100']} hide />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white px-3 py-2 rounded-xl border border-gray-100 shadow-xl">
                                <p className="text-[10px] text-gray-400 font-bold mb-0.5  tracking-widest">{new Date(payload[0].payload.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                <p className="text-sm font-black text-black">${payload[0].value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#00E676"
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                        strokeWidth={2.5}
                        animationDuration={800}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

              </div>
            </div>

            {/* BOTTOM SECTION: Tabs for Holding / Activity */}
            <div className="space-y-6">

              {/* Tabs Control */}
              <div className="flex items-center gap-6 border-b border-gray-100 pb-px">
                <button
                  onClick={() => setActiveTab('holdings')}
                  className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'holdings' ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Holdings
                  {activeTab === 'holdings' && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-black rounded-t-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'activity' ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Activity
                  {activeTab === 'activity' && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-black rounded-t-full" />
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="pt-2">
                {activeTab === 'holdings' ? (
                  <section className="space-y-4 animate-fadeIn">
                    {(apiHoldings.length > 0 || apiInvestments.length > 0) ? (
                      <div className="grid grid-cols-1 gap-4">
                        {apiInvestments.map((inv: any, i: number) => (
                          <AllocationCard
                            key={`inv-${i}`}
                            title={inv.projectTitle || inv.project?.title || `Investment #${inv.id?.slice(0, 6)}`}
                            statusBadge={<span className="bg-green-50 text-green-600 px-2 py-0.5 rounded-md text-[9px] font-black">{inv.status || 'active'}</span>}
                            apy={`${inv.project?.apy || inv.apy || 0}% APY · ${inv.project?.durationDays || 0}d`}
                            amount={`$${(inv.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            earnings={`+$${(inv.earnedYield || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            icon={<div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center font-black text-white text-[10px]">{(inv.projectTitle || inv.project?.title || 'P').charAt(0)}</div>}
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('loka-nav-market'));
                            }}
                          />
                        ))}
                        {apiHoldings.map((h: any, i: number) => (
                          <AllocationCard
                            key={`hold-${i}`}
                            title={h.asset}
                            apy={h.currentApy > 0 ? `${h.currentApy}% APY` : 'Available Balance'}
                            amount={`$${((h.amount || 0) * (h.currentPrice || h.avgCost || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            earnings={h.earnedYield > 0 ? `+$${(h.earnedYield).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}
                            icon={<div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center font-black text-white text-[10px]">{(h.asset || 'A').charAt(0)}</div>}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        </div>
                        <p className="text-sm text-gray-400 font-medium">No holdings yet</p>
                        <p className="text-xs text-gray-300 mt-1">Your investments will appear here</p>
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="space-y-4 animate-fadeIn">
                    {apiHistory.length > 0 ? (
                      <div className="rounded-xl overflow-hidden bg-white shadow-sm border border-gray-100">
                        {apiHistory.map((tx: any, i: number) => (
                          <ActivityItem
                            key={`tx-${i}`}
                            title={tx.type === 'INTEREST' ? 'Interest Payout' : tx.type === 'DEPOSIT' ? 'Deposit' : tx.type === 'ONCHAIN_RECEIVED' ? 'USDC Received' : tx.type === 'ONCHAIN_SENT' ? 'USDC Sent' : tx.type === 'MINT' ? 'Mint' : tx.type}
                            time={new Date(tx.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            amount={`${(tx.type === 'WITHDRAWAL' || tx.type === 'ONCHAIN_SENT') ? '-' : '+'}$${Math.abs(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            type={tx.type === 'INTEREST' ? 'INTEREST' : (tx.type === 'WITHDRAWAL' || tx.type === 'ONCHAIN_SENT') ? 'WITHDRAWAL' : 'DEPOSIT'}
                            source={tx.asset}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <p className="text-sm text-gray-400 font-medium">No activity yet</p>
                        <p className="text-xs text-gray-300 mt-1">Your transactions will appear here</p>
                      </div>
                    )}
                  </section>
                )}
              </div>

            </div>


          </>
        ) : (
          /* ============ ENTERPRISE TAB ============ */
          <div className="space-y-6 animate-fadeIn">

            {/* Empty state: not verified */}
            {!isVerified && !showVerifyWizard && (
              <div className="max-w-lg mx-auto py-20 px-6">
                <style>{`
                  @keyframes verifyFadeUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  @media (prefers-reduced-motion: reduce) {
                    .verify-animate { animation: none !important; opacity: 1 !important; }
                  }
                  .verify-animate {
                    opacity: 0;
                    animation: verifyFadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
                  }
                  .verify-step-row {
                    transition: background 0.2s, transform 0.2s cubic-bezier(0.25, 1, 0.5, 1);
                    border-radius: 12px;
                    padding: 10px 12px;
                    margin: -10px -12px;
                  }
                  .verify-step-row:hover {
                    background: oklch(97% 0.005 250);
                    transform: translateX(4px);
                  }
                  .verify-cta {
                    transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.2s;
                  }
                  .verify-cta:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px oklch(30% 0.03 260 / 0.25);
                  }
                `}</style>

                <h2 className="verify-animate text-[22px] font-bold leading-snug mb-3" style={{ color: 'oklch(25% 0.02 260)', animationDelay: '0ms' }}>
                  Complete company verification to access fundraising on Loka.
                </h2>
                <p className="verify-animate text-[13px] leading-relaxed mb-10" style={{ color: 'oklch(55% 0.01 250)', animationDelay: '80ms' }}>
                  Two simple steps — takes about 5 minutes.
                </p>

                <div className="space-y-2 mb-12">
                  {[
                    { icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>, label: 'Company Information', desc: 'Business license, profile details & website' },
                    { icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>, label: 'Connect Stripe', desc: 'Authorize read-only access to verify revenue' },
                  ].map((s, i) => (
                    <div key={i} className="verify-animate verify-step-row flex items-start gap-4" style={{ animationDelay: `${180 + i * 120}ms` }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: 'oklch(30% 0.03 260)' }}>{s.icon}</div>
                      <div className="pt-0.5">
                        <p className="text-[13px] font-semibold mb-0.5" style={{ color: 'oklch(25% 0.02 260)' }}>{s.label}</p>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'oklch(58% 0.01 250)' }}>{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="verify-animate" style={{ animationDelay: '560ms' }}>
                  <button
                    onClick={() => { setVerifyStep(0); setVerifyDone(false); setStripeConnected(false); setShowVerifyWizard(true); }}
                    className="verify-cta px-7 py-3 text-white text-[13px] font-semibold rounded-xl active:scale-[0.98] shadow-sm"
                    style={{ background: 'oklch(30% 0.03 260)' }}
                  >
                    Start Verification →
                  </button>
                  <p className="text-[11px] mt-3" style={{ color: 'oklch(72% 0.01 250)' }}>Usually takes less than 5 minutes</p>
                </div>
              </div>
            )}

            {/* Inline verification wizard (replaces modal) */}
            {showVerifyWizard && (
              <div className="max-w-lg mx-auto py-8 px-6">
                {/* Header with progress */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-[16px] font-bold" style={{ color: 'oklch(25% 0.02 260)' }}>Company Verification</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: 'oklch(58% 0.01 250)' }}>
                      {verifyDone ? 'All done — your profile is ready' : `Step ${verifyStep + 1} of ${VERIFY_TOTAL}`}
                    </p>
                  </div>
                  {!verifyDone && (
                    <button onClick={() => setShowVerifyWizard(false)} className="text-[12px] font-medium hover:underline" style={{ color: 'oklch(55% 0.01 250)' }}>
                      ← Back to overview
                    </button>
                  )}
                </div>
                {/* Progress bar */}
                {!verifyDone && (
                  <div className="h-1 bg-gray-100 rounded-full mb-8">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${((verifyStep + 1) / VERIFY_TOTAL) * 100}%`, background: 'oklch(30% 0.03 260)' }}
                    />
                  </div>
                )}

                {verifyDone ? (
                  <div className="text-center py-10">
                    <style>{`
                      @keyframes verifyCheckPop {
                        0% { transform: scale(0); opacity: 0; }
                        60% { transform: scale(1.15); }
                        100% { transform: scale(1); opacity: 1; }
                      }
                      @keyframes verifyFadeInUp {
                        from { opacity: 0; transform: translateY(8px); }
                        to { opacity: 1; transform: translateY(0); }
                      }
                      .done-check { animation: verifyCheckPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both; }
                      .done-fade { opacity: 0; animation: verifyFadeInUp 0.4s ease-out forwards; }
                    `}</style>

                    {/* Badge icon */}
                    <div className="done-check w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'oklch(96% 0.02 155)' }}>
                      <svg className="w-10 h-10" style={{ color: 'oklch(45% 0.15 155)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                    </div>

                    {/* Title */}
                    <h4 className="done-fade text-[18px] font-bold mb-1.5" style={{ color: 'oklch(25% 0.02 260)', animationDelay: '0.25s' }}>
                      Verification Complete
                    </h4>
                    <p className="done-fade text-[12px] max-w-[280px] mx-auto leading-relaxed mb-8" style={{ color: 'oklch(55% 0.01 250)', animationDelay: '0.35s' }}>
                      Your company is now a <span className="font-semibold" style={{ color: 'oklch(35% 0.02 260)' }}>Verified Issuer</span>. You can start publishing and fundraising on Loka.
                    </p>

                    {/* Verification summary card */}
                    <div className="done-fade rounded-xl border border-gray-100 overflow-hidden mb-8" style={{ animationDelay: '0.45s' }}>
                      {[
                        { label: 'Company Information', status: '✓ Complete' },
                        { label: 'Stripe Revenue', status: '✓ Connected' },
                      ].map((item, i) => (
                        <div key={i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                          <span className="text-[12px]" style={{ color: 'oklch(45% 0.01 250)' }}>{item.label}</span>
                          <span className="text-[11px] font-semibold" style={{ color: 'oklch(45% 0.12 155)' }}>{item.status}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <div className="done-fade" style={{ animationDelay: '0.55s' }}>
                      <button
                        onClick={() => { setIsVerified(true); setShowVerifyWizard(false); }}
                        className="w-full py-3.5 text-white text-[13px] font-semibold rounded-xl transition-all active:scale-[0.98] hover:shadow-lg"
                        style={{ background: 'oklch(30% 0.03 260)' }}
                      >
                        Go to Enterprise Dashboard →
                      </button>
                      <p className="text-[10px] text-center mt-3" style={{ color: 'oklch(68% 0.01 250)' }}>
                        Your badge will be visible to all investors on your profile
                      </p>
                    </div>
                  </div>
                ) : verifyStep === 0 ? (
                  /* ── Step 1: Company Information ── */
                  <div className="space-y-4">
                    <div className="mb-2">
                      <h4 className="text-[14px] font-bold" style={{ color: 'oklch(25% 0.02 260)' }}>Company Information</h4>
                      <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'oklch(58% 0.01 250)' }}>Business license, basic info and company profile</p>
                    </div>
                    {/* Company Logo Upload */}
                    <input type="file" ref={logoInputRef} className="hidden" accept=".jpg,.jpeg,.png,.svg,.webp" onChange={handleLogoUpload} />
                    <div className="flex items-center gap-4 mb-1">
                      <div
                        onClick={() => logoInputRef.current?.click()}
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 cursor-pointer border-2 border-dashed transition-all overflow-hidden ${
                          verifyData.companyLogo ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-400 bg-gray-50'
                        }`}
                      >
                        {logoUploading ? (
                          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        ) : verifyData.companyLogo ? (
                          <img src={verifyData.companyLogo} alt="Company Logo" className="w-full h-full object-cover" />
                        ) : (
                          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        )}
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-gray-700">Company Logo</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{verifyData.companyLogo ? 'Click to replace' : 'JPG, PNG, SVG · Optional'}</p>
                      </div>
                    </div>
                    {/* License Upload */}
                    <input type="file" ref={licenseInputRef} className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleLicenseUpload} />
                    <div
                      onClick={() => licenseInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${verifyData.licenseDoc ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-400'}`}
                    >
                      {licenseUploading ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          <p className="text-[12px] font-medium text-gray-500">Uploading...</p>
                        </div>
                      ) : verifyData.licenseDoc ? (
                        <>
                          <svg className="w-6 h-6 text-green-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          <p className="text-[12px] font-medium text-green-600">Business License Uploaded</p>
                          <p className="text-[10px] text-green-500 mt-1">Click to replace</p>
                        </>
                      ) : (
                        <>
                          <svg className="w-6 h-6 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                          <p className="text-[12px] font-medium text-gray-400">Upload Business License</p>
                          <p className="text-[10px] text-gray-300 mt-1">PDF, JPG, PNG up to 10MB</p>
                        </>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Company Name <span className="text-red-400">*</span></label>
                        <input value={verifyData.companyName} onChange={e => setVerifyData(prev => ({ ...prev, companyName: e.target.value }))} className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition-colors" placeholder="Loka Technologies Pte Ltd" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Country / Region <span className="text-red-400">*</span></label>
                          <input value={verifyData.country} onChange={e => setVerifyData(prev => ({ ...prev, country: e.target.value }))} className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition-colors" placeholder="Singapore" />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Registration No.</label>
                          <input value={verifyData.registrationNo} onChange={e => setVerifyData(prev => ({ ...prev, registrationNo: e.target.value }))} className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition-colors" placeholder="202312345A" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Description</label>
                        <textarea rows={2} value={verifyData.description} onChange={e => setVerifyData(prev => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition-colors resize-none" placeholder="What does your company do?" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Founded Year</label>
                          <input type="number" min="1900" max="2026" value={verifyData.foundedYear} onChange={e => setVerifyData(prev => ({ ...prev, foundedYear: e.target.value }))} className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition-colors" placeholder="2021" />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Website</label>
                          <input type="url" value={verifyData.website} onChange={e => setVerifyData(prev => ({ ...prev, website: e.target.value }))} className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition-colors" placeholder="https://..." />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Category Tags</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {['SaaS', 'AI', 'Health', 'Marketing', 'Content', 'Education', 'E-commerce', 'Fintech'].map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleCategory(tag)}
                              className={`px-2.5 py-1 text-[10px] font-semibold border rounded-full transition-all ${
                                verifyData.categories.includes(tag)
                                  ? 'border-gray-900 text-white bg-gray-900'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-900 hover:text-gray-900 hover:bg-gray-50'
                              }`}
                            >{tag}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Step 3: Connect Stripe ── */
                  <div className="space-y-4">
                    <div className="mb-2">
                      <h4 className="text-[14px] font-bold" style={{ color: 'oklch(25% 0.02 260)' }}>Connect Stripe Revenue</h4>
                      <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'oklch(58% 0.01 250)' }}>Paste your Stripe Restricted API Key to verify revenue. Investors will see live MRR and growth data.</p>
                    </div>
                    {!stripeConnected ? (
                      <div className="space-y-3">
                        {/* How-to guide */}
                        <a 
                          href="https://dashboard.stripe.com/apikeys/create?name=LokaCash&permissions[0]=rak_charge_read&permissions[1]=rak_subscription_read&permissions[2]=rak_plan_read&permissions[3]=rak_bucket_connect_read&permissions[4]=rak_file_read&permissions[5]=rak_product_read" 
                          target="_blank" 
                          rel="noreferrer" 
                          className="block bg-blue-50/70 rounded-xl p-3.5 border border-blue-100/60 transition-all hover:bg-blue-50 hover:border-blue-200/60 group cursor-pointer shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-center justify-between pointer-events-none">
                            <span className="text-[12px] font-bold text-blue-800 group-hover:underline">Click here to create a read-only API key.</span>
                            <svg className="w-3.5 h-3.5 text-blue-600 shrink-0 transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </div>
                          <div className="mt-2 text-[10.5px] text-blue-700 space-y-1.5 font-medium leading-relaxed pointer-events-none">
                            <p className="group-hover:underline">1. Scroll down and click <strong>'Create key'</strong></p>
                            <p className="group-hover:underline">2. Don't change the permissions</p>
                            <p className="group-hover:underline">3. Don't delete the key or we can't refresh revenue</p>
                          </div>
                        </a>

                        {/* API Key Input */}
                        <div>
                          <input
                            type="password"
                            value={stripeApiKeyInput}
                            onChange={e => { setStripeApiKeyInput(e.target.value); setStripeKeyError(null); }}
                            placeholder="Paste your Restricted API Key (rk_live_...)"
                            className={`w-full px-4 py-3 text-sm bg-gray-50 border rounded-xl focus:outline-none focus:ring-1 transition-all font-mono ${
                              stripeKeyError ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-gray-300'
                            } placeholder:text-gray-300`}
                          />
                          {stripeKeyError && (
                            <p className="text-[10px] text-red-500 mt-1.5 font-medium">{stripeKeyError}</p>
                          )}
                          {stripeApiKeyInput.startsWith('rk_test_') && (
                            <p className="text-[10px] text-red-500 mt-1.5 font-medium">Test keys are not allowed. Please use a live key.</p>
                          )}
                          {stripeApiKeyInput && !stripeApiKeyInput.startsWith('rk_live_') && !stripeApiKeyInput.startsWith('rk_test_') && (
                            <p className="text-[10px] text-amber-500 mt-1.5 font-medium">Key must start with rk_live_</p>
                          )}
                        </div>

                        {/* Submit Button */}
                        <button
                          onClick={async () => {
                            if (stripeApiKeyInput.startsWith('rk_test_')) {
                              setStripeKeyError('Test keys are not allowed. Please use a live Stripe Restricted API Key (starts with rk_live_)');
                              return;
                            }
                            if (!stripeApiKeyInput.startsWith('rk_live_')) {
                              setStripeKeyError('Must be a live Stripe Restricted API Key (starts with rk_live_)');
                              return;
                            }
                            setStripeConnecting(true);
                            setStripeKeyError(null);
                            try {
                              await api.submitStripeApiKey(stripeApiKeyInput);
                              setStripeConnected(true);
                              setStripeApiKeyInput('');
                              // Fetch revenue data
                              const rev = await api.getStripeRevenue();
                              if (rev && rev.connected) {
                                setStripeRevenue({ mrr: rev.mrr, last30dRev: rev.last30dRev, momGrowth: rev.momGrowth, lastSyncAt: rev.lastSyncAt });
                              }
                            } catch (err: any) {
                              setStripeKeyError(err?.message || 'Failed to verify API key');
                            } finally {
                              setStripeConnecting(false);
                            }
                          }}
                          disabled={stripeConnecting || !stripeApiKeyInput.startsWith('rk_live_')}
                          className="w-full py-3 flex items-center justify-center gap-2.5 bg-[#635BFF] text-white text-[13px] font-semibold rounded-xl hover:bg-[#4F46E5] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {stripeConnecting ? (
                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying…</>
                          ) : (
                            <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.583L20 4.114A18.22 18.22 0 0 0 12.581 2c-3.099 0-5.47 1.498-6.27 3.895-.254.754-.36 1.537-.293 2.344.065.808.318 1.565.742 2.217.854 1.318 2.296 2.089 4.044 2.695 1.927.658 3.095 1.282 3.095 2.303 0 .914-.817 1.481-2.179 1.481-1.876 0-4.153-.742-5.943-1.836l-1.756 3.404C6.05 20.148 9.02 21.5 12.311 21.5c3.408 0 6.056-1.548 6.721-4.078.181-.688.24-1.393.175-2.097-.065-.706-.283-1.384-.65-1.994-.707-1.17-2.014-1.9-4.581-2.181z" /></svg>Verify & Connect</>
                          )}
                        </button>

                        {/* Security note */}
                        <div className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          <p className="text-[10px] text-gray-500 leading-relaxed">Your key is encrypted (AES-256-GCM) before storage. We only read subscription & charge data — <strong>never modify</strong> your Stripe account. You can revoke access at any time.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100 mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            <p className="text-[11px] font-semibold text-green-700">Stripe API key connected</p>
                          </div>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Disconnect Stripe? Revenue data will be removed.')) return;
                              try {
                                await api.disconnectStripe();
                                setStripeConnected(false);
                                setStripeRevenue({ mrr: 0, last30dRev: 0, momGrowth: 0, lastSyncAt: null });
                              } catch { }
                            }}
                            className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition-colors"
                          >Disconnect</button>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Revenue Preview</p>
                          <div className="flex items-center justify-between"><span className="text-[11px] text-gray-500">MRR</span><span className="text-[12px] font-bold text-gray-900">${stripeRevenue.mrr > 0 ? stripeRevenue.mrr.toLocaleString() : 'Syncing...'}</span></div>
                          <div className="flex items-center justify-between"><span className="text-[11px] text-gray-500">Last 30d Revenue</span><span className="text-[12px] font-bold text-gray-900">${stripeRevenue.last30dRev > 0 ? stripeRevenue.last30dRev.toLocaleString() : 'Syncing...'}</span></div>
                          <div className="flex items-center justify-between"><span className="text-[11px] text-gray-500">MoM Growth</span><span className={`text-[12px] font-bold ${stripeRevenue.momGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>{stripeRevenue.momGrowth !== 0 ? `${stripeRevenue.momGrowth > 0 ? '+' : ''}${stripeRevenue.momGrowth.toFixed(1)}%` : 'Syncing...'}</span></div>
                          {stripeRevenue.lastSyncAt && <p className="text-[9px] text-gray-400 mt-1">Last synced: {new Date(stripeRevenue.lastSyncAt).toLocaleString()}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer buttons */}
                {!verifyDone && (
                  <div className="flex gap-3 mt-8">
                    {verifyStep > 0 && (
                      <button
                        onClick={() => setVerifyStep(s => s - 1)}
                        className="flex-1 py-3 text-[13px] font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                        style={{ color: 'oklch(40% 0.02 260)' }}
                      >
                        Back
                      </button>
                    )}
                    <button
                      onClick={handleNextStep}
                      disabled={verifyStep === 1 && !stripeConnected}
                      className="flex-1 py-3 text-white text-[13px] font-semibold rounded-xl transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'oklch(30% 0.03 260)' }}
                    >
                      {verifyStep === VERIFY_TOTAL - 1 ? 'Complete Verification' : 'Continue'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Verified: show company info + fundraising */}
            {isVerified && !showVerifyWizard && <>

              {/* Company Info Card */}
              <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 sm:p-6">
                {/* Header with logo */}
                <div className="flex items-start gap-4 mb-5">
                  {/* Company Logo */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 text-white text-lg font-black overflow-hidden" style={verifyData.companyLogo ? {} : { background: 'oklch(30% 0.03 260)' }}>
                    {verifyData.companyLogo ? (
                      <img src={verifyData.companyLogo} alt="Company Logo" className="w-full h-full object-cover" />
                    ) : (
                      verifyData.companyName ? verifyData.companyName.charAt(0).toUpperCase() : 'C'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-[15px] font-bold text-black truncate">{verifyData.companyName || 'Unknown Company'}</h2>
                        <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[9px] font-black rounded-full border border-green-200/50 flex items-center gap-0.5 shrink-0">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          Verified
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 relative mt-2 sm:mt-0">
                          <button
                            onClick={() => { setShowVerifyWizard(true); setVerifyDone(false); setVerifyStep(0); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            Edit
                          </button>
                          <button
                          onClick={() => navigate(`/market/startup/${verifyData.companyName.toLowerCase().replace(/\s+/g, '-')}`, {
                            state: {
                              project: {
                                name: verifyData.companyName, cat: verifyData.categories[0] || 'Uncategorized', mapped_cat: verifyData.categories[0] || 'Uncategorized',
                                tagColor: 'text-gray-700 bg-gray-50 border-gray-100', views: '—', saves: 0,
                                desc: verifyData.description || 'No description provided.',
                                rev: '$0', revGrow: '', waitlist: '0', tags: verifyData.categories.length > 0 ? verifyData.categories : ['New'],
                                logo: verifyData.companyName ? verifyData.companyName.charAt(0).toUpperCase() : 'C', color: 'from-gray-500 to-gray-700', cover: 'from-gray-900/10 to-transparent', label: '',
                                allTimeRev: '$0', mrr: '$0', founder: userProfile.name, founderFollowers: undefined,
                                websiteUrl: verifyData.website || '#', founded: verifyData.foundedYear || '-', country: verifyData.country || 'Unknown',
                                slug: verifyData.companyName.toLowerCase().replace(/\s+/g, '-'), profitMargin: '-',
                              }
                            }
                          })}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-all shrink-0"
                          style={{ color: 'oklch(40% 0.02 260)' }}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          View
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'oklch(55% 0.01 250)' }}>
                      {[verifyData.country, verifyData.foundedYear ? `Founded ${verifyData.foundedYear}` : null, verifyData.categories[0]].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gray-100 mb-1" />

                <div className="space-y-0 divide-y divide-gray-100">
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[11px] text-gray-400 font-medium">Company Name</span>
                    <span className="text-[13px] font-bold text-black">{verifyData.companyName || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[11px] text-gray-400 font-medium">Country / Region</span>
                    <span className="text-[13px] font-bold text-black">{verifyData.country || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[11px] text-gray-400 font-medium">Registration No.</span>
                    <span className="text-[13px] font-bold text-black">{verifyData.registrationNo || '-'}</span>
                  </div>
                  <div className="flex items-start justify-between py-3 gap-4">
                    <span className="text-[11px] text-gray-400 font-medium shrink-0">Description</span>
                    <span className="text-[12px] text-gray-700 text-right leading-relaxed">{verifyData.description || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[11px] text-gray-400 font-medium">Founded</span>
                    <span className="text-[13px] font-bold text-black">{verifyData.foundedYear || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[11px] text-gray-400 font-medium">Website</span>
                    {verifyData.website ? (
                      <a href={verifyData.website} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold" style={{ color: 'oklch(40% 0.08 260)' }}>{verifyData.website.replace(/^https?:\/\//, '')}</a>
                    ) : (
                      <span className="text-[13px] font-bold text-black">-</span>
                    )}
                  </div>
                  <div className="flex items-start justify-between py-3 gap-4">
                    <span className="text-[11px] text-gray-400 font-medium shrink-0">Categories</span>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {verifyData.categories.length > 0 ? verifyData.categories.map(tag => (
                        <span key={tag} className="px-2 py-0.5 text-[10px] font-semibold rounded-full border border-gray-200 text-gray-500">{tag}</span>
                      )) : <span className="text-[12px] text-gray-500">-</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 sm:gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 rounded-full border border-violet-100">
                    <span className="text-xs">🔗</span>
                    <span className="text-[10px] font-bold text-violet-600">Verified Issuer</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-full border border-green-100">
                    <span className="text-xs">🪪</span>
                    <span className="text-[10px] font-bold text-green-600">KYC Verified</span>
                  </div>
                </div>
              </section>

              {/* Fundraising Status */}
              <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 sm:p-6">
                <div className="flex items-center justify-between mb-5 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold text-gray-900">Fundraising</h2>
                      <p className="text-[10px] text-gray-400 font-medium">Company fundraising status</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                  {enterpriseApplications.length > 0 ? (
                    <span className="px-2.5 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded-full border border-green-200/50">● Active</span>
                  ) : (
                    <span className="px-2.5 py-1 bg-gray-50 text-gray-400 text-[10px] font-bold rounded-full border border-gray-200">Not Started</span>
                  )}
                </div>
                </div>

                {enterpriseApplications.length > 0 ? (
                  <div className="space-y-4">
                    {enterpriseApplications.map((app: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-bold text-gray-900">{app.projectName}</h4>
                          <span className={`px-2 py-1 text-[10px] font-bold rounded-full border ${app.status === 'in_review' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                            {app.status === 'verified' ? 'Active' : app.status === 'in_review' ? 'In Review' : 'Pending'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                            <p className="text-[10px] text-gray-400 font-medium mb-1">Target</p>
                            <p className="text-[14px] font-black text-gray-900">${(app.requestedAmount || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                            <p className="text-[10px] text-gray-400 font-medium mb-1">Raised</p>
                            <p className="text-[14px] font-black text-green-600">${((app as any)?.raisedAmount || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                            <p className="text-[10px] text-gray-400 font-medium mb-1">APY / Term</p>
                            <p className="text-[14px] font-black text-gray-900">{app.proposedApy || 0}% <span className="text-[11px] font-medium text-gray-400">{app.durationDays || 0}d</span></p>
                          </div>
                        </div>
                        {((app as any)?.raisedAmount || 0) > 0 && (
                          <div className="mb-4">
                            <div className="flex justify-between mb-1.5">
                              <span className="text-[10px] text-gray-400 font-medium">Progress</span>
                              <span className="text-[10px] font-bold text-gray-900">{Math.round((((app as any)?.raisedAmount || 0) / (app.requestedAmount || 1)) * 100)}% funded</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round((((app as any)?.raisedAmount || 0) / (app.requestedAmount || 1)) * 100)}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* State B: No fundraising yet — empty state */
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: 'oklch(96% 0.01 250)' }}>
                      <svg className="w-6 h-6" style={{ color: 'oklch(55% 0.01 250)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-[13px] font-semibold mb-1" style={{ color: 'oklch(30% 0.02 260)' }}>No active fundraising</p>
                    <p className="text-[11px] leading-relaxed max-w-[260px] mx-auto mb-5" style={{ color: 'oklch(58% 0.01 250)' }}>
                      Create your first fundraising round to start accepting investments from Loka's investor network.
                    </p>
                    <button
                      onClick={() => {
                        const toast = document.createElement('div');
                        toast.className = 'fixed top-4 right-4 z-[200] px-5 py-3 rounded-xl shadow-lg text-[13px] font-semibold text-white';
                        toast.style.background = 'oklch(30% 0.03 260)';
                        toast.style.transform = 'translateX(120%)';
                        toast.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s';
                        toast.textContent = '🚀 Coming Soon';
                        document.body.appendChild(toast);
                        requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
                        setTimeout(() => { toast.style.transform = 'translateX(120%)'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 2500);
                      }}
                      className="px-6 py-2.5 text-white text-[12px] font-semibold rounded-xl transition-all active:scale-[0.98]"
                      style={{ background: 'oklch(30% 0.03 260)' }}
                    >
                      Create Fundraising Round
                    </button>
                  </div>
                )}
              </section>

              {/* Repayment Records */}
              <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold text-gray-900">Repayment Records</h2>
                    <p className="text-[10px] text-gray-400 font-medium">Auto-deducted from revenue for investor repayments</p>
                  </div>
                </div>

                {Object.keys(enterpriseDeductions).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(enterpriseDeductions).map(([projectId, { schedule, project }]) => {
                      const paidPeriods = schedule.filter(s => s.status === 'paid');
                      const totalDeducted = paidPeriods.reduce((sum, s) => sum + s.paidAmount, 0);
                      const totalPeriods = schedule.length;
                      const overduePeriods = schedule.filter(s => s.status === 'overdue');

                      return (
                        <div key={projectId} className="border border-gray-100 rounded-2xl overflow-hidden">
                          <div className="p-4 bg-gray-50/50 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center font-black text-white text-xs shrink-0">
                                {(project.title || 'P')[0]}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-black truncate">{project.title || projectId}</h4>
                                <p className="text-[9px] text-gray-400">{paidPeriods.length}/{totalPeriods} periods deducted</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-black text-black">${totalDeducted.toLocaleString()}</p>
                              <p className="text-[9px] text-gray-400">total deducted</p>
                            </div>
                          </div>

                          {overduePeriods.length > 0 && (
                            <div className="px-4 py-2.5 bg-red-50 border-t border-red-100 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                              <p className="text-[10px] font-bold text-red-600">
                                {overduePeriods.length} period{overduePeriods.length > 1 ? 's' : ''} pending — revenue shortfall detected
                              </p>
                            </div>
                          )}

                          {paidPeriods.length > 0 && (
                            <div className="divide-y divide-gray-50">
                              {paidPeriods.slice(-5).reverse().map((s) => (
                                <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-6 h-6 rounded-md bg-violet-50 flex items-center justify-center">
                                      <svg className="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-bold text-black">Period {s.periodNumber}</p>
                                      <p className="text-[9px] text-gray-400">{s.paidAt ? new Date(s.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[11px] font-bold text-black">-${s.paidAmount.toFixed(2)}</p>
                                    <p className="text-[9px] text-gray-400">P: ${s.principalDue.toFixed(2)} + I: ${s.interestDue.toFixed(2)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-[13px] font-semibold text-gray-400 mb-1">No Repayment Records</p>
                    <p className="text-[11px] text-gray-400/80">You don't have any active repayment schedules yet.</p>
                  </div>
                )}
              </section>
            </>}
          </div>
        )}
      </div>


      {/* ── Credit Info Modal ── */}
      {showCreditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowCreditModal(false)} />
          <div className="relative bg-white rounded-[40px] shadow-2xl border border-gray-100 w-full max-w-md max-h-[90vh] overflow-y-auto animate-slideUp flex flex-col p-6 m-auto scrollbar-hide">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-black tracking-tight">Credit System</h3>
              <button
                onClick={() => setShowCreditModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-6 relative z-10 flex-1">
              {/* Score Header - Clean Text Style - More Compact */}
              <div className="flex items-center gap-5 bg-violet-600 p-6 rounded-[28px] text-white shadow-xl shadow-violet-100 relative overflow-hidden">
                {/* Decorative Pattern */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />

                <div className="relative z-10">
                  <p className="text-3xl font-black leading-none mb-1">850</p>
                  <p className="text-[9px] font-bold opacity-60 tracking-[0.2em] uppercase">Current Score</p>
                </div>

                <div className="w-px h-10 bg-white/20" />

                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <Icons.Coins className="w-5 h-5 text-white" />
                    <span className="text-sm font-black whitespace-nowrap">Believer Tier</span>
                  </div>
                  <p className="text-[10px] font-bold opacity-70 flex items-center gap-1.5">
                    150 pts until <Icons.Crown className="w-3.5 h-3.5 text-white" /> Legend
                  </p>
                </div>
              </div>

              {profileTab === 'personal' ? (
                <>
                  {/* Personal (Investors) */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase mb-1">How to Earn</p>
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl">
                      <span className="text-xl">💰</span>
                      <div className="flex-1">
                        <p className="text-xs font-black text-black leading-tight">Investment Bonus</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-1">First deposit & early bird subscription rewards</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl">
                      <span className="text-xl">⏳</span>
                      <div className="flex-1">
                        <p className="text-xs font-black text-black leading-tight">Capital Holding</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-1">Earn up to +80 pts for 30-360 day holding</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl">
                      <span className="text-xl">🔄</span>
                      <div className="flex-1">
                        <p className="text-xs font-black text-black leading-tight">Reinvestment</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-1">Roll over principal & interest for bonus pts</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-violet-600 p-5 rounded-[28px] text-white shadow-xl shadow-violet-100">
                    <p className="text-[8px] font-black text-violet-300 tracking-widest uppercase mb-3">Tier Privileges</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black">🚀 Early Access</p>
                        <p className="text-[9px] opacity-70 font-bold">6-24h head start</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black">🛡 Fee Discount</p>
                        <p className="text-[9px] opacity-70 font-bold">Down to 0.5%</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black">🎟 Reserved Alloc</p>
                        <p className="text-[9px] opacity-70 font-bold">Hot deals guaranteed</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black">⚖️ Governance</p>
                        <p className="text-[9px] opacity-70 font-bold">Vote at 150+ pts</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Enterprise (Issuers) */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase mb-1">How to Build Credit</p>
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl">
                      <span className="text-xl">✅</span>
                      <div className="flex-1">
                        <p className="text-xs font-black text-black leading-tight">Timely Repayment</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-1">Core source: on-time payout each cycle</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl">
                      <span className="text-xl">🪪</span>
                      <div className="flex-1">
                        <p className="text-xs font-black text-black leading-tight">KYC / KYB Certification</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-1">Instant +100 pts upon verification</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-violet-600 p-6 rounded-[32px] text-white shadow-xl shadow-violet-100">
                    <p className="text-[9px] font-black text-violet-300 tracking-widest uppercase mb-4">Issuer Perks</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-black">📈 LTV Boost</p>
                        <p className="text-[10px] opacity-70 font-bold">Collateral 30% &rarr; 10%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black">💎 Fee Reduction</p>
                        <p className="text-[10px] opacity-70 font-bold">Platform fee to 1%</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={() => setShowCreditModal(false)}
                className="w-full py-4 bg-black text-white rounded-2xl text-[11px] font-black tracking-widest hover:bg-gray-900 active:scale-95 transition-all"
              >
                GOT IT
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const ActionButton: React.FC<{ label: string; sub: string; icon: React.ReactNode; primary?: boolean; highlight?: boolean; onClick?: () => void }> = ({ label, sub, icon, primary, highlight, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center p-6 rounded-[32px] transition-all group w-full ${primary ? 'bg-black text-white shadow-xl hover:bg-gray-800' :
    highlight ? 'bg-white border-2 border-green-500/20 text-black shadow-lg shadow-green-500/5 hover:bg-green-50' :
      'bg-white glass text-black hover:bg-gray-50 shadow-md border-gray-100'
    }`}>
    <div className={`mb-3 transition-transform group-hover:-translate-y-1 ${primary ? 'text-white' : highlight ? 'text-green-500' : 'text-gray-400'}`}>
      {icon}
    </div>
    <span className="text-xs font-bold tracking-tight">{label}</span>
    <span className={`text-[9px] font-medium opacity-50  tracking-widest mt-1 ${primary ? 'text-gray-400' : 'text-gray-500'}`}>{sub}</span>
  </button>
);

const AllocationCard: React.FC<{
  title: string;
  desc?: string;
  apy: string;
  amount: string;
  earnings: string;
  icon: React.ReactNode;
  progress?: string;
  action?: React.ReactNode;
  onClick?: () => void;
  statusBadge?: React.ReactNode;
  creditBadge?: string;
}> = ({ title, desc, apy, amount, earnings, icon, progress, action, onClick, statusBadge }) => (
  <div onClick={onClick} className="p-4 sm:p-6 rounded-xl bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 hover:border-gray-200 transition-all cursor-pointer group shadow-sm border border-gray-100">
    <div className="flex items-center gap-3 sm:gap-5 min-w-0">
      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-black group-hover:text-white transition-all shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <h5 className="text-sm font-bold text-black truncate max-w-[140px] sm:max-w-none" title={title}>{title}</h5>
          {desc && <span className="text-[9px] font-bold text-gray-400 tracking-tighter hidden sm:inline">({desc})</span>}
          {statusBadge}
        </div>
        <p className="text-[11px] text-gray-500 font-medium mt-0.5">{apy}</p>
        {progress && <p className="text-[10px] text-orange-500 font-bold mt-1 tracking-tight">{progress}</p>}
      </div>
    </div>
    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 text-right pl-[52px] sm:pl-0">
      <div className="flex flex-col sm:items-end">
        <p className="text-sm font-bold text-black">{amount}</p>
        <div className="flex items-center gap-2 mt-0.5 leading-none">
          <p className="text-[11px] font-bold text-green-600">{earnings}</p>
        </div>
      </div>
      {action && (
        <div onClick={(e) => e.stopPropagation()}>
          {action}
        </div>
      )}
    </div>
  </div>
);

const ActivityItem: React.FC<{ title: string; time: string; amount: string; type: 'INTEREST' | 'DEPOSIT' | 'WITHDRAWAL'; source?: string; onSourceClick?: () => void }> = ({ title, time, amount, type, source, onSourceClick }) => (
  <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-50 last:border-none hover:bg-gray-50/50 transition-colors gap-3">
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${type === 'INTEREST' ? 'bg-green-50 text-green-500' : type === 'WITHDRAWAL' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-black'}`}>
        {type === 'INTEREST' ? '💰' : type === 'WITHDRAWAL' ? '⬆️' : '⬇️'}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-xs font-bold text-black">{title}</p>
          {source && (
            <>
              <span className="text-gray-300 text-[10px] hidden sm:inline">•</span>
              <span className="text-[10px] sm:text-[11px] font-medium text-gray-400">
                <span className="sm:hidden">· </span>
                <span className="hidden sm:inline">From </span>
                <span
                  onClick={onSourceClick}
                  className="font-bold text-black hover:text-blue-500 hover:underline cursor-pointer transition-colors truncate inline-block max-w-[100px] sm:max-w-none align-bottom"
                  title={source}
                >
                  {source}
                </span>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10px] text-gray-400 font-medium">{time}</p>
        </div>
      </div>
    </div>
    <span className={`text-sm font-bold shrink-0 ${type === 'INTEREST' ? 'text-green-600' : type === 'WITHDRAWAL' ? 'text-red-500' : 'text-black'}`}>{amount}</span>
  </div>
);

// ── Invitation Codes: entry (topbar or card variant) ──
const InvitationCodesTopEntry: React.FC<{ variant?: 'topbar' | 'card' }> = ({ variant = 'topbar' }) => {
  const [open, setOpen] = useState(false);
  if (!api.isAuthenticated) return null;

  if (variant === 'card') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="w-full relative overflow-hidden rounded-2xl transition-all group border border-gray-100 bg-white hover:border-green-200 hover:shadow-md"
        >
          {/* Shimmer on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
            style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(0,230,118,0.06) 50%, transparent 65%)' }} />

          <div className="relative flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-green-50">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-gray-700 leading-tight">Invite Friends</p>
                <p className="text-[10px] font-medium text-gray-400">Earn rewards for every referral</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-green-600 bg-green-50 border border-green-100">
                + New Code
              </span>
              <svg className="w-3.5 h-3.5 text-gray-300 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </button>
        {open && <InvitationCodesModal onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 bg-[#00E676]/10 hover:bg-[#00E676]/20 text-[#00C853] rounded-xl transition-all text-[11px] font-bold"
        title="Invite Friends"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        Invite
      </button>
      {open && <InvitationCodesModal onClose={() => setOpen(false)} />}
    </>
  );
};

// ── Invitation Codes Modal ──
const InvitationCodesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [codes, setCodes] = useState<Array<{ code: string; maxUses: number; useCount: number; isActive: boolean; createdAt: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    api.getMyInvitationCodes().then(setCodes).catch(() => { });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await api.generateInvitationCode();
      setCodes(prev => [{ ...result, isActive: true }, ...prev]);
    } catch (err: any) {
      alert(err?.message || 'Failed to generate code');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.2s ease' }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-[400px] rounded-[28px] shadow-2xl border border-gray-100 overflow-hidden" style={{ animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#00E676]/10 rounded-xl flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-[#00E676]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-black text-black">Invite Friends</h2>
              <p className="text-[10px] text-gray-400 font-medium">Share codes to invite people to Loka</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-all">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Code list */}
        <div className="px-6 py-4 max-h-[340px] overflow-y-auto space-y-2">
          {codes.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400 font-medium">No codes yet</p>
              <p className="text-xs text-gray-300 mt-1">Generate one to start inviting</p>
            </div>
          ) : (
            codes.map((c) => (
              <div key={c.code} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-2xl border border-gray-100 hover:border-gray-200 transition-all">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm font-black text-black font-mono tracking-widest">{c.code}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="h-1 w-16 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#00E676] rounded-full" style={{ width: `${Math.min((c.useCount / c.maxUses) * 100, 100)}%` }} />
                      </div>
                      <span className="text-[9px] text-gray-400 font-medium">{c.useCount}/{c.maxUses} used</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(c.code)}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-xl transition-all ${copiedCode === c.code
                    ? 'bg-[#00E676]/10 text-[#00C853] border border-[#00E676]/30'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-black'
                    }`}
                >
                  {copiedCode === c.code ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={handleGenerate}
            disabled={generating || codes.length >= 10}
            className="w-full py-3.5 bg-[#00E676] text-black text-sm font-black rounded-2xl hover:bg-[#00C853] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#00E676]/20"
          >
            {generating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                Generate New Code
              </>
            )}
          </button>
          {codes.length >= 10 && (
            <p className="text-[10px] text-gray-400 text-center mt-2">Maximum 10 codes per account</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Edit Profile Page ──
const EditProfilePage: React.FC<{
  profile: { name: string; avatar?: string; bio: string; twitter: string; linkedin: string; personalWebsite: string; isPublic: boolean };
  onSave: (p: any) => void;
  onClose: () => void;
  avatarUserName: string;
}> = ({ profile, onSave, onClose, avatarUserName }) => {
  const [data, setData] = useState(profile);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const response = await api.uploadFile(file);
      setData(prev => ({ ...prev, avatar: response.url }));
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="animate-fadeIn p-4 sm:p-8 md:p-10 lg:p-12 pb-28 md:pb-24 max-w-[800px] mx-auto w-full min-h-full space-y-6 pt-10">
      <button onClick={onClose} className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors focus:outline-none group mb-2">
        <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        <span className="text-sm font-bold">Back to Portfolio</span>
      </button>

      <div className="bg-white w-full rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <h2 className="text-2xl font-black text-black">Edit Profile</h2>
          <p className="text-sm text-gray-400 mt-1 font-medium">Update your personal information and links</p>
        </div>

        {/* Form Body */}
        <div className="px-8 py-8 space-y-6">
          {/* Avatar Edit Hint */}
          <div className="flex items-center gap-5">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`w-16 h-16 rounded-full ${data.avatar ? '' : 'flex items-center justify-center text-white text-xl font-bold'} relative group cursor-pointer overflow-hidden flex-shrink-0`}
              style={data.avatar ? {} : { backgroundColor: getAvatarHex(avatarUserName) }}
            >
              {data.avatar ? (
                <img src={data.avatar} className="w-full h-full object-cover" alt="Profile" />
              ) : (
                <span>{avatarUserName.charAt(0).toUpperCase()}</span>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all">
                {uploading ? (
                  <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-black">Profile Avatar</span>
              <span className="text-xs text-gray-400 font-medium">Click to upload new image (max 5MB)</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Name</label>
            <input
              type="text"
              value={data.name}
              onChange={e => setData({ ...data, name: e.target.value })}
              placeholder="Your display name"
              className="w-full py-3.5 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-black placeholder-gray-400 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Bio <span className="text-[9px] text-gray-400 lowercase">(Optional)</span></label>
            <textarea
              value={data.bio}
              onChange={e => setData({ ...data, bio: e.target.value })}
              placeholder="A short description about yourself..."
              rows={4}
              className="w-full py-3.5 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-black placeholder-gray-400 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all font-medium resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Twitter / X URL <span className="text-[9px] text-gray-400 lowercase">(Optional)</span></label>
              <input
                type="text"
                value={data.twitter}
                onChange={e => setData({ ...data, twitter: e.target.value })}
                placeholder="https://x.com/username"
                className="w-full py-3.5 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-black placeholder-gray-400 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">LinkedIn URL <span className="text-[9px] text-gray-400 lowercase">(Optional)</span></label>
              <input
                type="text"
                value={data.linkedin}
                onChange={e => setData({ ...data, linkedin: e.target.value })}
                placeholder="https://linkedin.com/in/username"
                className="w-full py-3.5 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-black placeholder-gray-400 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Other Website <span className="text-[9px] text-gray-400 lowercase">(Optional)</span></label>
            <input 
              type="text" 
              value={data.personalWebsite} 
              onChange={e => setData({ ...data, personalWebsite: e.target.value })}
              placeholder="https://your-website.com"
              className="w-full py-3.5 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-black placeholder-gray-400 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all font-medium"
            />
          </div>

          <div className="pt-4">
            <label className="flex items-center justify-between p-5 border border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-black">Public Profile</span>
                <span className="text-xs text-gray-500 font-medium mt-0.5">Display your profile on the Discover page</span>
              </div>
              <div className="relative inline-block w-12 h-7 select-none shrink-0" onClick={() => setData({ ...data, isPublic: !data.isPublic })}>
                <div className={`block w-12 h-7 rounded-full transition-colors ${data.isPublic ? 'bg-[#00E676]' : 'bg-gray-200'}`} />
                <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${data.isPublic ? 'translate-x-5' : 'translate-x-0'} shadow-sm`} />
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4">
          <button
            onClick={() => onSave(data)}
            className="w-full sm:w-auto px-10 py-3.5 bg-black text-white text-sm font-bold rounded-2xl hover:bg-gray-800 transition-all active:scale-[0.98] shadow-lg"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default Portfolio;
