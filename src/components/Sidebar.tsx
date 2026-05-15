import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '../types';
import { I } from './Icons';
import { navItems, RECENTS } from '../constants';
import { api } from '../services/api';
import { socket } from '../services/socket';
import PlanUpgradeEntry from './PlanUpgradeEntry';
import { ChatSearchPanel } from './ChatSearchPanel';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

interface Conversation {
  id: string;
  title: string;
  time: string;
  messageCount: number;
  agentId?: string;
  pinned?: boolean;
}

/* ── User menu popup ── */
const UserMenu: React.FC<{
  open: boolean; onClose: () => void; position?: 'above' | 'right';
  isDark: boolean; onToggleDark: () => void; onLogout?: () => void;
  userName?: string;
  userInitial?: string;
  userAvatar?: string | null;
  onItemClick?: () => void;
}> = ({ open, onClose, position = 'above', isDark, onToggleDark, onLogout, userName, userInitial, userAvatar, onItemClick }) => {
  const menuNav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);
  if (!open) return null;

  const posClass = position === 'right'
    ? 'left-full bottom-0 ml-2'
    : 'bottom-full left-0 mb-2';

  const widthClass = position === 'right' ? 'w-56' : 'w-full';

  const items: (null | { icon: React.FC; label: string; action: () => void; danger?: boolean })[] = [
    { icon: I.UserIcon, label: 'Profile', action: () => { menuNav('/portfolio'); onClose(); } },
    { icon: I.Crown, label: 'Plan', action: () => { menuNav('/settings'); onClose(); } },
    { icon: I.Code, label: 'API', action: () => { window.open('/developers', '_blank', 'noopener,noreferrer'); onClose(); } },
    null,
    { icon: I.LogOut, label: 'Log out', action: () => { if (onLogout) onLogout(); onClose(); }, danger: true },
  ];

  /* Light vs dark menu styling */
  const bg = isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200 shadow-lg';
  const headerBorder = isDark ? 'border-white/10' : 'border-gray-100';
  const nameColor = isDark ? 'text-white' : 'text-gray-900';
  const subColor = isDark ? 'text-gray-400' : 'text-gray-500';
  const itemColor = isDark ? 'text-gray-300 hover:bg-white/8 hover:text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900';
  const dangerColor = isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50';
  const dividerColor = isDark ? 'bg-white/10' : 'bg-gray-100';

  return (
    <div ref={ref} className={`absolute ${posClass} z-[100] ${widthClass} ${bg} rounded-xl border py-1.5`}
      style={{ animation: 'menu-pop 0.15s ease-out' }}>
      {/* User header */}
      <div className={`px-3.5 py-2.5 border-b ${headerBorder}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-[11px] font-bold text-white overflow-hidden`}>{userAvatar ? <img src={userAvatar} alt="" className="w-full h-full object-cover" /> : (userInitial || 'U')}</div>
          <div>
            <p className={`text-[13px] font-semibold ${nameColor}`}>{userName || 'User'}</p>
            <p className={`text-[11px] ${subColor}`}>@user</p>
          </div>
        </div>
      </div>
      {/* Items */}
      <div className="py-1">
        {items.map((item, i) => {
          if (!item) return <div key={i} className={`my-1 h-px ${dividerColor}`} />;
          const Ic = item.icon;
          return (
            <button key={i} onClick={() => {
              item.action();
              if (!item.label.includes('Mode')) onClose();
              if (onItemClick) onItemClick();
            }}
              className={`w-full flex items-center gap-3 px-3.5 py-2 text-[13px] transition-colors ${item.danger ? dangerColor : itemColor
                }`}>
              <Ic />{item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Skeleton row for the Recents list — width varies per row to look like real titles
const RECENTS_SKELETON_WIDTHS = ['w-4/5', 'w-2/3', 'w-3/4', 'w-1/2', 'w-3/5', 'w-11/12', 'w-2/3', 'w-3/4'];
const RecentsSkeleton: React.FC<{ isDark?: boolean }> = ({ isDark }) => {
  const bar = isDark ? 'bg-white/10' : 'bg-gray-200';
  return (
    <div className="space-y-1 animate-pulse" aria-label="Loading conversations">
      {RECENTS_SKELETON_WIDTHS.map((w, i) => (
        <div key={i} className="px-2 py-1.5">
          <div className={`h-3 ${w} ${bar} rounded`} />
        </div>
      ))}
    </div>
  );
};

export const Sidebar: React.FC<{
  expanded: boolean; onToggle: () => void; page: Page; go: (p: Page) => void;
  isDark: boolean; onToggleDark: () => void;
  isLoggedIn: boolean; privyReady?: boolean; onLogin: () => void; onLogout: () => void;
  userName?: string; userInitial?: string; userAvatar?: string | null;
  mobileDrawerOpen?: boolean; onCloseMobileDrawer?: () => void;
}> = ({ expanded, onToggle, page, go, isDark, onToggleDark, isLoggedIn, privyReady = true, onLogin, onLogout, userName, userInitial, userAvatar, mobileDrawerOpen, onCloseMobileDrawer }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [desktopUserMenuOpen, setDesktopUserMenuOpen] = useState(false);
  const [mobileUserMenuOpen, setMobileUserMenuOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Tracks whether a /chat/conversations fetch is in flight. We treat the
  // Privy-resolution phase (`!privyReady`) as loading too — it's a real
  // unknown-auth window, not a "definitely logged out" state. Checking
  // tokens in storage isn't a substitute: a stored token can be expired,
  // and we'd have to decode the JWT to know. Privy already does that for
  // us and exposes the answer via `privyReady`.
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(isLoggedIn);
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, title: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [moreMenuId, setMoreMenuId] = useState<string | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (searchPanelRef.current?.contains(target)) return;
      if (target.closest('[data-search-toggle]')) return;
      if (searchQuery.trim()) return;
      setSearchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen, searchQuery]);

  useEffect(() => {
    const handleStart = (e: any) => {
      const { id, title, agentId } = e.detail;
      setActiveSessions(prev => new Set(prev).add(id));
      setConversations(prev => {
        if (prev.find(c => c.id === id)) return prev;
        return [{ id, title, time: new Date().toISOString(), messageCount: 1, agentId }, ...prev];
      });
    };
    const handleDone = (e: any) => {
      const { id } = e.detail;
      setActiveSessions(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };

    const handleSocketProgress = (data: any) => {
      if (data.sessionId) setActiveSessions(prev => new Set(prev).add(data.sessionId));
    };
    const handleSocketDone = (data: any) => {
      if (data.sessionId) setActiveSessions(prev => {
        const next = new Set(prev);
        next.delete(data.sessionId);
        return next;
      });
    };

    window.addEventListener('session-started', handleStart);
    window.addEventListener('session-done', handleDone);
    socket.on('agent:research:progress', handleSocketProgress);
    socket.on('agent:research:done', handleSocketDone);
    socket.on('agent:research:error', handleSocketDone);
    socket.on('agent:chat:consensus_done', handleSocketDone);
    socket.on('agent:chat:stream_done', handleSocketDone);
    socket.on('agent:chat:error', handleSocketDone);
    // User-initiated stop: backend acknowledges via agent:chat:cancelled, and
    // every isAborted() early-return branch also fires this event. Without
    // listening here, the spinner next to a stopped session keeps spinning
    // because no stream_done ever arrives.
    socket.on('agent:chat:cancelled', handleSocketDone);

    return () => {
      window.removeEventListener('session-started', handleStart);
      window.removeEventListener('session-done', handleDone);
      socket.off('agent:research:progress', handleSocketProgress);
      socket.off('agent:research:done', handleSocketDone);
      socket.off('agent:research:error', handleSocketDone);
      socket.off('agent:chat:consensus_done', handleSocketDone);
      socket.off('agent:chat:stream_done', handleSocketDone);
      socket.off('agent:chat:error', handleSocketDone);
      socket.off('agent:chat:cancelled', handleSocketDone);
    };
  }, []);

  useEffect(() => {
    // Don't decide anything until Privy has resolved auth state. Touching
    // state here would prematurely flip the loading flag off and unmount
    // the skeleton during the Privy-init window.
    if (!privyReady) return;
    if (!isLoggedIn) {
      setConversations([]);
      setIsLoadingConversations(false);
      return;
    }
    setIsLoadingConversations(true);
    const fetchConversations = async () => {
      try {
        const token = sessionStorage.getItem('loka_token') || localStorage.getItem('loka_token');
        if (!token) { setIsLoadingConversations(false); return; }
        const res = await fetch(`${API_BASE}/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setConversations(prev => {
            const localIds = new Set(prev.map(c => c.id));
            const serverNew = data.filter((c: Conversation) => !localIds.has(c.id));
            return [...prev, ...serverNew];
          });
        }
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
      } finally {
        setIsLoadingConversations(false);
      }
    };
    fetchConversations();

    // Listen for auth/profile sync to resolve race condition on initial login
    const handleAuthReady = () => {
      fetchConversations();
    };
    window.addEventListener('loka-profile-updated', handleAuthReady);

    return () => {
      window.removeEventListener('loka-profile-updated', handleAuthReady);
    };
  }, [isLoggedIn, privyReady, page]); // Re-fetch when page changes to keep list fresh

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    setDeleteConfirm(null);
    try {
      await api.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      setActiveSessions(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (searchParams.get('session') === id) {
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  const startRename = (c: Conversation) => {
    setRenamingId(c.id);
    setRenameValue(c.title);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const confirmRename = () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    setConversations(prev => prev.map(c => c.id === renamingId ? { ...c, title: renameValue.trim() } : c));
    setRenamingId(null);
  };

  const togglePin = (id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
    setMoreMenuId(null);
  };

  // Close more menu on outside click
  useEffect(() => {
    if (!moreMenuId) return;
    const h = (e: MouseEvent) => { if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuId(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [moreMenuId]);

  // Sort: pinned first, then by time
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  /* theme classes */
  const bg = isDark ? 'bg-[#1a1a1a] border-[#2a2a2a]' : 'bg-[#F4F4F5] border-transparent';
  const textPrimary = isDark ? 'text-gray-100' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';
  const hoverBg = isDark ? 'hover:bg-white/8' : 'hover:bg-black/5';
  const activeBg = isDark ? 'bg-white/10 text-white font-semibold' : 'bg-black/8 text-gray-900 font-semibold';
  const divider = isDark ? 'bg-white/8' : 'bg-black/5';
  const avatarBg = isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500';

  /* ── Mobile Drawer Overlay ── */
  const mobileOverlay = mobileDrawerOpen && (
    <div className="md:hidden fixed inset-0 z-[90] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 z-[1] bg-black/30 backdrop-blur-[2px]" onClick={onCloseMobileDrawer}
        style={{ animation: 'fadeIn 0.2s ease-out' }} />
      {/* Drawer panel */}
      <div className="relative z-[2] w-[280px] max-w-[80vw] h-full bg-white flex flex-col shadow-2xl"
        style={{ animation: 'drawerSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}>

        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
          <span className="text-[15px] font-bold tracking-tight text-gray-900 select-none">Loka</span>
          <div className="flex items-center gap-0.5">
            <button data-search-toggle onClick={() => setSearchOpen(v => !v)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${searchOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100'}`} title="Search"><I.Search /></button>
            <button onClick={onCloseMobileDrawer} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* New chat */}
        <div className="px-3 pb-1">
          <SideLink icon={I.Plus} label="New chat" onClick={() => { sessionStorage.removeItem('loka_superagent_sid'); sessionStorage.removeItem('loka_sa_analysis_pending'); go(Page.SUPER_AGENT); }} isDark={false} />
        </div>

        {navItems.length > 0 && (
          <>
            <div className="mx-4 my-2 h-px bg-gray-100" />
            <div className="px-3 space-y-px">
              {navItems.map(({ key, icon, label, anim }) => (
                <SideLink key={key} icon={icon} label={label} active={page === key} anim={anim}
                  onClick={() => go(key)} isDark={false} />
              ))}
            </div>
          </>
        )}

        <div className="mx-4 my-3 h-px bg-gray-100" />

        {/* Recents */}
        <div className="px-3 flex-1 overflow-y-auto min-h-0">
          {(isLoggedIn || !privyReady) && (
            <>
              {isLoggedIn && searchOpen && (
                <div ref={searchPanelRef}>
                  <ChatSearchPanel onCloseMobileDrawer={onCloseMobileDrawer} autoFocus onQueryChange={setSearchQuery} />
                </div>
              )}
              <p className="px-2 pb-2 text-[11px] font-medium text-gray-400 select-none">Recents</p>
              {!privyReady || (isLoadingConversations && conversations.length === 0) ? (
                <RecentsSkeleton />
              ) : sortedConversations.length > 0 ? (
                sortedConversations.map((c) => (
                  <div key={c.id} className="relative group/recent">
                    {renamingId === c.id ? (
                      <div className="px-2 py-1">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={confirmRename}
                          onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenamingId(null); }}
                          className="w-full text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                        />
                      </div>
                    ) : (
                      <>
                        <button onClick={() => { navigate(c.agentId === 'research' ? `/signal-radar?session=${c.id}` : `/?session=${c.id}`); if (onCloseMobileDrawer) onCloseMobileDrawer(); }} title={c.title} className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[13px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all">
                          {c.pinned && <svg className="w-3 h-3 text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>}
                          <span className="truncate flex-1">{c.title}</span>
                          {activeSessions.has(c.id) && (
                            <svg className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMoreMenuId(moreMenuId === c.id ? null : c.id); }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover/recent:opacity-100 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all bg-white"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                        </button>
                        {moreMenuId === c.id && (
                          <div ref={moreMenuRef} className="absolute right-0 top-full mt-1 z-50 w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1" style={{ animation: 'menu-pop 0.12s ease-out' }}>
                            <button onClick={() => { togglePin(c.id); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50 transition-colors">
                              <svg className="w-3.5 h-3.5" fill={c.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
                              {c.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button onClick={() => { setMoreMenuId(null); startRename(c); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              Rename
                            </button>
                            <button onClick={() => { setMoreMenuId(null); setDeleteConfirm({ id: c.id, title: c.title }); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              ) : (
                <p className="px-2 text-[12px] text-gray-400">No recent chats</p>
              )}
            </>
          )}
        </div>

        <div className="px-3 py-3 relative" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
          <div className="flex items-center gap-2">
            <div onClick={() => isLoggedIn ? setMobileUserMenuOpen(!mobileUserMenuOpen) : (privyReady ? onLogin() : undefined)} className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-all cursor-pointer group/user">
              <div className={`w-7 h-7 ${(isLoggedIn || (!privyReady && userName)) ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'} rounded-full flex items-center justify-center text-[10px] font-semibold overflow-hidden`}>{userAvatar ? <img src={userAvatar} alt="" className="w-full h-full object-cover" /> : (userInitial || 'U')}</div>
              <span className="flex-1 text-[13px] font-medium text-gray-700 truncate">{isLoggedIn ? (userName || 'User') : (userName || (privyReady ? 'Sign in' : '···'))}</span>
              <div className="opacity-0 group-hover/user:opacity-100 transition-opacity text-gray-400"><I.Dots /></div>
            </div>
            {isLoggedIn && (
              <PlanUpgradeEntry size="sm" className="shrink-0" onNavigate={onCloseMobileDrawer} />
            )}
          </div>
          <UserMenu open={mobileUserMenuOpen} onClose={() => setMobileUserMenuOpen(false)} isDark={false} onToggleDark={onToggleDark} onLogout={onLogout} userName={userName} userInitial={userInitial} userAvatar={userAvatar} onItemClick={() => { if (mobileDrawerOpen && onCloseMobileDrawer) onCloseMobileDrawer(); }} />
        </div>
      </div>
    </div>
  );

  /* ── Collapsed: 56px icon rail with hover tooltips ── */
  if (!expanded) return (
    <>
      <nav className={`hidden md:flex w-14 flex-col items-center pt-3 pb-4 shrink-0 ${bg}`}>
        <button onClick={onToggle} className={`rail-btn w-9 h-9 rounded-lg flex items-center justify-center ${textSecondary} ${hoverBg} transition-all mb-1`}>
          <I.Panel /><span className="rail-tip">Expand</span>
        </button>
        <button onClick={() => { sessionStorage.removeItem('loka_superagent_sid'); sessionStorage.removeItem('loka_sa_analysis_pending'); go(Page.SUPER_AGENT); }} className={`rail-btn w-9 h-9 rounded-lg flex items-center justify-center ${textSecondary} ${hoverBg} transition-all mb-1`}>
          <I.Plus /><span className="rail-tip">New chat</span>
        </button>
        <button data-search-toggle onClick={() => { setSearchOpen(true); onToggle(); }} className={`rail-btn w-9 h-9 rounded-lg flex items-center justify-center ${textSecondary} ${hoverBg} transition-all mb-3`}>
          <I.Search /><span className="rail-tip">Search</span>
        </button>
        <div className="flex flex-col gap-0.5 flex-1 w-full px-2">
          {navItems.map(({ key, icon: Icon, label, anim }) => (
            <button key={key} onClick={() => go(key)}
              className={`rail-btn ${anim} relative w-full h-9 rounded-lg flex items-center justify-center transition-all ${page === key ? activeBg : `${textSecondary} ${hoverBg}`
                }`}>
              <div className="nav-icon-wrap"><Icon /></div>
              <span className="rail-tip">{label}</span>
            </button>
          ))}
        </div>
        <div className="relative flex flex-col items-center gap-1.5">
          <div onClick={() => isLoggedIn ? setDesktopUserMenuOpen(!desktopUserMenuOpen) : (privyReady ? onLogin() : undefined)} className={`w-8 h-8 ${(isLoggedIn || (!privyReady && userName)) ? 'bg-emerald-500 text-white' : avatarBg} rounded-full flex items-center justify-center text-[10px] font-semibold cursor-pointer hover:ring-2 hover:ring-gray-300 transition-all overflow-hidden`}>{userAvatar ? <img src={userAvatar} alt="" className="w-full h-full object-cover" /> : (userInitial || 'U')}</div>
          {isLoggedIn && (
            <PlanUpgradeEntry size="rail" />
          )}
          <UserMenu open={desktopUserMenuOpen} onClose={() => setDesktopUserMenuOpen(false)} position="right" isDark={isDark} onToggleDark={onToggleDark} onLogout={onLogout} userName={userName} userInitial={userInitial} userAvatar={userAvatar} onItemClick={() => { if (mobileDrawerOpen && onCloseMobileDrawer) onCloseMobileDrawer(); }} />
        </div>
      </nav>
      {mobileOverlay}
    </>
  );

  /* ── Expanded: 256px full sidebar ── */
  return (
    <>
      <aside className={`hidden md:flex w-64 flex-col shrink-0 ${bg}`}>
        {/* Header */}
        <div className="flex items-center justify-between pl-5 pr-2 pt-5 pb-3">
          <span className={`text-[15px] font-bold tracking-tight ${textPrimary} cursor-default select-none`}>Loka</span>
          <div className="flex items-center gap-0.5">
            <button data-search-toggle onClick={() => setSearchOpen(v => !v)} className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${searchOpen ? activeBg : `${textMuted} ${hoverBg}`}`} title="Search"><I.Search /></button>
            <button onClick={onToggle} className={`w-7 h-7 rounded-md flex items-center justify-center ${textMuted} ${hoverBg} transition-all`} title="Collapse sidebar"><I.Panel /></button>
          </div>
        </div>

        {/* New chat */}
        <div className="px-3 pb-1">
          <SideLink icon={I.Plus} label="New chat" onClick={() => { sessionStorage.removeItem('loka_superagent_sid'); sessionStorage.removeItem('loka_sa_analysis_pending'); go(Page.SUPER_AGENT); }} isDark={isDark} />
        </div>

        {navItems.length > 0 && (
          <>
            <div className={`mx-4 my-2 h-px ${divider}`} />
            <div className="px-3 space-y-px">
              {navItems.map(({ key, icon, label, anim }) => (
                <SideLink key={key} icon={icon} label={label} active={page === key} anim={anim}
                  onClick={() => go(key)} isDark={isDark} />
              ))}
            </div>
          </>
        )}

        <div className={`mx-4 my-3 h-px ${divider}`} />

        {/* Recents */}
        <div className="px-3 flex-1 overflow-y-auto min-h-0">
          {(isLoggedIn || !privyReady) && (
            <>
              {isLoggedIn && searchOpen && (
                <div ref={searchPanelRef}>
                  <ChatSearchPanel isDark={isDark} onCloseMobileDrawer={onCloseMobileDrawer} autoFocus onQueryChange={setSearchQuery} />
                </div>
              )}
              <p className={`px-2 pb-2 text-[11px] font-medium ${textMuted} select-none`}>Recents</p>
              {!privyReady || (isLoadingConversations && conversations.length === 0) ? (
                <RecentsSkeleton isDark={isDark} />
              ) : sortedConversations.length > 0 ? (
                sortedConversations.map((c) => (
                  <div key={c.id} className="relative group/recent">
                    {renamingId === c.id ? (
                      <div className="px-2 py-1">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={confirmRename}
                          onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenamingId(null); }}
                          className={`w-full text-[13px] ${isDark ? 'text-gray-200 bg-white/10 border-white/20 focus:border-blue-400' : 'text-gray-700 bg-gray-50 border-gray-200 focus:border-blue-400'} border rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-blue-100`}
                        />
                      </div>
                    ) : (
                      <>
                        <button onClick={() => { navigate(c.agentId === 'research' ? `/signal-radar?session=${c.id}` : `/?session=${c.id}`); if (window.innerWidth < 768) onToggle(); }} title={c.title} className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[13px] ${textSecondary} hover:${textPrimary} ${hoverBg} transition-all`}>
                          {c.pinned && <svg className={`w-3 h-3 ${textMuted} shrink-0`} fill="currentColor" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>}
                          <span className="truncate flex-1">{c.title}</span>
                          {activeSessions.has(c.id) && (
                            <svg className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMoreMenuId(moreMenuId === c.id ? null : c.id); }}
                          className={`absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover/recent:opacity-100 ${hoverBg} ${textMuted} hover:text-gray-600 transition-all ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                        </button>
                        {moreMenuId === c.id && (
                          <div ref={moreMenuRef} className={`absolute right-0 top-full mt-1 z-50 w-36 ${isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'} border rounded-lg shadow-lg py-1`} style={{ animation: 'menu-pop 0.12s ease-out' }}>
                            <button onClick={() => { togglePin(c.id); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] ${isDark ? 'text-gray-300 hover:bg-white/8' : 'text-gray-600 hover:bg-gray-50'} transition-colors`}>
                              <svg className="w-3.5 h-3.5" fill={c.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
                              {c.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button onClick={() => { setMoreMenuId(null); startRename(c); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] ${isDark ? 'text-gray-300 hover:bg-white/8' : 'text-gray-600 hover:bg-gray-50'} transition-colors`}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              Rename
                            </button>
                            <button onClick={() => { setMoreMenuId(null); setDeleteConfirm({ id: c.id, title: c.title }); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] ${isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50'} transition-colors`}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              ) : (
                <p className={`px-2 text-[12px] ${textMuted}`}>No recent chats</p>
              )}
            </>
          )}
        </div>

        {/* User */}
        <div className="px-3 py-3 relative">
          <div className="flex items-center gap-2">
            <div onClick={() => isLoggedIn ? setDesktopUserMenuOpen(!desktopUserMenuOpen) : (privyReady ? onLogin() : undefined)} className={`flex-1 min-w-0 flex items-center gap-2.5 px-2 py-2 rounded-lg ${hoverBg} transition-all cursor-pointer group/user`}>
              <div className={`w-7 h-7 ${(isLoggedIn || (!privyReady && userName)) ? 'bg-emerald-500 text-white' : avatarBg} rounded-full flex items-center justify-center text-[10px] font-semibold overflow-hidden`}>{userAvatar ? <img src={userAvatar} alt="" className="w-full h-full object-cover" /> : (userInitial || 'U')}</div>
              <span className={`flex-1 text-[13px] font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} truncate`}>{isLoggedIn ? (userName || 'User') : (userName || (privyReady ? 'Sign in' : '···'))}</span>
              <div className={`opacity-0 group-hover/user:opacity-100 transition-opacity ${textMuted}`}><I.Dots /></div>
            </div>
            {isLoggedIn && (
              <PlanUpgradeEntry size="sm" className="shrink-0" />
            )}
          </div>
          <UserMenu open={desktopUserMenuOpen} onClose={() => setDesktopUserMenuOpen(false)} isDark={isDark} onToggleDark={onToggleDark} onLogout={onLogout} userName={userName} userInitial={userInitial} userAvatar={userAvatar} onItemClick={() => { if (mobileDrawerOpen && onCloseMobileDrawer) onCloseMobileDrawer(); }} />
        </div>

        {/* Custom Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pt-10 pb-20">
            <div className={`${isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'} border shadow-2xl rounded-2xl w-full max-w-sm overflow-hidden`} style={{ animation: 'menu-pop 0.15s ease-out' }}>
              <div className={`px-5 pt-5 pb-4 border-b ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
                <h3 className={`text-[16px] font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-1.5`}>Delete Conversation</h3>
                <p className={`text-[13px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Are you sure you want to delete <strong className={isDark ? 'text-gray-200' : 'text-gray-700'}>"{deleteConfirm.title}"</strong>? This action cannot be undone.
                </p>
              </div>
              <div className={`px-5 py-3.5 ${isDark ? 'bg-black/20' : 'bg-gray-50'} flex items-center justify-end gap-2.5`}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${isDark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-200'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {mobileOverlay}
    </>
  );
};

/* Sidebar nav link */
const SideLink: React.FC<{
  icon: React.FC; label: string; active?: boolean; badge?: number; anim?: string; onClick: () => void; isDark?: boolean;
}> = ({ icon: Icon, label, active, badge, anim, onClick, isDark }) => (
  <button onClick={onClick}
    className={`${anim || ''} w-full flex items-center gap-2.5 px-2 py-[7px] rounded-md text-[14px] transition-all ${active
      ? (isDark ? 'bg-white/10 text-white font-semibold' : 'bg-gray-100 text-gray-900 font-semibold')
      : (isDark ? 'text-gray-400 hover:text-gray-100 hover:bg-white/8' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')
      }`}>
    <div className={`nav-icon-wrap ${active ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-gray-400' : 'text-gray-500')}`}><Icon /></div>
    <span className="flex-1 text-left">{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="min-w-[18px] h-[18px] bg-gray-900 text-white text-[10px] font-semibold rounded-full flex items-center justify-center px-1">{badge}</span>
    )}
  </button>
);

export default Sidebar;
