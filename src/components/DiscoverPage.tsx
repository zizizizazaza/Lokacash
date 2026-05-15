import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { DISCOVER_AGENTS, AGENT_CATEGORIES, CreateGroupModal, CreateAgentModal } from '../App';

const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState<'Groups' | 'People'>('Groups');
  const [agentCat, setAgentCat] = useState('All');
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [joinedGroups, setJoinedGroups] = useState<Set<string>>(new Set());
  const [joiningGroup, setJoiningGroup] = useState<string | null>(null);
  const [joinSuccessGroup, setJoinSuccessGroup] = useState<any | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  // Fetch groups from backend when Groups tab is active
  useEffect(() => {
    if (activeTab === 'Groups') {
      setLoadingGroups(true);
      api.discoverGroups()
        .then((res: any[]) => {
          const augmented = res.map((g: any) => {
            const colors = ['bg-blue-50', 'bg-emerald-50', 'bg-rose-50', 'bg-amber-50'];
            const textColors = ['text-blue-600', 'text-emerald-600', 'text-rose-600', 'text-amber-600'];
            const grads = ['from-blue-500 to-indigo-600', 'from-emerald-500 to-teal-600', 'from-rose-500 to-pink-600', 'from-amber-500 to-orange-600'];
            const hash = Array.from(String(g.name || '')).reduce((sum: number, c: string) => sum + c.charCodeAt(0), 0);
            const idx = hash % colors.length;
            return {
              ...g,
              desc: g.bio || 'A community group',
              members: g.memberCount || 0,
              tag: 'Community',
              color: textColors[idx] + ' ' + colors[idx],
              grad: grads[idx],
              logoUrl: (g.avatar && typeof g.avatar === 'string' && (g.avatar.startsWith('http') || g.avatar.startsWith('data:'))) ? g.avatar : undefined,
              letter: g.name ? g.name.charAt(0).toUpperCase() : 'G',
            };
          });
          setGroups(augmented);
        })
        .catch(console.error)
        .finally(() => setLoadingGroups(false));
    }
  }, [activeTab]);

  // Fetch users from backend when People tab is active
  useEffect(() => {
    if (activeTab === 'People') {
      setLoadingUsers(true);
      api.discoverUsers()
        .then((res: any[]) => {
          const augmented = res.map((u: any) => {
            const grads = ['from-violet-500 to-purple-700', 'from-emerald-500 to-teal-700', 'from-rose-500 to-pink-600', 'from-sky-500 to-blue-500'];
            const hash = Array.from(String(u.name || 'User')).reduce((sum: number, c: string) => sum + c.charCodeAt(0), 0);
            const idx = hash % grads.length;
            return {
              ...u,
              name: u.name || 'Unknown',
              role: u.role || 'Member',
              org: 'Discover',
              score: u.creditScore || 500,
              investments: 0,
              raises: 0,
              avatar: u.avatar || (u.name ? u.name.charAt(0).toUpperCase() : 'U'),
              color: grads[idx],
              followers: '—',
              bio: u.bio || 'A platform user',
              active: true,
              friendshipStatus: u.friendshipStatus || 'none',
            };
          });
          setUsers(augmented);
        })
        .catch(console.error)
        .finally(() => setLoadingUsers(false));
    }
  }, [activeTab]);

  const PEOPLE = users;
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [peopleCat, setPeopleCat] = useState('All');
  const PEOPLE_CATS = ['All', 'Investor', 'Founder', 'Contributor', 'Member'] as const;
  const filteredPeople = peopleCat === 'All' ? PEOPLE : PEOPLE.filter((p: any) => p.role === peopleCat);

  const tabs = ['Groups', 'People'] as const;
  const filteredAgents = agentCat === 'All' ? DISCOVER_AGENTS : DISCOVER_AGENTS.filter((a: any) => a.category === agentCat);

  const handleJoin = async (group: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (joinedGroups.has(group.id)) return;
    setJoiningGroup(group.id);
    try {
      await api.joinGroup(group.id);
      setJoiningGroup(null);
      setJoinedGroups(prev => new Set([...prev, group.id]));
      setJoinSuccessGroup(group);
      setSelectedGroup(null);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('loka-nav-groups', { detail: group.name }));
        navigate('/chat');
      }, 1500);
    } catch (err) {
      console.error('Failed to join group:', err);
      setJoiningGroup(null);
    }
  };

  if (showCreateAgent) {
    return <CreateAgentModal onClose={() => setShowCreateAgent(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-gray-50 md:bg-gray-100/80">
      {/* Create Group Modal */}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={() => { setShowCreateGroup(false); setActiveTab('Groups'); }}
        />
      )}
      {/* Success toast */}
      {showToast && joinSuccessGroup && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] animate-fadeIn">
          <div className="flex items-center gap-2.5 bg-gray-900 text-white text-[13px] font-semibold px-4 py-3 rounded-2xl shadow-2xl">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            Joined <span className="font-bold">{joinSuccessGroup.name}</span> — redirecting to chat...
          </div>
        </div>
      )}

      {/* Group Detail Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={() => setSelectedGroup(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn" onClick={e => e.stopPropagation()}>
            {/* Cover */}
            <div className={`h-36 bg-gradient-to-br ${selectedGroup.grad} relative flex items-center justify-center overflow-hidden`}>
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-4 left-8 w-20 h-20 rounded-full border-4 border-white/50" />
                <div className="absolute bottom-2 right-12 w-14 h-14 rounded-full border-4 border-white/30" />
                <div className="absolute top-8 right-4 w-8 h-8 rounded-full bg-white/20" />
              </div>
              {selectedGroup.logoUrl ? (
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/20 shadow-xl z-10">
                  <img src={selectedGroup.logoUrl} className="w-full h-full object-cover" alt={selectedGroup.name} />
                </div>
              ) : (
                <span className="text-white/20 font-black text-8xl select-none z-10 relative">{selectedGroup.letter}</span>
              )}
              <button onClick={() => setSelectedGroup(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur flex items-center justify-center text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="absolute bottom-3 left-4 flex -space-x-2">
                {['from-blue-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-rose-400 to-pink-500', 'from-amber-400 to-orange-500'].map((g, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full bg-gradient-to-br ${g} border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-bold text-white`}>
                    {['A', 'B', 'C', 'D'][i]}
                  </div>
                ))}
                <div className="w-7 h-7 rounded-full bg-black/30 border-2 border-white shadow-sm flex items-center justify-center text-[9px] font-bold text-white backdrop-blur">
                  +{Math.max(0, (selectedGroup.members || 0) - 4).toLocaleString()}
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-[18px] font-black text-gray-900 leading-tight">{selectedGroup.name}</h2>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedGroup.color}`}>{selectedGroup.tag}</span>
                  </div>
                  <p className="text-[12px] text-gray-400 font-medium">{(selectedGroup.members || 0).toLocaleString()} members</p>
                </div>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed mb-6">{selectedGroup.desc}</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: 'Members', value: (selectedGroup.members || 0).toLocaleString() },
                  { label: 'Category', value: selectedGroup.tag },
                ].map(stat => (
                  <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[11px] font-black text-gray-900 leading-tight">{stat.value}</p>
                    <p className="text-[9px] text-gray-400 font-medium mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
              {joinedGroups.has(selectedGroup.id) || selectedGroup.isMember ? (
                <div className="w-full py-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2 text-emerald-700 font-bold text-[14px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  Joined
                </div>
              ) : (
                <button
                  onClick={() => handleJoin(selectedGroup)}
                  disabled={joiningGroup === selectedGroup.id}
                  className="w-full py-3 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-[14px] transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {joiningGroup === selectedGroup.id ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Joining...</>
                  ) : (
                    <>Join Group<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
                  )}
                </button>
              )}
              <p className="text-[10px] text-gray-400 text-center mt-3">By joining, you agree to our community guidelines.</p>
            </div>
          </div>
        </div>
      )}

      {/* Person Detail Modal */}
      {selectedPerson && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={() => setSelectedPerson(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-fadeIn" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${selectedPerson.color} flex items-center justify-center text-[20px] font-black text-white shadow-md shrink-0`}>
                  {typeof selectedPerson.avatar === 'string' && selectedPerson.avatar.startsWith('http')
                    ? <img src={selectedPerson.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                    : selectedPerson.avatar}
                </div>
                <div>
                  <h2 className="text-[16px] font-black text-gray-900 leading-tight">{selectedPerson.name}</h2>
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">{selectedPerson.role} · {selectedPerson.org}</p>
                </div>
              </div>
              <button onClick={() => setSelectedPerson(null)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-gray-600 leading-relaxed mb-4">{selectedPerson.bio}</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {[
                  { label: 'Credit Score', value: selectedPerson.score || 0 },
                  { label: 'Role', value: selectedPerson.role },
                ].map(stat => (
                  <div key={stat.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-[13px] font-black text-gray-900">{stat.value}</p>
                    <p className="text-[9px] text-gray-400 font-medium mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  if (selectedPerson.id) {
                    api.sendFriendRequest(selectedPerson.id).then(() => {
                      setSelectedPerson(null);
                    }).catch(console.error);
                  }
                }}
                className="w-full py-2.5 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                Add Friend
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="animate-fadeIn pb-24 p-4 sm:p-8 md:p-10 lg:p-12 max-w-[1600px] mx-auto w-full min-h-full">
        {/* Header + Tabs */}
        <h1 className="text-[22px] font-semibold text-gray-900 mb-4">Discover</h1>
        <div className="flex items-center gap-6 border-b border-gray-100 mb-6">
          {tabs.map(t => (
            <button key={t}
              onClick={() => setActiveTab(t)}
              className={`pb-2 text-[14px] font-medium transition-all border-b-2 -mb-px flex items-center gap-1.5 ${activeTab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>{t}</button>
          ))}
        </div>

        {/* ── Groups Tab ── */}
        {activeTab === 'Groups' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-[12px] text-gray-400 font-medium">{groups.length} groups</p>
              <button
                onClick={() => setShowCreateGroup(true)}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-gray-900 hover:bg-gray-700 px-3.5 py-1.5 rounded-xl transition-all active:scale-95">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                Create Group
              </button>
            </div>
            {loadingGroups ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                <p className="text-[14px] font-bold text-gray-900 mb-1">No groups found</p>
                <p className="text-[12px] text-gray-400">Be the first to create a community group!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {groups.map(g => (
                  <div
                    key={g.id}
                    onClick={() => setSelectedGroup(g)}
                    className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-lg hover:border-gray-200 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group"
                  >
                    <div className={`h-24 bg-gradient-to-br ${g.grad} relative overflow-hidden flex items-center justify-center`}>
                      <div className="absolute top-3 left-5 w-12 h-12 rounded-full border-2 border-white/20 pointer-events-none" />
                      <div className="absolute bottom-1 right-8 w-8 h-8 rounded-full border-2 border-white/15 pointer-events-none" />
                      <div className="absolute top-1 right-3 w-5 h-5 rounded-full bg-white/10 pointer-events-none" />
                      {g.logoUrl ? (
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/30 shadow-md z-10">
                          <img src={g.logoUrl} className="w-full h-full object-cover" alt={g.name} />
                        </div>
                      ) : (
                        <span className="text-white/15 font-black text-6xl select-none z-10 relative">{g.letter}</span>
                      )}
                      <span className="absolute top-2.5 left-2.5 text-[10px] font-bold text-white bg-black/20 backdrop-blur-sm px-2 py-0.5 rounded-full z-20">{g.tag}</span>
                    </div>
                    <div className="p-4">
                      <p className="text-[13px] font-bold text-gray-900 mb-1 leading-tight group-hover:text-blue-600 transition-colors">{g.name}</p>
                      <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2 mb-3">{g.desc}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex -space-x-1.5">
                          {['from-blue-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-rose-400 to-pink-500'].map((grd, i) => (
                            <div key={i} className={`w-5 h-5 rounded-full bg-gradient-to-br ${grd} border border-white shadow-sm`} />
                          ))}
                          <div className="w-5 h-5 rounded-full bg-gray-200 border border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-gray-500">+{Math.max(0, Math.floor((g.members || 0) / 10))}</div>
                        </div>
                        {joinedGroups.has(g.id) || g.isMember ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            Joined
                          </span>
                        ) : (
                          <button
                            onClick={(e) => handleJoin(g, e)}
                            disabled={joiningGroup === g.id}
                            className="flex items-center gap-1 text-[11px] font-bold text-white bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-60"
                          >
                            {joiningGroup === g.id ? (
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                            )}
                            Join
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── People Tab ── */}
        {activeTab === 'People' && (
          <div>
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {PEOPLE_CATS.map(c => (
                <button key={c}
                  onClick={() => setPeopleCat(c)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                    peopleCat === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {loadingUsers ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                <p className="text-[14px] font-bold text-gray-900 mb-1">No users found</p>
                <p className="text-[12px] text-gray-400">Waiting for members to join.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredPeople.map((person: any, i: number) => (
                  <div
                    key={person.id || i}
                    onClick={async () => {
                      if (person.friendshipStatus === 'accepted') {
                        try {
                          const conv = await api.createDMConversation(person.id);
                          navigate(`/chat?convId=${conv.id}`);
                        } catch (err) {
                          console.error(err);
                        }
                      } else {
                        setSelectedPerson(person);
                      }
                    }}
                    className="group cursor-pointer bg-white hover:shadow-lg hover:border-gray-200 transition-all duration-300 border border-gray-100 rounded-2xl p-5 flex flex-col items-center text-center"
                  >
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${person.color} flex items-center justify-center text-[20px] font-black text-white shadow-md mb-3 group-hover:scale-105 transition-transform duration-300`}>
                      {typeof person.avatar === 'string' && person.avatar.startsWith('http')
                        ? <img src={person.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                        : person.avatar}
                    </div>
                    <p className="text-[13px] font-bold text-gray-900 leading-tight mb-0.5 group-hover:text-blue-600 transition-colors">{person.name}</p>
                    <p className="text-[10px] text-gray-400 mb-2">{person.role} · {person.org}</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2 mb-3">{person.bio}</p>
                    <div className="flex items-center justify-between w-full mt-auto pt-3 border-t border-gray-50">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold text-gray-500">Score: {person.score}</span>
                      </div>
                      {person.friendshipStatus === 'accepted' ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          Friend
                        </span>
                      ) : person.friendshipStatus === 'pending' ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">
                          Pending
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedPerson(person); }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-white bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-all active:scale-95 opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverPage;