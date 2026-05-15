
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';

// --- Types ---

interface GroupMember {
    id: string;
    name: string;
    role: 'issuer' | 'investor' | 'agent';
    avatar: string;
    online: boolean;
    creditScore?: number;
}

interface PollOption {
    id: string;
    text: string;
    votes: string[]; // voter IDs
}

interface Poll {
    question: string;
    options: PollOption[];
    duration: string;
    createdAt: Date;
    status: 'active' | 'ended';
}

interface GroupMessage {
    id: string;
    senderId: string;
    senderName: string;
    role: 'issuer' | 'investor' | 'agent';
    content: string;
    timestamp: Date;
    image?: string;
    poll?: Poll;
    formType?: 'entity_form' | 'kyc_link';
}

interface GroupChat {
    id: string;
    projectName: string;
    projectShort: string;
    status: 'active' | 'completed';
    members: GroupMember[];
    messages: GroupMessage[];
    unread: number;
    lastActivity: string;
    fundedAmount: string;
    apy: string;
    isBackend?: boolean; // true if loaded from API
}

// --- Mock Data ---

const mockGroups: GroupChat[] = [
    {
        id: 'app_001',
        projectName: 'Project Verification & Setup',
        projectShort: 'Apply',
        status: 'active',
        fundedAmount: '-',
        apy: '-',
        unread: 1,
        lastActivity: 'Just now',
        members: [
            { id: 'u3', name: 'You', role: 'issuer', avatar: '🧑‍💼', online: true },
            { id: 'agent_onboard', name: 'Loka Launcher', role: 'agent', avatar: '🚀', online: true },
            { id: 'kyc_verifier', name: 'KYC/AML Verifier', role: 'agent', avatar: '✅', online: true },
            { id: 'risk_assessment', name: 'Risk Assessor', role: 'agent', avatar: '🛡️', online: true },
            { id: 'contract_auditor', name: 'Contract Auditor', role: 'agent', avatar: '🔐', online: true },
        ],
        messages: [
            {
                id: `msg_${Date.now()}`,
                senderId: 'agent_onboard',
                senderName: 'Loka Launcher',
                role: 'agent',
                content: '👋 Welcome to the Loka Project Application Hub!\n\nTo list your project, you\'ll complete a **2-phase process**:\n\n🏢 **Phase 1 — Company Verification**\nUpload Business License → UBO & KYC Check → Mint Verified Issuer SBT\n\n📋 **Phase 2 — Project Application** _(unlocks after Phase 1)_\nFill project details → Connect revenue accounts → Configure collateral\n\nLet\'s start with **Phase 1: Company Verification**. Click the steps below to begin.',
                timestamp: new Date()
            }
        ]
    },
    {
        id: 'g1',
        projectName: 'ComputeDAO - GPU Expansion',
        projectShort: 'ComputeDAO',
        status: 'active',
        fundedAmount: '$500,000',
        apy: '15.5%',
        unread: 3,
        lastActivity: '2 min ago',
        members: [
            { id: 'u1', name: 'Alex Chen', role: 'issuer', avatar: '🧑‍💼', online: true },
            { id: 'u2', name: 'Sarah Kim', role: 'issuer', avatar: '👩‍💻', online: false },
            { id: 'u3', name: 'Inv-71C8', role: 'investor', avatar: '💎', online: true, creditScore: 850 },
            { id: 'u4', name: 'Inv-A3F2', role: 'investor', avatar: '🦊', online: true, creditScore: 520 },
            { id: 'u5', name: 'Inv-B8E9', role: 'investor', avatar: '🐳', online: false, creditScore: 1120 },
            { id: 'u6', name: 'Inv-5D27', role: 'investor', avatar: '🎯', online: false, creditScore: 380 },
            { id: 'agent1', name: 'Loka Agent', role: 'agent', avatar: '🤖', online: true },
        ],
        messages: [
            { id: 'm1', senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '🎉 Group created! ComputeDAO - GPU Expansion has been fully funded. All stakeholders are now connected.', timestamp: new Date(Date.now() - 86400000 * 2) },
            { id: 'm2', senderId: 'u1', senderName: 'Alex Chen', role: 'issuer', content: 'Thank you everyone for your support! We are excited to begin the GPU cluster expansion. First batch of H100s arrives next week.', timestamp: new Date(Date.now() - 86400000 * 2 + 3600000) },
            { id: 'm3', senderId: 'u3', senderName: 'Inv-71C8', role: 'investor', content: 'Great to hear! What\'s the expected timeline for the first revenue payout?', timestamp: new Date(Date.now() - 86400000) },
            { id: 'm4', senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '📊 Based on the project terms: first interest distribution is scheduled for Day 30. Current projected APY remains at 15.5%. I\'ll send automated updates as milestones are reached.', timestamp: new Date(Date.now() - 86400000 + 600000) },
            { id: 'm5', senderId: 'u2', senderName: 'Sarah Kim', role: 'issuer', content: 'We\'ve secured the data center lease. Infrastructure setup begins Monday. Will share photos of the rack installation.', timestamp: new Date(Date.now() - 3600000 * 5) },
            { id: 'm6', senderId: 'u4', senderName: 'Inv-A3F2', role: 'investor', content: 'Looking forward to it! Transparency is key 🔑', timestamp: new Date(Date.now() - 3600000 * 3) },
            { id: 'm7', senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '✅ Milestone Update: Data center lease verified externally. Doc ID: 8F2A-3B4C. Compliance check passed.', timestamp: new Date(Date.now() - 3600000 * 2) },
            {
                id: 'm_poll1', senderId: 'u1', senderName: 'Alex Chen', role: 'issuer', content: '', timestamp: new Date(Date.now() - 3600000),
                poll: {
                    question: 'Should we prioritize H100 or A100 GPUs for the first batch?',
                    options: [
                        { id: 'o1', text: 'H100 (Higher performance)', votes: ['u3', 'u4', 'u1', 'agent1'] },
                        { id: 'o2', text: 'A100 (Better cost efficiency)', votes: ['u5', 'u2'] },
                        { id: 'o3', text: 'Mix of both', votes: ['u6'] },
                    ],
                    duration: '1d',
                    createdAt: new Date(Date.now() - 3600000),
                    status: 'active',
                }
            },
            { id: 'm8', senderId: 'u1', senderName: 'Alex Chen', role: 'issuer', content: 'Hardware shipment tracking is live. We\'re on schedule for the 60-day deployment plan.', timestamp: new Date(Date.now() - 600000) },
        ]
    },
    {
        id: 'g2',
        projectName: 'Shopify Merchant Cluster X',
        projectShort: 'ShopifyMerch',
        status: 'active',
        fundedAmount: '$185,000',
        apy: '8.9%',
        unread: 0,
        lastActivity: '1 hour ago',
        members: [
            { id: 'u10', name: 'Mike Johnson', role: 'issuer', avatar: '👨‍💼', online: true },
            { id: 'u11', name: 'Inv-71C8', role: 'investor', avatar: '💎', online: true, creditScore: 850 },
            { id: 'u12', name: 'Inv-C4D5', role: 'investor', avatar: '🌟', online: false, creditScore: 210 },
            { id: 'u13', name: 'Inv-E7F8', role: 'investor', avatar: '🔮', online: false, creditScore: 670 },
            { id: 'agent2', name: 'Loka Agent', role: 'agent', avatar: '🤖', online: true },
        ],
        messages: [
            { id: 'sm1', senderId: 'agent2', senderName: 'Loka Agent', role: 'agent', content: '🎉 Group created! Shopify Merchant Cluster X has reached 93% funding and is now active.', timestamp: new Date(Date.now() - 86400000 * 5) },
            { id: 'sm2', senderId: 'u10', senderName: 'Mike Johnson', role: 'issuer', content: 'Welcome everyone! We\'re processing our first batch of receivables this week.', timestamp: new Date(Date.now() - 86400000 * 4) },
            { id: 'sm3', senderId: 'u11', senderName: 'Inv-71C8', role: 'investor', content: 'What\'s the average receivable cycle time?', timestamp: new Date(Date.now() - 86400000 * 3) },
            { id: 'sm4', senderId: 'u10', senderName: 'Mike Johnson', role: 'issuer', content: 'Typically 15-30 days for Shopify merchants. We factor at a 2-3% discount.', timestamp: new Date(Date.now() - 86400000 * 3 + 1800000) },
            { id: 'sm5', senderId: 'agent2', senderName: 'Loka Agent', role: 'agent', content: '📈 Weekly Report: $23,400 in receivables processed. Default rate: 0%. On track for projected 8.9% APY.', timestamp: new Date(Date.now() - 3600000) },
        ]
    }
];

// --- Helper ---
function formatTimeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

// --- Component ---

// --- Available Agents Catalog ---
interface AvailableAgent {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    color: string;
}

const AGENT_CATEGORIES = [
    { key: 'risk', label: 'Risk Management', icon: '🛡️' },
    { key: 'investment', label: 'Investment Analysis', icon: '📊' },
    { key: 'operations', label: 'Operations', icon: '⚙️' },
    { key: 'compliance', label: 'Compliance & Legal', icon: '📜' },
    { key: 'treasury', label: 'Treasury & Banking', icon: '🔗' },
    { key: 'social', label: 'Social & Community', icon: '💬' },
];

const AVAILABLE_AGENTS: AvailableAgent[] = [
    // Risk Management
    { id: 'risk_assessment', name: 'Risk Assessor', description: 'Real-time credit scoring & borrower risk analysis using financial data', category: 'risk', icon: '🛡️', color: 'from-red-400 to-orange-500' },
    { id: 'portfolio_risk', name: 'Portfolio Risk Monitor', description: 'Monitors concentration risk, liquidation thresholds & VaR metrics', category: 'risk', icon: '📉', color: 'from-amber-400 to-red-500' },
    { id: 'fraud_detector', name: 'Fraud Detector', description: 'ML-powered anomaly detection across transactions and wallet activities', category: 'risk', icon: '🔍', color: 'from-rose-400 to-pink-600' },
    // Investment Analysis
    { id: 'yield_optimizer', name: 'Revenue Optimizer', description: 'Identifies optimal yield strategies across banking channels', category: 'investment', icon: '💎', color: 'from-blue-400 to-indigo-500' },
    { id: 'market_analyst', name: 'Market Analyst', description: 'Asset price prediction, sentiment analysis & market trend reporting', category: 'investment', icon: '📈', color: 'from-green-400 to-emerald-500' },
    { id: 'fundamental_analyst', name: 'Fundamental Analyst', description: 'Deep-dive analysis on project financials, team & unit economics', category: 'investment', icon: '🧮', color: 'from-cyan-400 to-blue-500' },
    { id: 'arb_scanner', name: 'Arbitrage Scanner', description: 'Scans cross-chain and cross-DEX arbitrage opportunities in real-time', category: 'investment', icon: '⚡', color: 'from-yellow-400 to-amber-500' },
    // Operations
    { id: 'treasury_manager', name: 'Treasury Manager', description: 'Automated treasury rebalancing, cash flow forecasting & reporting', category: 'operations', icon: '🏦', color: 'from-violet-400 to-purple-500' },
    { id: 'milestone_tracker', name: 'Milestone Tracker', description: 'Tracks project milestones, deliverables & sends automated alerts', category: 'operations', icon: '🎯', color: 'from-teal-400 to-cyan-500' },
    { id: 'report_generator', name: 'Report Generator', description: 'Generates weekly/monthly performance reports for stakeholders', category: 'operations', icon: '📋', color: 'from-indigo-400 to-blue-500' },
    // Compliance & Legal
    { id: 'kyc_verifier', name: 'KYC/AML Verifier', description: 'Automated identity verification and anti-money laundering checks', category: 'compliance', icon: '✅', color: 'from-emerald-400 to-green-500' },
    { id: 'regulatory_monitor', name: 'Regulatory Monitor', description: 'Monitors regulatory changes across jurisdictions impacting your assets', category: 'compliance', icon: '⚖️', color: 'from-slate-400 to-gray-600' },
    { id: 'contract_auditor', name: 'Legal Document Auditor', description: 'Continuous legal contract monitoring for vulnerabilities & exploits', category: 'compliance', icon: '🔐', color: 'from-orange-400 to-red-500' },
    // Treasury & Banking
    { id: 'liquidity_monitor', name: 'Cash Flow Monitor', description: 'Tracks account liquidity, forex loss & total position health', category: 'treasury', icon: '🌊', color: 'from-sky-400 to-blue-500' },
    { id: 'gas_optimizer', name: 'Cost Optimizer', description: 'Optimizes transaction timing and network costs across payment networks', category: 'treasury', icon: '⛽', color: 'from-lime-400 to-green-500' },
    { id: 'bridge_monitor', name: 'Payment Gateway Monitor', description: 'Monitors cross-border payment gateway, delays & security incidents', category: 'treasury', icon: '🌉', color: 'from-purple-400 to-pink-500' },
    // Social & Community
    { id: 'sentiment_analyzer', name: 'Sentiment Analyzer', description: 'Tracks social media sentiment across Twitter, Discord & Telegram', category: 'social', icon: '💬', color: 'from-pink-400 to-rose-500' },
    { id: 'governance_assistant', name: 'Governance Assistant', description: 'Summarizes proposals, tracks voting results & alerts on key votes', category: 'social', icon: '🗳️', color: 'from-fuchsia-400 to-purple-500' },
];

const Groups: React.FC = () => {
    const [groups, setGroups] = useState<GroupChat[]>(mockGroups);
    const [selectedGroup, setSelectedGroup] = useState<string>(mockGroups[0].id);
    const [inputValue, setInputValue] = useState('');
    const [localMessages, setLocalMessages] = useState<Record<string, GroupMessage[]>>(() => {
        const init: Record<string, GroupMessage[]> = {};
        mockGroups.forEach(g => { init[g.id] = [...g.messages]; });
        return init;
    });
    const [showMembers, setShowMembers] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
    const [showGroupList, setShowGroupList] = useState(true);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState(['', '']);
    const [pollDuration, setPollDuration] = useState('1d');
    const [showAgentModal, setShowAgentModal] = useState(false);
    const [agentSearch, setAgentSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [addedAgents, setAddedAgents] = useState<Record<string, string[]>>(() => {
        const init: Record<string, string[]> = {};
        mockGroups.forEach(g => { init[g.id] = []; });
        return init;
    });
    const [applicationStep, setApplicationStep] = useState(0);
    const [currentUserId, setCurrentUserId] = useState<string>('u3'); // fallback
    const [loadingMessages, setLoadingMessages] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);

    const currentGroup = groups.find(g => g.id === selectedGroup)!;
    const currentMessages = localMessages[selectedGroup] || [];
    const isRealGroup = currentGroup?.isBackend === true;

    // Fetch current user profile
    useEffect(() => {
        api.getUserProfile().then(p => {
            if (p?.id) setCurrentUserId(p.id);
        }).catch(() => {});
    }, []);

    // Fetch real groups from backend and merge with demo
    useEffect(() => {
        api.getGroups().then((backendGroups: any[]) => {
            if (!Array.isArray(backendGroups) || backendGroups.length === 0) return;
            const converted: GroupChat[] = backendGroups.map((bg: any) => ({
                id: bg.id,
                projectName: bg.project?.title || bg.name || 'Group',
                projectShort: (bg.project?.title || bg.name || 'G').split(' ')[0].slice(0, 12),
                status: 'active' as const,
                members: (bg.members || []).map((m: any) => ({
                    id: m.userId,
                    name: m.userId.slice(0, 8),
                    role: m.role || 'investor',
                    avatar: m.role === 'issuer' ? '🧑‍💼' : m.role === 'agent' ? '🤖' : '💎',
                    online: false,
                })),
                messages: [],
                unread: 0,
                lastActivity: bg.lastMessage?.createdAt
                    ? formatTimeAgo(new Date(bg.lastMessage.createdAt))
                    : 'No messages',
                fundedAmount: '-',
                apy: bg.project?.apy ? `${bg.project.apy}%` : '-',
                isBackend: true,
            }));
            setGroups(prev => {
                const demoGroups = prev.filter(g => g.id.startsWith('app_') || !converted.find(c => c.id === g.id));
                return [...demoGroups, ...converted];
            });
        }).catch(() => { /* keep demo groups */ });
    }, []);

    // Load messages from backend when selecting a real group
    const loadBackendMessages = useCallback(async (groupId: string) => {
        setLoadingMessages(true);
        try {
            const resp = await api.getGroupMessages(groupId);
            const msgs: GroupMessage[] = (resp.messages || []).map((m: any) => ({
                id: m.id,
                senderId: m.userId || m.user?.id,
                senderName: m.user?.name || m.userId?.slice(0, 10) || 'Unknown',
                role: m.role || 'investor',
                content: m.content,
                timestamp: new Date(m.createdAt),
            }));
            setLocalMessages(prev => ({ ...prev, [groupId]: msgs }));
        } catch {
            // Keep whatever is there
        } finally {
            setLoadingMessages(false);
        }
    }, []);

    useEffect(() => {
        const group = groups.find(g => g.id === selectedGroup);
        if (group?.isBackend) {
            loadBackendMessages(selectedGroup);
        }
    }, [selectedGroup, groups, loadBackendMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages.length, selectedGroup]);

    // --- Image ---
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (ev) => setImagePreview(ev.target?.result as string);
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- Send Message ---
    const handleSend = async () => {
        if (!inputValue.trim() && !imagePreview) return;
        const content = inputValue.trim();
        setInputValue('');
        setImagePreview(null);

        // For real backend groups: send via API
        if (isRealGroup) {
            try {
                const saved = await api.sendGroupMessage(selectedGroup, content);
                const newMsg: GroupMessage = {
                    id: saved.id,
                    senderId: saved.userId || currentUserId,
                    senderName: saved.user?.name || 'You',
                    role: saved.role || 'investor',
                    content: saved.content,
                    timestamp: new Date(saved.createdAt),
                };
                setLocalMessages(prev => ({
                    ...prev,
                    [selectedGroup]: [...(prev[selectedGroup] || []), newMsg],
                }));
            } catch (err) {
                console.error('Failed to send message:', err);
            }
            return;
        }

        // For demo groups: local logic with agent replies
        const newMsg: GroupMessage = {
            id: `user_${Date.now()}`,
            senderId: currentUserId,
            senderName: 'Inv-71C8',
            role: 'investor',
            content,
            timestamp: new Date(),
            image: imagePreview || undefined,
        };
        setLocalMessages(prev => ({
            ...prev,
            [selectedGroup]: [...(prev[selectedGroup] || []), newMsg],
        }));

        if (content || imagePreview) {
            setTimeout(() => {
                const replies = getAgentReplies(content, imagePreview !== null, selectedGroup);
                if (replies.length > 0) {
                    const newReplies = replies.map((r, idx) => ({
                        ...r,
                        id: `agent_${Date.now()}_${idx}`,
                        timestamp: new Date(Date.now() + idx * 500)
                    }));
                    setLocalMessages(prev => ({
                        ...prev,
                        [selectedGroup]: [...(prev[selectedGroup] || []), ...newReplies],
                    }));
                }
            }, 1200);
        }
    };

    // --- Delete Message ---
    const handleDeleteMessage = async (msgId: string) => {
        if (isRealGroup) {
            try {
                await api.deleteGroupMessage(selectedGroup, msgId);
            } catch (err) {
                console.error('Failed to delete message:', err);
                return;
            }
        }
        setLocalMessages(prev => ({
            ...prev,
            [selectedGroup]: (prev[selectedGroup] || []).filter(m => m.id !== msgId),
        }));
    };

    // --- Poll ---
    const handlePostPoll = () => {
        const validOptions = pollOptions.filter(o => o.trim());
        if (!pollQuestion.trim() || validOptions.length < 2) return;
        const pollMsg: GroupMessage = {
            id: `poll_${Date.now()}`,
            senderId: currentUserId,
            senderName: 'Inv-71C8',
            role: 'investor',
            content: '',
            timestamp: new Date(),
            poll: {
                question: pollQuestion.trim(),
                options: validOptions.map((text, i) => ({
                    id: `po_${Date.now()}_${i}`,
                    text: text.trim(),
                    votes: [],
                })),
                duration: pollDuration,
                createdAt: new Date(),
                status: 'active',
            },
        };
        setLocalMessages(prev => ({
            ...prev,
            [selectedGroup]: [...(prev[selectedGroup] || []), pollMsg],
        }));
        setShowPollModal(false);
        setPollQuestion('');
        setPollOptions(['', '']);
        setPollDuration('1d');
    };

    const handleVote = (msgId: string, optionId: string) => {
        setLocalMessages(prev => {
            const msgs = prev[selectedGroup] || [];
            return {
                ...prev,
                [selectedGroup]: msgs.map(m => {
                    if (m.id !== msgId || !m.poll) return m;
                    const alreadyVoted = m.poll.options.some(o => o.votes.includes(currentUserId));
                    if (alreadyVoted) return m;
                    return {
                        ...m,
                        poll: {
                            ...m.poll,
                            options: m.poll.options.map(o =>
                                o.id === optionId ? { ...o, votes: [...o.votes, currentUserId] } : o
                            ),
                        },
                    };
                }),
            };
        });
    };

    const getAgentReplies = (msg: string, hasImage: boolean, groupId: string): Omit<GroupMessage, 'id' | 'timestamp'>[] => {
        const lower = msg.toLowerCase();

        // Application Hub logic
        if (groupId.startsWith('app_')) {
            if (hasImage || lower.includes('license') || lower.includes('upload')) {
                return [{ senderId: 'kyc_verifier', senderName: 'KYC/AML Verifier', role: 'agent', content: '📄 **Business License received.** Proceeding with Ultimate Beneficial Owner (UBO) check.\n\nPlease declare all shareholders holding >25% and provide passport/ID scans for KYC verification.' }];
            }
            if (lower.includes('kyc') || lower.includes('passport') || lower.includes('shareholder') || lower.includes('id')) {
                return [{ senderId: 'kyc_verifier', senderName: 'KYC/AML Verifier', role: 'agent', content: '✅ **KYC & UBO Check Passed.** Third-party manual review completed. Issuing **"Verified Issuer" Certificate** to your account. You now have permission to create asset pools and initiate fundraising.\n\nLet\'s move to Step 2: **Project Details**.\nPlease provide your project name, description, website, and target financing parameters: Target Amount (e.g., $100,000 USD), Minimum Start Amount (e.g. $50,000), Duration (7-90 days), and APY rate/Repayment cycle.' }];
            }
            if (lower.includes('amount') || lower.includes('100,000') || lower.includes('usdc') || lower.includes('usd') || lower.includes('target') || lower.includes('apy')) {
                return [{ senderId: 'risk_assessment', senderName: 'Risk Assessor', role: 'agent', content: '📊 Project parameters logged. \n\nNext, we need to perform a **Revenue Review**. Please connect your payment processors (Stripe/PayPal/Shopify/AWS) or bank accounts to provide the last 6 months of cash flow history.' }];
            }
            if (lower.includes('connect') || lower.includes('stripe') || lower.includes('paypal') || lower.includes('bank') || lower.includes('.bank.')) {
                return [
                    { senderId: 'contract_auditor', senderName: 'Contract Auditor', role: 'agent', content: '🔗 Revenue API securely connected. Partner API linked and Cash Flow Takeover agreement drafted. Validating 6-month cash flow...' },
                    { senderId: 'risk_assessment', senderName: 'Risk Assessor', role: 'agent', content: '✅ Verification successful! Healthy cash flow detected.\n\nFinally, let\'s configure the **Collateral** (10-30% required). Please provide your physical assets or account receivables contract as collateral.' }
                ];
            }
            if (lower.includes('collateral') || lower.includes('confirm') || lower.includes('asset')) {
                return [{ senderId: 'agent_onboard', senderName: 'Loka Launcher', role: 'agent', content: '🎉 **Project Application Complete!** \n\nCollateral locked. The escrow agreement has been finalized and the cash flow takeover agreement is active. Your project is now listed in the Market and available for investors. Good luck! 🚀' }];
            }
            return [{ senderId: 'agent_onboard', senderName: 'Loka Launcher', role: 'agent', content: 'I am here to help you apply. Please follow the steps: Upload License -> KYC -> Project Details -> Revenue Connect -> Collateral. What would you like to do next?' }];
        }

        // Default logic for other groups
        if (lower.includes('status') || lower.includes('update')) return [{ senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '📊 Project Status: All milestones on track. Next payout in 12 days. No anomalies detected.' }];
        if (lower.includes('risk') || lower.includes('safe')) return [{ senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '🛡️ Risk Assessment: Current risk level is LOW. Collateral ratio at 1.35x. All compliance checks passed.' }];
        if (lower.includes('revenue') || lower.includes('earning')) return [{ senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '💰 Revenue Update: Estimated monthly revenue at $12,400. Running above projections by 8.2%.' }];
        if (lower.includes('when') || lower.includes('payout')) return [{ senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '📅 Next interest distribution: scheduled for March 15, 2026. Amount will be proportional to your holding.' }];
        return [{ senderId: 'agent1', senderName: 'Loka Agent', role: 'agent', content: '👋 Thanks for your message! I\'m monitoring this project 24/7. Feel free to ask about project status, risk assessment, revenue updates, or payout schedules.' }];
    };

    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'issuer': return <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black rounded-md">Issuer</span>;
            case 'agent': return <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[9px] font-black rounded-md">AI Agent</span>;
            case 'investor': return <span className="px-1.5 py-0.5 bg-green-50 text-green-600 text-[9px] font-black rounded-md">Investor</span>;
            default: return null;
        }
    };

    const getMsgBubbleStyle = (role: string, isMe: boolean) => {
        if (isMe) return 'bg-black text-white rounded-2xl rounded-br-md';
        if (role === 'agent') return 'bg-gradient-to-br from-purple-50 to-blue-50 text-black border border-purple-100/50 rounded-2xl rounded-bl-md';
        if (role === 'issuer') return 'bg-blue-50 text-black border border-blue-100/50 rounded-2xl rounded-bl-md';
        return 'bg-gray-100 text-black rounded-2xl rounded-bl-md';
    };

    const isAppGroup = selectedGroup.startsWith('app_');

    // Phase 1: Company Verification (3 steps)
    const PHASE1_STEPS = [
        { title: 'Legal Entity Certification', desc: 'Fill in company info & upload business license and address proof.', icon: '📄', agent: 'KYC/AML Verifier' },
        { title: 'KYC Identity Verification', desc: 'Complete KYC verification for key shareholders and legal representative.', icon: '🪪', agent: 'KYC/AML Verifier' },
        { title: 'Review & Verify Issuer Identity', desc: 'Third-party review, then issue your Verified Issuer credential.', icon: '🔗', agent: 'KYC/AML Verifier' },
    ];

    // Phase 2: Project Application (3 steps)
    const PHASE2_STEPS = [
        { title: 'Project Details & Financing Terms', desc: 'Fill in project info, set target amount, duration, APY and repayment cycle.', icon: '📋', agent: 'Risk Assessor' },
        { title: 'Revenue Account Verification', desc: 'Connect payment accounts and provide 6-month cash flow history.', icon: '💳', agent: 'Contract Auditor' },
        { title: 'Collateral & Cash Flow Takeover', desc: 'Provide 10-30% collateral value and configure automated revenue takeover.', icon: '🔐', agent: 'Contract Auditor' },
    ];

    const currentPhase = applicationStep < PHASE1_STEPS.length ? 1 : 2;
    const currentPhaseSteps = currentPhase === 1 ? PHASE1_STEPS : PHASE2_STEPS;
    const phaseOffset = currentPhase === 1 ? 0 : PHASE1_STEPS.length;
    const totalSteps = PHASE1_STEPS.length + PHASE2_STEPS.length;
    const allDone = applicationStep >= totalSteps;

    // Entity form state
    const [entityForm, setEntityForm] = useState({ companyName: '', country: '', regNumber: '', address: '' });
    const [entityFormSubmitted, setEntityFormSubmitted] = useState(false);
    const [progressCollapsed, setProgressCollapsed] = useState(false);

    const handleStepAction = (globalIdx: number) => {
        if (globalIdx !== applicationStep) return;

        const isPhase1 = globalIdx < PHASE1_STEPS.length;
        const step = isPhase1 ? PHASE1_STEPS[globalIdx] : PHASE2_STEPS[globalIdx - PHASE1_STEPS.length];

        const agentMap: Record<string, { senderId: string; senderName: string }> = {
            'KYC/AML Verifier': { senderId: 'kyc_verifier', senderName: 'KYC/AML Verifier' },
            'Risk Assessor': { senderId: 'risk_assessment', senderName: 'Risk Assessor' },
            'Contract Auditor': { senderId: 'contract_auditor', senderName: 'Contract Auditor' },
        };
        const agent = agentMap[step.agent] || { senderId: 'agent_onboard', senderName: 'Loka Launcher' };

        // Step 0: send form message
        if (globalIdx === 0) {
            const formMsg: GroupMessage = {
                id: `step_${Date.now()}`,
                senderId: agent.senderId,
                senderName: agent.senderName,
                role: 'agent',
                content: '📄 Please fill in your company information below:',
                timestamp: new Date(),
                formType: 'entity_form',
            };
            setLocalMessages(prev => ({
                ...prev,
                [selectedGroup]: [...(prev[selectedGroup] || []), formMsg],
            }));
            // Don't advance step yet — wait for form submission
            return;
        }

        // Step 1: KYC link only
        if (globalIdx === 1) {
            const kycMsg: GroupMessage = {
                id: `step_${Date.now()}`,
                senderId: agent.senderId,
                senderName: agent.senderName,
                role: 'agent',
                content: '',
                timestamp: new Date(),
                formType: 'kyc_link',
            };
            setLocalMessages(prev => ({
                ...prev,
                [selectedGroup]: [...(prev[selectedGroup] || []), kycMsg],
            }));
            setApplicationStep(prev => Math.min(prev + 1, totalSteps));
            return;
        }

        // Other steps: prompt messages
        const stepPrompts: Record<number, string> = {
            2: '🔗 **Step 3: Review & Verify Issuer Identity**\n\nYour documents are being reviewed by our third-party compliance partner.\n\nOnce approved, we will issue a **"Verified Issuer" Certificate** to your connected account. This Certificate grants you permission to:\n• Create asset pools\n• Initiate fundraising campaigns\n• Withdraw funds\n\n⏳ Please wait for verification to complete...',
            3: '📋 **Step 4: Project Details & Financing Terms**\n\nPlease provide your project information:\n\n• **Project Name** & **Description**\n• **Links**: GitHub, Twitter/X, LinkedIn, Official Website\n• **Project Vision** & **Founder Info** (name, photo)\n\nThen set your financing parameters:\n• 💰 **Target Amount**: e.g. $100,000 (USD)\n• 📊 **Minimum Start Amount**: e.g. $50,000\n• ⏱ **Duration**: 7–90 days (e.g. 60 days)\n• 📈 **Promised APY**: xx%\n• 🔄 **Repayment Cycle**: 1–12 months (monthly)',
            4: '💳 **Step 5: Revenue Account Verification**\n\nPlease connect your revenue accounts and provide **6 months** of transaction history:\n\n**Payment Processors** (connect via API):\n• Stripe, PayPal, Shopify, or AWS\n\n**Bank Accounts**:\n• Corporate bank account\n• Designated receiver account\n\nClick the button below to securely connect your accounts, or paste your banking details in the chat.',
            5: '🔐 **Step 6: Collateral & Cash Flow Takeover**\n\nFinal step! Please configure:\n\n• **Collateral** (10–30% of target amount):\n  - Physical assets (real estate, equipment)\n  - Off-chain receivables contracts\n\n• **Cash Flow Takeover Setup**:\n  - Connect via Stripe Connect or PayPal Partner API\n  - Set your payment provider\'s receiving account to the Loka escrow account\n\nOnce configured, your project will be reviewed and listed on the Market! 🚀',
        };

        const replyMsg: GroupMessage = {
            id: `step_${Date.now()}`,
            senderId: agent.senderId,
            senderName: agent.senderName,
            role: 'agent',
            content: stepPrompts[globalIdx] || 'Please complete this step.',
            timestamp: new Date(),
        };
        setLocalMessages(prev => ({
            ...prev,
            [selectedGroup]: [...(prev[selectedGroup] || []), replyMsg],
        }));
        setApplicationStep(prev => Math.min(prev + 1, totalSteps));
    };

    const handleEntityFormSubmit = () => {
        if (!entityForm.companyName || !entityForm.country || !entityForm.regNumber || !entityForm.address) return;
        setEntityFormSubmitted(true);

        // Send user's filled data as their message
        const userMsg: GroupMessage = {
            id: `user_entity_${Date.now()}`,
            senderId: currentUserId,
            senderName: 'You',
            role: 'issuer',
            content: `🏢 Company Registration Submitted:\n• Company: ${entityForm.companyName}\n• Country: ${entityForm.country}\n• Reg No: ${entityForm.regNumber}\n• Address: ${entityForm.address}`,
            timestamp: new Date(),
        };

        // Agent confirmation
        const confirmMsg: GroupMessage = {
            id: `confirm_entity_${Date.now()}`,
            senderId: 'kyc_verifier',
            senderName: 'KYC/AML Verifier',
            role: 'agent',
            content: '✅ **Company information received and validated.** Registration details and uploaded documents have been recorded. Proceeding to KYC verification.',
            timestamp: new Date(),
        };

        setLocalMessages(prev => ({
            ...prev,
            [selectedGroup]: [...(prev[selectedGroup] || []), userMsg, confirmMsg],
        }));
        setApplicationStep(prev => Math.min(prev + 1, totalSteps));
    };

    const renderEntityForm = (submitted: boolean) => {
        if (submitted || entityFormSubmitted) {
            return (
                <div className="w-full max-w-[420px] bg-white rounded-2xl border border-green-200 shadow-sm p-4">
                    <div className="flex items-center gap-2">
                        <span className="text-green-500 text-lg">✅</span>
                        <p className="text-xs font-bold text-green-700">Company information submitted successfully.</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="w-full max-w-[420px] bg-white rounded-2xl border border-violet-200 shadow-sm overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-base">🏢</span>
                        <h4 className="text-xs font-black text-black">Legal Entity Certification</h4>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Company Name *</label>
                            <input
                                type="text"
                                value={entityForm.companyName}
                                onChange={e => setEntityForm(prev => ({ ...prev, companyName: e.target.value }))}
                                placeholder="Registered legal name"
                                className="w-full mt-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 transition-all"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Country / Region *</label>
                                <input
                                    type="text"
                                    value={entityForm.country}
                                    onChange={e => setEntityForm(prev => ({ ...prev, country: e.target.value }))}
                                    placeholder="e.g. Singapore"
                                    className="w-full mt-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Registration No. *</label>
                                <input
                                    type="text"
                                    value={entityForm.regNumber}
                                    onChange={e => setEntityForm(prev => ({ ...prev, regNumber: e.target.value }))}
                                    placeholder="e.g. 202312345A"
                                    className="w-full mt-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Registered Address *</label>
                            <input
                                type="text"
                                value={entityForm.address}
                                onChange={e => setEntityForm(prev => ({ ...prev, address: e.target.value }))}
                                placeholder="Full registered address"
                                className="w-full mt-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 transition-all"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-2.5 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all">
                                <span className="text-lg">📎</span>
                                <p className="text-[10px] font-bold text-gray-500 mt-0.5">Business License</p>
                                <p className="text-[9px] text-gray-400">PDF or Image</p>
                            </div>
                            <div className="p-2.5 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all">
                                <span className="text-lg">📎</span>
                                <p className="text-[10px] font-bold text-gray-500 mt-0.5">Address Proof</p>
                                <p className="text-[9px] text-gray-400">Utility bill / Bank stmt</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                    <button
                        onClick={handleEntityFormSubmit}
                        disabled={!entityForm.companyName || !entityForm.country || !entityForm.regNumber || !entityForm.address}
                        className="w-full py-2 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                        Submit Company Information
                    </button>
                </div>
            </div>
        );
    };

    const renderKycLink = () => (
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-violet-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🪪</span>
                <h4 className="text-xs font-black text-black">KYC Identity Verification</h4>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
                Core shareholders and legal representatives need to complete identity verification (passport/ID upload + facial recognition).
            </p>
            <a
                href="https://kyc.loka.finance"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-violet-600 to-blue-500 text-white text-xs font-bold rounded-lg hover:from-violet-700 hover:to-blue-600 transition-all active:scale-[0.98] shadow-sm"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                Go to KYC Verification Portal
            </a>
            <p className="text-[9px] text-gray-400 mt-2 text-center">Powered by Loka’s third-party compliance partner</p>
        </div>
    );

    const renderApplicationCard = () => {
        if (!isAppGroup) return null;

        // Phase transition: show congrats message when Phase 1 just completed
        const phase1Complete = applicationStep >= PHASE1_STEPS.length;

        return (
            <div className="mx-6 mb-4 bg-gradient-to-br from-violet-50 via-white to-blue-50 border border-violet-100/60 rounded-2xl p-5 shadow-sm">
                {/* Header - clickable to toggle */}
                <div
                    className="flex items-center gap-2 mb-1 cursor-pointer select-none"
                    onClick={() => setProgressCollapsed(prev => !prev)}
                >
                    <span className="text-base">{currentPhase === 1 ? '🏢' : '📋'}</span>
                    <h3 className="text-sm font-black text-black">
                        {allDone ? 'Application Complete!' : currentPhase === 1 ? 'Phase 1 — Company Verification' : 'Phase 2 — Project Application'}
                    </h3>
                    <span className="text-[10px] font-bold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full">
                        {Math.min(applicationStep, totalSteps)}/{totalSteps}
                    </span>
                    <svg className={`w-4 h-4 ml-auto text-gray-400 transition-transform duration-200 ${progressCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {!progressCollapsed && (
                    <p className="text-[10px] text-gray-400 font-medium mb-4">
                        {allDone ? 'Your project is now live on the Market.' : currentPhase === 1 ? 'Verify your legal entity to unlock project application.' : 'Company verified ✅ — Now configure your project details.'}
                    </p>
                )}

                {/* Steps for current phase */}
                {!progressCollapsed && (
                    <div className="space-y-2">
                        {currentPhaseSteps.map((step, localIdx) => {
                            const globalIdx = phaseOffset + localIdx;
                            const isDone = globalIdx < applicationStep;
                            const isCurrent = globalIdx === applicationStep;
                            const isLocked = globalIdx > applicationStep;
                            return (
                                <button
                                    key={globalIdx}
                                    onClick={(e) => { e.stopPropagation(); handleStepAction(globalIdx); }}
                                    disabled={!isCurrent}
                                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all ${isDone ? 'bg-green-50 border border-green-200/60' :
                                        isCurrent ? 'bg-white border-2 border-violet-300 shadow-md shadow-violet-100/50 hover:shadow-lg cursor-pointer' :
                                            'bg-gray-50/50 border border-gray-100 opacity-50'
                                        }`}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${isDone ? 'bg-green-100' : isCurrent ? 'bg-violet-100' : 'bg-gray-100'}`}>
                                        {isDone ? '✅' : isLocked ? '🔒' : step.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-bold ${isDone ? 'text-green-700 line-through' : isCurrent ? 'text-black' : 'text-gray-400'}`}>{step.title}</p>
                                        <p className={`text-[10px] font-medium mt-0.5 truncate ${isDone ? 'text-green-500' : isCurrent ? 'text-gray-500' : 'text-gray-300'}`}>{isDone ? 'Completed' : step.desc}</p>
                                    </div>
                                    {isCurrent && (
                                        <div className="px-3 py-1 bg-violet-600 text-white text-[10px] font-bold rounded-lg shrink-0 hover:bg-violet-700 transition-colors">
                                            Start
                                        </div>
                                    )}
                                    {isDone && (
                                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Phase 1 complete unlock hint */}
                {!progressCollapsed && phase1Complete && currentPhase === 2 && applicationStep === PHASE1_STEPS.length && (
                    <div className="mt-3 p-3 bg-violet-50 border border-violet-200 rounded-xl text-center">
                        <p className="text-xs font-bold text-violet-700">🎉 Company Verified! Phase 2 is now unlocked.</p>
                    </div>
                )}

                {/* All done */}
                {!progressCollapsed && allDone && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                        <p className="text-xs font-bold text-green-700">🎉 All steps completed! Your project is now live on the Market.</p>
                    </div>
                )}

                {/* Phase 2 teaser when still in Phase 1 */}
                {!progressCollapsed && currentPhase === 1 && !allDone && (
                    <div className="mt-3 p-2.5 bg-gray-50 border border-gray-100 rounded-xl flex items-center gap-2 opacity-60">
                        <span className="text-sm">🔒</span>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400">Phase 2 — Project Application</p>
                            <p className="text-[9px] text-gray-300 font-medium">Complete company verification to unlock</p>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // --- Render Poll Card ---
    const renderPoll = (poll: Poll, msgId: string) => {
        const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
        const hasVoted = poll.options.some(o => o.votes.includes(currentUserId));
        const maxVotes = Math.max(...poll.options.map(o => o.votes.length));
        return (
            <div className="w-full max-w-[380px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Poll Header */}
                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        <span className="text-[10px] font-bold text-blue-500 tracking-wide uppercase">Poll</span>
                    </div>
                    <h4 className="text-sm font-bold text-black leading-snug">{poll.question}</h4>
                </div>
                {/* Options */}
                <div className="px-5 pb-2 space-y-2">
                    {poll.options.map(option => {
                        const pct = totalVotes > 0 ? Math.round((option.votes.length / totalVotes) * 100) : 0;
                        const isLeading = option.votes.length === maxVotes && maxVotes > 0;
                        const iVoted = option.votes.includes(currentUserId);
                        return (
                            <button
                                key={option.id}
                                onClick={() => !hasVoted && handleVote(msgId, option.id)}
                                disabled={hasVoted}
                                className={`w-full relative rounded-xl overflow-hidden transition-all text-left ${hasVoted ? 'cursor-default' : 'cursor-pointer hover:shadow-md active:scale-[0.99]'
                                    } ${iVoted ? 'ring-2 ring-blue-400' : ''}`}
                            >
                                {/* Background bar */}
                                <div className="absolute inset-0 rounded-xl bg-gray-50" />
                                {hasVoted && (
                                    <div
                                        className={`absolute inset-y-0 left-0 rounded-xl transition-all duration-700 ${isLeading ? 'bg-blue-100' : 'bg-gray-100'}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                )}
                                <div className="relative flex items-center justify-between px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {!hasVoted && (
                                            <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                                        )}
                                        {hasVoted && iVoted && (
                                            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        )}
                                        {hasVoted && !iVoted && (
                                            <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
                                        )}
                                        <span className={`text-[13px] truncate ${isLeading && hasVoted ? 'font-bold text-black' : 'font-medium text-gray-700'}`}>
                                            {option.text}
                                        </span>
                                        {isLeading && hasVoted && totalVotes > 1 && (
                                            <span className="text-sm">🏆</span>
                                        )}
                                    </div>
                                    {hasVoted && (
                                        <span className={`text-sm font-black shrink-0 ml-3 ${isLeading ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {pct}%
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
                {/* Footer */}
                <div className="px-5 py-3 flex items-center justify-between border-t border-gray-50">
                    <span className="text-[11px] text-gray-400 font-medium">{totalVotes} voted</span>
                    <span className={`text-[11px] font-bold ${poll.status === 'ended' ? 'text-red-400' : 'text-green-500'}`}>
                        {poll.status === 'ended' ? 'Ended' : `${poll.duration} remaining`}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-full overflow-hidden animate-fadeIn">
            {/* --- Poll Modal --- */}
            {showPollModal && (
                <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4" onClick={() => setShowPollModal(false)}>
                    <div className="bg-white rounded-3xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <h3 className="text-xl font-black text-black">Create Poll</h3>
                            <p className="text-xs text-gray-400 mt-1">Ask the group to vote on a decision</p>

                            {/* Question */}
                            <div className="mt-6">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Question</label>
                                <input
                                    type="text"
                                    value={pollQuestion}
                                    onChange={e => setPollQuestion(e.target.value)}
                                    placeholder="What would you like to ask?"
                                    className="w-full mt-2 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                                />
                            </div>

                            {/* Options */}
                            <div className="mt-5">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Options</label>
                                <div className="mt-2 space-y-2">
                                    {pollOptions.map((opt, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={e => {
                                                    const next = [...pollOptions];
                                                    next[i] = e.target.value;
                                                    setPollOptions(next);
                                                }}
                                                placeholder={`Option ${i + 1}`}
                                                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                                            />
                                            {pollOptions.length > 2 && (
                                                <button
                                                    onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                                                    className="w-8 h-8 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {pollOptions.length < 6 && (
                                    <button
                                        onClick={() => setPollOptions([...pollOptions, ''])}
                                        className="mt-2 text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                        Add Option
                                    </button>
                                )}
                            </div>

                            {/* Duration */}
                            <div className="mt-5">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Duration</label>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {['1h', '2h', '6h', '12h', '1d', '2d', '3d'].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setPollDuration(d)}
                                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${pollDuration === d
                                                ? 'bg-black text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                }`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 mt-8">
                                <button
                                    onClick={() => setShowPollModal(false)}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePostPoll}
                                    disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-black hover:bg-gray-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                                >
                                    Post Poll
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Left: Group List --- */}
            <div className={`${showGroupList ? 'flex' : 'hidden'} md:flex w-full md:w-80 border-r border-gray-100 flex-col bg-white shrink-0 absolute inset-0 z-30 md:relative md:z-auto`}>
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black text-black tracking-tight">Groups</h2>
                        <p className="text-[11px] text-gray-400 font-medium mt-1">Project stakeholder channels</p>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {groups.map(group => {
                        const isApp = group.id.startsWith('app_');
                        return (
                            <button
                                key={group.id}
                                onClick={() => { setSelectedGroup(group.id); setShowGroupList(false); }}
                                className={`w-full text-left p-4 border-b transition-all ${isApp
                                    ? `border-violet-100/50 ${selectedGroup === group.id ? 'bg-gradient-to-r from-violet-50 to-blue-50 border-r-2 border-r-violet-500' : 'bg-gradient-to-r from-violet-50/30 to-transparent hover:from-violet-50/60'}`
                                    : `border-gray-50 hover:bg-gray-50 ${selectedGroup === group.id ? 'bg-green-50/50 border-r-2 border-r-green-500' : ''}`
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0 shadow-sm ${isApp ? 'bg-gradient-to-br from-violet-500 to-blue-500' : 'bg-gradient-to-br from-green-400 to-emerald-500'
                                            }`}>
                                            {isApp ? '🚀' : group.projectShort.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <h3 className="text-xs font-bold text-black truncate">{group.projectName}</h3>
                                                {isApp && <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[8px] font-black rounded-md shrink-0">NEW</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <span className="text-[10px] text-gray-400 font-medium">{group.members.length} agents</span>
                                                <span className="text-gray-300">·</span>
                                                <span className="text-[10px] text-gray-400 font-medium">{group.lastActivity}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {group.unread > 0 && (
                                        <span className={`text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 shrink-0 ${isApp ? 'bg-violet-500 text-white' : 'bg-black text-white'}`}>
                                            {group.unread}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* --- Right: Chat Area --- */}
            <div className={`${!showGroupList ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0`}>
                {/* Chat Header */}
                <div className={`px-4 sm:px-6 py-4 border-b flex items-center justify-between shrink-0 ${isAppGroup ? 'bg-gradient-to-r from-violet-50/50 to-blue-50/30 border-violet-100/50' : 'bg-white border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowGroupList(true)} className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${isAppGroup ? 'bg-gradient-to-br from-violet-500 to-blue-500 text-white' : 'bg-gradient-to-br from-green-400 to-emerald-500 text-white'}`}>
                            {isAppGroup ? '🚀' : currentGroup.projectShort.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-black truncate">{currentGroup.projectName}</h3>
                            <div className="hidden sm:flex items-center gap-2 mt-0.5">
                                {isAppGroup ? (
                                    <>
                                        <span className="text-[10px] text-violet-500 font-bold">Step {Math.min(applicationStep + 1, totalSteps)} of {totalSteps}</span>
                                        <span className="text-gray-300">·</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{currentGroup.members.length} agents assisting</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[10px] text-gray-400 font-medium">{currentGroup.fundedAmount} funded</span>
                                        <span className="text-gray-300">·</span>
                                        <span className="text-[10px] text-green-600 font-bold">{currentGroup.apy} APY</span>
                                        <span className="text-gray-300">·</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{currentGroup.members.length} members</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowMembers(!showMembers)}
                        className={`p-2 rounded-xl transition-colors ${showMembers ? 'bg-gray-100 text-black' : 'text-gray-400 hover:text-black hover:bg-gray-50'}`}
                        title="Toggle Members"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </button>
                </div>

                {/* Chat Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Messages */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4">
                            {currentMessages.map((msg, i) => {
                                const isMe = msg.senderId === currentUserId;
                                const showAvatar = i === 0 || currentMessages[i - 1].senderId !== msg.senderId;
                                return (
                                    <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} group/msg`}>
                                        {showAvatar ? (
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${msg.role === 'agent' ? 'bg-gradient-to-br from-purple-400 to-blue-500 shadow-sm' : msg.role === 'issuer' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                                {msg.role === 'agent' ? '🤖' : msg.role === 'issuer' ? '🧑‍💼' : '💎'}
                                            </div>
                                        ) : (
                                            <div className="w-8 shrink-0" />
                                        )}
                                        <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                                            {showAvatar && (
                                                <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                                    <span className="text-[11px] font-bold text-gray-700">{msg.senderName}</span>
                                                    {getRoleBadge(msg.role)}
                                                </div>
                                            )}
                                            {/* Poll */}
                                            {msg.poll ? (
                                                renderPoll(msg.poll, msg.id)
                                            ) : msg.formType === 'entity_form' ? (
                                                <div>
                                                    <div className={`px-4 py-2.5 text-[13px] leading-relaxed mb-2 ${getMsgBubbleStyle(msg.role, false)}`}>
                                                        <span>{msg.content}</span>
                                                    </div>
                                                    {renderEntityForm(entityFormSubmitted)}
                                                </div>
                                            ) : msg.formType === 'kyc_link' ? (
                                                renderKycLink()
                                            ) : (
                                                <div className={`px-4 py-2.5 text-[13px] leading-relaxed ${getMsgBubbleStyle(msg.role, isMe)}`}>
                                                    {msg.image && (
                                                        <img src={msg.image} alt="shared" className="rounded-xl max-w-[280px] max-h-[200px] object-cover mb-2 shadow-sm" />
                                                    )}
                                                    {msg.content && <span>{msg.content}</span>}
                                                </div>
                                            )}
                                            <span className={`text-[9px] text-gray-300 font-medium mt-1 block ${isMe ? 'text-right' : ''}`}>
                                                {formatTime(msg.timestamp)}
                                            </span>
                                            {/* Delete button */}
                                            {isMe && (
                                                <button
                                                    onClick={() => handleDeleteMessage(msg.id)}
                                                    className="opacity-0 group-hover/msg:opacity-100 text-[9px] text-red-400 hover:text-red-600 font-medium mt-0.5 transition-opacity cursor-pointer"
                                                    title="Delete message"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                        {/* Interactive Application Steps Card */}
                        {renderApplicationCard()}

                        {/* Enhanced Input */}
                        <div className="px-3 py-2 sm:px-5 sm:py-4 bg-gray-50/50 shrink-0">
                            {imagePreview && (
                                <div className="mb-3 relative inline-block">
                                    <img src={imagePreview} alt="preview" className="max-h-[120px] rounded-xl border border-gray-100 shadow-sm" />
                                    <button
                                        onClick={() => setImagePreview(null)}
                                        className="absolute -top-2 -right-2 w-7 h-7 bg-black text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors shadow-lg"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            )}

                            <div className={`rounded-2xl border bg-white transition-all shadow-sm ${isFocused ? 'border-gray-300 shadow-md' : 'border-gray-200'}`}>
                                {/* Input row */}
                                <div className="flex items-end gap-2">
                                    <input
                                        ref={textInputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                        onFocus={() => setIsFocused(true)}
                                        onBlur={() => setIsFocused(false)}
                                        placeholder="Type a message..."
                                        className="flex-1 py-2.5 sm:py-3 pl-3 sm:pl-4 bg-transparent text-sm focus:outline-none placeholder:text-gray-300 min-w-0"
                                    />
                                    <div className="pr-2 pb-2 pt-2 shrink-0">
                                        <button
                                            onClick={handleSend}
                                            disabled={!inputValue.trim() && !imagePreview}
                                            className="w-9 h-9 bg-black text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition-all disabled:opacity-20 disabled:cursor-not-allowed active:scale-90 shadow-sm"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                        </button>
                                    </div>
                                </div>
                                {/* Tools row */}
                                <div className="flex items-center gap-0.5 px-2 pb-2 border-t border-gray-100">
                                    <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all active:scale-90"
                                        title="Upload Image"
                                    >
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </button>
                                    <button
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all active:scale-90"
                                        title="Attach File"
                                    >
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                    </button>
                                    <button
                                        onClick={() => setShowPollModal(true)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all active:scale-90"
                                        title="Create Poll"
                                    >
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Members Panel */}
                    {showMembers && (
                        <div className="fixed inset-0 z-50 bg-white flex flex-col md:static md:z-auto md:w-64 md:border-l md:border-gray-100 overflow-y-auto shrink-0">
                            <div className="p-4 border-b border-gray-50 flex items-center gap-3">
                                <button onClick={() => setShowMembers(false)} className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all shrink-0">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <h4 className="text-xs font-black text-black tracking-tight">Members ({currentGroup.members.length + (addedAgents[selectedGroup]?.length || 0)})</h4>
                            </div>
                            <div className="p-2">
                                {(['agent', 'issuer', 'investor'] as const).map(role => {
                                    const roleMembers = currentGroup.members.filter(m => m.role === role);
                                    const extraAgents = role === 'agent' ? (addedAgents[selectedGroup] || []).map(agentId => AVAILABLE_AGENTS.find(a => a.id === agentId)!).filter(Boolean) : [];
                                    if (roleMembers.length === 0 && extraAgents.length === 0) return null;
                                    const roleLabel = role === 'agent' ? 'AI Agent' : role === 'issuer' ? 'Project Team' : 'Investors';
                                    return (
                                        <div key={role} className="mb-4">
                                            <p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase px-2 mb-2">{roleLabel}</p>
                                            {roleMembers.map(member => (
                                                <div key={member.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                                                    <div className="relative">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${role === 'agent' ? 'bg-gradient-to-br from-purple-400 to-blue-500' : role === 'issuer' ? 'bg-blue-50' : 'bg-gray-100'}`}>
                                                            {member.avatar}
                                                        </div>
                                                        {member.online && (
                                                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-black truncate">{member.name}</p>
                                                        <p className="text-[9px] text-gray-400 font-medium capitalize">{role === 'agent' ? 'Always Online' : member.online ? 'Online' : 'Offline'}</p>
                                                    </div>
                                                    {role === 'investor' && member.creditScore && (
                                                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border shadow-sm transition-all ${member.creditScore >= 1000 ? 'bg-amber-50 border-amber-200' :
                                                            member.creditScore >= 500 ? 'bg-blue-50 border-blue-100' :
                                                                'bg-gray-50 border-gray-100'
                                                            }`}>
                                                            <span className="text-xs">
                                                                {member.creditScore >= 1000 ? <Icons.Crown className="w-3 h-3 text-amber-500" /> : member.creditScore >= 500 ? <Icons.Diamond className="w-3 h-3 text-blue-500" /> : <Icons.Compass className="w-3 h-3 text-gray-400" />}
                                                            </span>
                                                            <span className={`text-[11px] font-black ${member.creditScore >= 1000 ? 'text-amber-600' :
                                                                member.creditScore >= 500 ? 'text-blue-600' :
                                                                    'text-gray-500'
                                                                }`}>
                                                                {member.creditScore}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {/* Extra added agents */}
                                            {extraAgents.map(agent => (
                                                <div key={agent.id} className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                                                    <div className="relative">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm bg-gradient-to-br ${agent.color}`}>
                                                            {agent.icon}
                                                        </div>
                                                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-black truncate">{agent.name}</p>
                                                        <p className="text-[9px] text-gray-400 font-medium">Always Online</p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAddedAgents(prev => ({
                                                                ...prev,
                                                                [selectedGroup]: (prev[selectedGroup] || []).filter(id => id !== agent.id),
                                                            }));
                                                        }}
                                                        className="w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-all"
                                                        title="Remove Agent"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                            {/* Add Agent Button Component */}
                                            {role === 'agent' && (
                                                <button
                                                    onClick={() => setShowAgentModal(true)}
                                                    className="w-full mt-1 flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-50 transition-colors group"
                                                >
                                                    <div className="relative">
                                                        <div className="w-8 h-8 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 group-hover:border-black group-hover:text-black transition-colors bg-gray-50/50 group-hover:bg-white shrink-0">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-gray-500 group-hover:text-black transition-colors">Add Agent</p>
                                                        <p className="text-[9px] text-gray-400 font-medium truncate">Explore marketplace</p>
                                                    </div>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* --- Agent Marketplace Modal --- */}
                    {showAgentModal && (
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center animate-fadeIn" onClick={() => { setShowAgentModal(false); setAgentSearch(''); setSelectedCategory(null); }}>
                            <div
                                className="bg-white rounded-3xl w-[720px] max-h-[80vh] shadow-2xl flex flex-col overflow-hidden"
                                onClick={e => e.stopPropagation()}
                                style={{ animation: 'slideUp 0.3s ease-out' }}
                            >
                                {/* Modal Header */}
                                <div className="p-6 pb-4 border-b border-gray-100 shrink-0">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-xl font-black text-black">Agent Marketplace</h3>
                                            <p className="text-xs text-gray-400 mt-1">Add AI agents to enhance your group's capabilities</p>
                                        </div>
                                        <button
                                            onClick={() => { setShowAgentModal(false); setAgentSearch(''); setSelectedCategory(null); }}
                                            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-black transition-all"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                    {/* Search */}
                                    <div className="mt-4 relative">
                                        <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                        <input
                                            type="text"
                                            value={agentSearch}
                                            onChange={e => setAgentSearch(e.target.value)}
                                            placeholder="Search agents..."
                                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                                            autoFocus
                                        />
                                    </div>
                                    {/* Category Filter */}
                                    <div className="mt-3 flex gap-1.5 flex-wrap">
                                        <button
                                            onClick={() => setSelectedCategory(null)}
                                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${!selectedCategory ? 'bg-black text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                        >
                                            All
                                        </button>
                                        {AGENT_CATEGORIES.map(cat => (
                                            <button
                                                key={cat.key}
                                                onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
                                                className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${selectedCategory === cat.key ? 'bg-black text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                            >
                                                {cat.icon} {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Agent List */}
                                <div className="flex-1 overflow-y-auto p-6 pt-4">
                                    {(() => {
                                        const searchLower = agentSearch.toLowerCase();
                                        const filtered = AVAILABLE_AGENTS.filter(a => {
                                            const matchesSearch = !agentSearch || a.name.toLowerCase().includes(searchLower) || a.description.toLowerCase().includes(searchLower);
                                            const matchesCategory = !selectedCategory || a.category === selectedCategory;
                                            return matchesSearch && matchesCategory;
                                        });
                                        const currentGroupAddedAgents = addedAgents[selectedGroup] || [];

                                        if (filtered.length === 0) {
                                            return (
                                                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                                                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                    <p className="text-sm font-bold">No agents found</p>
                                                    <p className="text-xs mt-1">Try adjusting your search or filter</p>
                                                </div>
                                            );
                                        }

                                        // Group by category
                                        const grouped: Record<string, AvailableAgent[]> = {};
                                        filtered.forEach(a => {
                                            if (!grouped[a.category]) grouped[a.category] = [];
                                            grouped[a.category].push(a);
                                        });

                                        return Object.entries(grouped).map(([catKey, agents]) => {
                                            const catInfo = AGENT_CATEGORIES.find(c => c.key === catKey);
                                            return (
                                                <div key={catKey} className="mb-6 last:mb-0">
                                                    <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-3 flex items-center gap-1.5">
                                                        <span>{catInfo?.icon}</span> {catInfo?.label}
                                                    </p>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {agents.map(agent => {
                                                            const isAdded = currentGroupAddedAgents.includes(agent.id);
                                                            return (
                                                                <div
                                                                    key={agent.id}
                                                                    className={`relative p-4 rounded-2xl border transition-all cursor-pointer group ${isAdded
                                                                        ? 'bg-green-50/50 border-green-200 shadow-sm'
                                                                        : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-md'
                                                                        }`}
                                                                    onClick={() => {
                                                                        if (isAdded) {
                                                                            setAddedAgents(prev => ({
                                                                                ...prev,
                                                                                [selectedGroup]: (prev[selectedGroup] || []).filter(id => id !== agent.id),
                                                                            }));
                                                                        } else {
                                                                            setAddedAgents(prev => ({
                                                                                ...prev,
                                                                                [selectedGroup]: [...(prev[selectedGroup] || []), agent.id],
                                                                            }));
                                                                        }
                                                                    }}
                                                                >
                                                                    <div className="flex items-start gap-3">
                                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-gradient-to-br ${agent.color} shadow-sm shrink-0`}>
                                                                            {agent.icon}
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-sm font-bold text-black truncate">{agent.name}</p>
                                                                            <p className="text-[11px] text-gray-400 leading-snug mt-0.5 line-clamp-2">{agent.description}</p>
                                                                        </div>
                                                                    </div>
                                                                    {/* Add/Added indicator */}
                                                                    <div className="absolute top-3 right-3">
                                                                        {isAdded ? (
                                                                            <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm">
                                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 group-hover:bg-black group-hover:text-white flex items-center justify-center transition-all">
                                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>

                                {/* Modal Footer */}
                                <div className="p-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-gray-400">
                                            <span className="font-bold text-black">{(addedAgents[selectedGroup] || []).length}</span> agent{(addedAgents[selectedGroup] || []).length !== 1 ? 's' : ''} added to this group
                                        </p>
                                        <button
                                            onClick={() => { setShowAgentModal(false); setAgentSearch(''); setSelectedCategory(null); }}
                                            className="px-6 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all shadow-sm active:scale-95"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Groups;
