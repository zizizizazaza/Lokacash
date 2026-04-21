import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { api } from '../services/api';
import { socket } from '../services/socket';
import { I } from '../App';
import { AddFriendModal } from './ChatsPage';

const ContactsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'friend' | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { ready, authenticated, getAccessToken } = usePrivy();

  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [followedUp, setFollowedUp] = useState<Set<string>>(new Set());

  // Suggested users from API
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);

  const fetchLists = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (token) {
        api.setToken(token);
        api.setTokenGetter(getAccessToken);
      }
    } catch {}
    setLoading(true);
    Promise.all([
      api.getFriends().catch(() => []),
      api.getFriendRequests().catch(() => [])
    ])
    .then(([friendsData, requestsData]) => {
      const friendsList = friendsData.map((f: any) => ({
        id: f.user.id,
        name: f.user.name || 'User',
        email: f.user.email,
        bio: f.user.email || 'LokaCash Member',
        role: 'LokaCash User',
        initials: (f.user.name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
        avatar: f.user.avatar,
        since: f.since,
        bgColor: `bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((f.user.name || 'a').charCodeAt(0)) % 5]}-500`
      }));
      setContacts(friendsList);

      setRequests(requestsData.map((r: any) => ({
        id: r.id, 
        userId: r.requester.id,
        name: r.requester.name || 'User',
        email: r.requester.email,
        account: r.requester.email,
        role: 'New Connection',
        mutual: 0,
        initials: (r.requester.name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
        avatar: r.requester.avatar,
        grad: `from-${['sky', 'fuchsia', 'emerald', 'amber'][Math.abs((r.requester.name || 'a').charCodeAt(0)) % 4]}-500 to-${['blue', 'pink', 'teal', 'orange'][Math.abs((r.requester.name || 'a').charCodeAt(0)) % 4]}-500`,
        time: new Date(r.createdAt).toLocaleDateString()
      })));

      // Fetch suggested users (discover) and filter out existing friends
      const friendIds = new Set(friendsList.map((f: any) => f.id));
      return api.discoverUsers().then((discoverData: any[]) => {
        const suggestions = discoverData
          .filter((u: any) => !friendIds.has(u.id) && u.friendshipStatus !== 'accepted' && u.friendshipStatus !== 'pending')
          .map((u: any) => {
            const grads = ['from-emerald-500 to-teal-600', 'from-rose-500 to-pink-600', 'from-sky-500 to-blue-500', 'from-amber-500 to-orange-500'];
            const hash = Array.from(String(u.name || 'User')).reduce((sum: number, c: string) => sum + c.charCodeAt(0), 0);
            return {
              id: u.id,
              name: u.name || 'Unknown',
              role: u.role || 'Member',
              avatar: u.avatar,
              initials: (u.name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
              grad: grads[hash % grads.length],
              bio: u.bio || 'A platform user',
              mutual: 0,
            };
          });
        setSuggestedUsers(suggestions);
      }).catch(console.error);
    })
    .finally(() => setLoading(false));
  }, [getAccessToken]);

  useEffect(() => {
    if (!(ready && authenticated)) {
      if (ready) setLoading(false);
      return;
    }
    fetchLists();
    const unsubRequest = socket.on('friend:request', () => fetchLists());
    const unsubAccepted = socket.on('friend:accepted', () => fetchLists());
    return () => { unsubRequest(); unsubAccepted(); };
  }, [ready, authenticated, fetchLists]);

  const handleAccept = async (id: string) => {
    try {
      await api.acceptFriendRequest(id);
      setAccepted(prev => new Set(prev).add(id));
      setTimeout(() => {
        setRequests(prev => prev.filter(r => r.id !== id));
        fetchLists();
      }, 1500);
    } catch (e) {}
  };
  const handleDecline = async (id: string) => {
    try {
      await api.rejectFriendRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch (e) {}
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  const handleMessage = async (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    try {
      const conv = await api.createDMConversation(userId);
      navigate(`/chat?convId=${conv.id}`);
    } catch (err) { }
  };

  const handleSuggestFollow = async (userId: string) => {
    try {
      await api.sendFriendRequest(userId);
      setFollowedUp(prev => { const n = new Set(prev); n.add(userId); return n; });
    } catch (err) {
      console.error('Failed to send friend request:', err);
    }
  };

  const suggestions = suggestedUsers.filter(s => !dismissed.has(s.id));

  // Helper to render avatar (image URL or initials)
  const renderAvatar = (avatar: string | undefined, initials: string, gradClass: string, size = 'w-10 h-10', textSize = 'text-[13px]') => {
    if (avatar && typeof avatar === 'string' && avatar.startsWith('http')) {
      return (
        <div className={`${size} rounded-xl overflow-hidden shrink-0`}>
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        </div>
      );
    }
    return (
      <div className={`${size} rounded-xl bg-gradient-to-br ${gradClass} flex items-center justify-center ${textSize} font-black text-white shadow-sm shrink-0`}>
        {initials}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-gray-100/80">
      {modal === 'friend' && <AddFriendModal onClose={() => setModal(null)} />}
      <div className="animate-fadeIn pb-24 p-4 sm:p-8 md:p-10 lg:p-12 max-w-[1600px] mx-auto w-full min-h-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[22px] font-semibold text-gray-900">Contacts</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">{contacts.length} contacts</span>
            <button onClick={() => setModal('friend')}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-900 text-white hover:bg-gray-700 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
        </div>

        {/* ── Friend Requests ── */}
        {requests.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[13px] font-bold text-gray-900">Friend Requests</h2>
              <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-black flex items-center justify-center">{requests.length}</span>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
              {requests.map((r, idx) => {
                const isAccepted = accepted.has(r.id);
                return (
                  <div key={r.id} className={`flex items-center gap-4 px-4 py-3.5 transition-all duration-300 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${isAccepted ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                    {renderAvatar(r.avatar, r.initials, r.grad)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13px] font-semibold text-gray-900 leading-tight">{r.name}</p>
                        <span className="text-[10px] text-gray-500 font-mono bg-gray-50 px-1 py-0.5 rounded">{r.account}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">{r.role}{r.mutual > 0 ? ` · ${r.mutual} mutual` : ''} · {r.time}</p>
                    </div>
                    {isAccepted ? (
                      <span className="text-[11px] font-bold text-emerald-600 shrink-0 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        Accepted
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleDecline(r.id)} className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-gray-200 transition-all shadow-sm">Decline</button>
                        <button onClick={() => handleAccept(r.id)} className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-gray-900 hover:bg-gray-800 transition-all shadow-sm">Accept</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── All Contacts ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[13px] font-bold text-gray-900">All Contacts</h2>
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{filtered.length}</span>
          </div>
          <div className="relative mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 placeholder:text-gray-400 transition-all" />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`sk-${i}`} className={`flex items-center gap-4 px-4 py-3.5 ${i !== 0 ? 'border-t border-gray-50' : ''} animate-pulse`}>
                  <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0"></div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-2 bg-gray-100 rounded w-1/2"></div>
                  </div>
                </div>
              ))
            ) : (
              <>
                {filtered.map((c, idx) => {
                  const gradMap: Record<string, string> = { 'bg-blue-500': 'from-blue-500 to-indigo-500', 'bg-violet-500': 'from-violet-500 to-purple-500', 'bg-emerald-500': 'from-emerald-500 to-teal-500', 'bg-amber-500': 'from-amber-400 to-orange-400', 'bg-rose-500': 'from-rose-500 to-pink-500', 'bg-cyan-500': 'from-cyan-500 to-sky-500', 'bg-indigo-500': 'from-indigo-500 to-blue-600', 'bg-pink-500': 'from-pink-500 to-rose-500', 'bg-orange-500': 'from-orange-400 to-amber-500' };
                  const grad = gradMap[c.bgColor] ?? 'from-gray-400 to-gray-500';
                  return (
                    <div key={c.id} onClick={(e) => handleMessage(e, c.id)} className={`flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer group ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                      {renderAvatar(c.avatar, c.initials, grad)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[13px] font-semibold text-gray-900 leading-tight">{c.name}</p>
                          {c.role && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md leading-tight">{c.role}</span>}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 truncate">{c.bio}</p>
                      </div>
                      <button onClick={(e) => handleMessage(e, c.id)} className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-50 text-[11px] font-semibold text-gray-600 hover:bg-gray-900 hover:text-white transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 shadow-sm">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        Message
                      </button>
                    </div>
                  );
                })}
                {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-10">No contacts found</p>}
              </>
            )}
          </div>
        </div>

        {/* ── Suggested for You — from real API data ── */}
        {(loading || suggestions.length > 0) && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-bold text-gray-900">Suggested for You</h2>
              <span className="text-[11px] font-medium text-gray-400">People you may know</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={`sks-${i}`} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 w-full animate-pulse">
                    <div className="w-12 h-12 rounded-full bg-gray-100 shrink-0"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-2 bg-gray-100 rounded w-1/3"></div>
                      <div className="h-2 bg-gray-50 rounded w-1/4 mt-2"></div>
                    </div>
                  </div>
                ))
              ) : suggestions.map(s => {
                const isFollowed = followedUp.has(s.id);
                return (
                  <div key={s.id} className="relative bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 w-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 hover:border-gray-200 transition-all duration-300 ease-out cursor-pointer group">
                    <button onClick={(e) => { e.stopPropagation(); setDismissed(prev => { const n = new Set(prev); n.add(s.id); return n; }); }}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all opacity-0 group-hover:opacity-100">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    {s.avatar && typeof s.avatar === 'string' && s.avatar.startsWith('http') ? (
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                        <img src={s.avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${s.grad} flex items-center justify-center text-[14px] font-black text-white shadow-sm shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>{s.initials}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-gray-900 leading-tight truncate pr-4 group-hover:text-blue-600 transition-colors">{s.name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{s.role}</p>
                      <div className="flex items-center justify-between mt-2.5">
                        <p className="text-[10px] font-medium text-gray-400">{s.bio?.substring(0, 20) || 'Platform user'}</p>
                        {isFollowed ? (
                          <span className="text-[11px] font-bold text-gray-900 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            Sent
                          </span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); handleSuggestFollow(s.id); }}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white bg-gray-900 hover:bg-gray-700 transition-all shadow-sm hover:scale-110 active:scale-95">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ContactsPage;
