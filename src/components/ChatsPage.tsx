import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { api } from '../services/api';
import { socket } from '../services/socket';
import { I } from '../App';


type PollData = {
  id: string;
  question: string;
  options: { id: string; text: string; votes: number }[];
  duration: string;
  total: number;
  voted?: string; // option id the user voted for
};
type LocalMsg = { id: string; type: 'text' | 'image' | 'file' | 'poll'; content: string; poll?: PollData; file?: File };

const POLL_DURATIONS = ['1h', '12h', '1 day', '3 days'];

const PollModal: React.FC<{ onClose: () => void; onSubmit: (p: PollData) => void }> = ({ onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState('1 day');

  const updateOption = (i: number, v: string) => setOptions(o => o.map((x, idx) => idx === i ? v : x));
  const removeOption = (i: number) => setOptions(o => o.filter((_, idx) => idx !== i));
  const addOption = () => setOptions(o => [...o, '']);

  const canSubmit = question.trim() && options.filter(o => o.trim()).length >= 2;

  const handleSubmit = () => {
    const filled = options.filter(o => o.trim());
    onSubmit({
      id: Date.now().toString(),
      question: question.trim(),
      options: filled.map((text, i) => ({ id: `opt-${i}`, text, votes: 0 })),
      duration,
      total: 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-bold text-gray-900">Create Poll</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Question */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Question</label>
            <input autoFocus value={question} onChange={e => setQuestion(e.target.value)}
              placeholder="What do you want to ask?"
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-300" />
          </div>
          {/* Options */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Options</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={opt} onChange={e => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 px-3.5 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-300" />
                  {options.length > 2 && (
                    <button onClick={() => removeOption(i)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addOption} className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 hover:text-gray-900 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
              Add option
            </button>
          </div>
          {/* Duration */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Duration</label>
            <div className="flex gap-2 flex-wrap">
              {POLL_DURATIONS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${duration === d ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-400 hover:bg-gray-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${canSubmit ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            Send Poll
          </button>
        </div>
      </div>
    </div>
  );
};

const PollCard: React.FC<{ poll: PollData; onVote?: (pollId: string, optId: string) => void }> = ({ poll: parentPoll, onVote }) => {
  const [poll, setPoll] = useState(parentPoll);

  // Sync with parent when data updates (e.g. from WebSocket)
  useEffect(() => {
    setPoll(prev => ({
      ...parentPoll,
      voted: parentPoll.voted || prev.voted,
    }));
  }, [parentPoll]);

  const vote = async (optId: string) => {
    if (poll.voted) return;
    // Optimistic update
    setPoll(p => ({
      ...p,
      voted: optId,
      total: p.total + 1,
      options: p.options.map(o => o.id === optId ? { ...o, votes: o.votes + 1 } : o),
    }));
    // Call API
    if (onVote) {
      onVote(poll.id, optId);
    } else {
      try {
        await api.votePoll(poll.id, optId);
      } catch (err) {
        console.error('Vote failed:', err);
        setPoll(p => ({
          ...p,
          voted: undefined,
          total: p.total - 1,
          options: p.options.map(o => o.id === optId ? { ...o, votes: o.votes - 1 } : o),
        }));
      }
    }
  };

  const totalVotes = poll.total;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 w-[280px]">
      {/* Badge */}
      <div className="flex items-center gap-1.5 mb-3">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Poll · {poll.duration}</span>
      </div>
      {/* Question */}
      <p className="text-[14px] font-bold text-gray-900 mb-3 leading-snug">{poll.question}</p>
      {/* Options */}
      <div className="space-y-2">
        {poll.options.map(opt => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          const isVoted = poll.voted === opt.id;
          return (
            <button key={opt.id} onClick={() => vote(opt.id)} disabled={!!poll.voted}
              className={`w-full text-left rounded-xl border transition-all overflow-hidden ${
                poll.voted
                  ? isVoted ? 'border-gray-900 bg-gray-900' : 'border-gray-100 bg-gray-50'
                  : 'border-gray-100 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
              }`}>
              <div className="relative px-3 py-2.5">
                {poll.voted && (
                  <div className={`absolute inset-0 rounded-xl transition-all ${isVoted ? 'bg-gray-900' : 'bg-gray-100'}`}
                    style={{ width: `${pct}%`, borderRadius: 'inherit', opacity: 0.15 }} />
                )}
                <div className="relative flex items-center justify-between">
                  <span className={`text-[13px] font-semibold ${poll.voted ? (isVoted ? 'text-white' : 'text-gray-600') : 'text-gray-800'}`}>{opt.text}</span>
                  {poll.voted && <span className={`text-[11px] font-bold ${isVoted ? 'text-gray-300' : 'text-gray-400'}`}>{pct}%</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {/* Footer */}
      <p className="text-[10px] text-gray-400 mt-3">
        {poll.voted ? `${totalVotes} vote${totalVotes !== 1 ? 's' : ''}` : 'Tap to vote'}
      </p>
    </div>
  );
};

const AddMemberModal: React.FC<{
  existingIds: string[];
  onClose: () => void;
  onConfirm: (userIds: string[]) => void;
}> = ({ existingIds, onClose, onConfirm }) => {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);

  useEffect(() => {
    api.getFriends().then((res: any[]) => {
      const friends = res.map((f: any) => ({
        id: f.user.id,
        name: f.user.name,
        avatar: f.user.avatar,
        email: f.user.email
      }));
      setContacts(friends.filter((u: any) => !existingIds.includes(u.id)));
      setLoadingContacts(false);
    }).catch(err => {
      console.error(err);
      setLoadingContacts(false);
    });
  }, [existingIds]);

  const toggle = (id: string) =>
    setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleConfirm = () => {
    const ids = contacts.filter(c => picked.has(c.id)).map(c => c.id);
    onConfirm(ids);
  };

  const GRAD_MAP: Record<string, string> = {
    'bg-blue-500': 'from-blue-400 to-blue-500',
    'bg-violet-500': 'from-violet-400 to-violet-500',
    'bg-emerald-500': 'from-emerald-400 to-emerald-500',
    'bg-amber-500': 'from-amber-400 to-amber-500',
    'bg-rose-500': 'from-rose-400 to-rose-500',
    'bg-cyan-500': 'from-cyan-400 to-cyan-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Add Member</h2>
            {picked.size > 0 && <p className="text-[11px] text-gray-400">{picked.size} selected</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {/* List */}
        <div className="overflow-y-auto flex-1 py-2">
          {loadingContacts ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-8">All valid friends are already in this group</p>
          ) : contacts.map(c => {
            const userColor = `bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((c.name || 'a').charCodeAt(0)) % 5]}-500`;
            const isSel = picked.has(c.id);
            const initials = (c.name || c.email || 'U').substring(0, 2).toUpperCase();
            return (
              <div key={c.id} onClick={() => toggle(c.id)}
                className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                {c.avatar && c.avatar.startsWith('http') ? (
                  <img src={c.avatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                ) : (
                  <div className={`w-8 h-8 rounded-full ${userColor} text-white flex items-center justify-center text-[11px] font-black shrink-0`}>{initials}</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{c.name || c.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-gray-400 truncate">{c.email}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${isSel ? 'bg-gray-900 border-gray-900' : 'border-gray-200'}`}>
                  {isSel && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
            );
          })}
        </div>
        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all">Cancel</button>
          <button onClick={handleConfirm} disabled={picked.size === 0}
            className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${picked.size > 0 ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            {picked.size > 0 ? `Add (${picked.size})` : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ChatsPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'All' | 'People' | 'Groups'>('All');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  const setSelected = useCallback((id: string | null) => {
    setSelectedState(id);
    selectedRef.current = id;
  }, []);

  const selected = selectedState;
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const convId = params.get('convId');
    if (convId) {
      setSelected(convId);
      // Optional: clear the url without refreshing so it doesn't get stuck if user closes chat
      window.history.replaceState({}, '', '/chat');
    }
  }, [location.search]);

  const [conversations, setConversations] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [localMsgs, setLocalMsgs] = useState<LocalMsg[]>([]);
  const [showPoll, setShowPoll] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMembers, setShowMembers] = useState(window.innerWidth >= 768);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [mktSearch, setMktSearch] = useState('');
  const [mktCat, setMktCat] = useState('All');
  const [plusMenu, setPlusMenu] = useState(false);
  const [plusModal, setPlusModal] = useState<'friend' | 'group' | null>(null);
  const [memberMenuOpts, setMemberMenuOpts] = useState<string | null>(null);
  const [memberToKick, setMemberToKick] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [groupPolls, setGroupPolls] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user: privyUser } = usePrivy();
  const dbUserId = privyUser?.id?.replace('did:privy:', '') || '';
  const dbUserName = privyUser?.google?.name || privyUser?.twitter?.username || privyUser?.email?.address?.split('@')[0] || 'You';

  // Auto-scroll to latest message
  useEffect(() => {
    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Immediate scroll
    scrollToBottom();
    // Delayed scrolls to handle async image/video loading which changes container height
    const t1 = setTimeout(scrollToBottom, 150);
    const t2 = setTimeout(scrollToBottom, 500);
    const t3 = setTimeout(scrollToBottom, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [chatMessages, localMsgs, groupPolls]);

  // Extract API call so we can reuse it when unknown chats ping us via WS
  const loadConvs = useCallback(() => {
    return api.getCommunityConversations()
      .then(data => {
        setConversations(data.map((c: any) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar || c.name?.charAt(0) || '?',
        role: c.type === 'group' ? 'group' : 'human',
        lastMsg: c.lastMsg || '',
        time: c.lastMsgAt ? new Date(c.lastMsgAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        unread: c.unread || 0,
        isGroup: c.isGroup,
        color: c.isGroup
          ? `bg-${['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan'][Math.abs(c.name.charCodeAt(0)) % 6]}-100 text-${['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan'][Math.abs(c.name.charCodeAt(0)) % 6]}-600`
          : `bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((c.name || 'a').charCodeAt(0)) % 5]}-500 text-white`,
        groupMembers: c.groupMembers || [],
      })));
      setTimeout(() => {
        data.forEach((c: any) => {
          if (c.isGroup) {
            socket.emit('join-group', c.id);
          }
        });
      }, 500);
    }).catch((err) => {
      console.error('[loadConvs] Failed to load conversations:', err.message);
      // Only clear if we have no existing data (first load). Keep stale data on refresh failures.
      setConversations(prev => prev.length > 0 ? prev : []);
    });
  }, []);

  // Load conversations from API on mount (guarded by auth to prevent 401 race)
  const { ready: chatsReady, authenticated: chatsAuthenticated, getAccessToken: chatsGetAccessToken, login: chatsLogin } = usePrivy();
  useEffect(() => {
    if (!(chatsReady && chatsAuthenticated)) return;
    setLoadingConvs(true);
    // Ensure token is set before fetching (child effects fire before parent effects)
    chatsGetAccessToken().then(token => {
      if (token) {
        api.setToken(token);
        api.setTokenGetter(chatsGetAccessToken);
      }
      return loadConvs();
    }).catch(() => loadConvs()).finally(() => setLoadingConvs(false));
  }, [loadConvs, chatsReady, chatsAuthenticated, chatsGetAccessToken]);

  // Real-time WebSocket listener for new messages
  useEffect(() => {
    const handleNewMsg = (payload: any) => {
      // Backend sends { conversationId, message: { id, content, sender, ... } }
      // Or for groups: message directly with groupId
      const msg = payload.message || payload;
      const convId = payload.conversationId || msg.groupId;
      const formattedMsg = {
        id: msg.id,
        senderId: msg.senderId || msg.userId,
        content: msg.content,
        attachmentUrl: msg.attachmentUrl || null,
        attachmentType: msg.attachmentType || null,
        createdAt: msg.createdAt,
        sender: msg.sender || msg.user || { id: msg.userId, name: 'User' },
      };

      // 1. Update the active chat log if we are currently looking at it
      if (String(selectedRef.current) === String(convId)) {
        setChatMessages(prev => {
          if (prev.some(m => m.id === formattedMsg.id)) return prev;
          return [...prev, formattedMsg];
        });
        // We received a new message dynamically while targeting this window, reset read cursor
        api.markConversationAsRead(convId).catch(console.error);
      }

      // 2. Update the left conversational menu preview snippets
      setConversations(prev => {
        const exists = prev.some(c => String(c.id) === String(convId));
        if (!exists) {
          // A brand new conversation started (e.g. someone messaged us first time), we must fetch its metadata
          loadConvs();
          return prev;
        }
        return prev.map(c => String(c.id) === String(convId) ? {
          ...c,
          lastMsg: formattedMsg.content || (formattedMsg.attachmentType === 'image' ? '📷 Photo' : formattedMsg.attachmentType === 'video' ? '🎬 Video' : formattedMsg.attachmentType === 'file' ? '📎 File' : ''),
          time: new Date(formattedMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          unread: String(selectedRef.current) === String(convId) ? 0 : (c.unread || 0) + 1
        } : c).sort((a, b) => {
          // Bring updated conversation to top
          if (String(a.id) === String(convId)) return -1;
          if (String(b.id) === String(convId)) return 1;
          return 0;
        });
      });
    };

    socket.on('dm:message', handleNewMsg);
    socket.on('group:message', handleNewMsg);
    socket.on('group:joined', loadConvs);
    socket.on('group:removed', loadConvs);
    const handleDissolved = (data: any) => {
      setConversations(prev => prev.filter(c => String(c.id) !== String(data.groupId)));
      if (String(selectedRef.current) === String(data.groupId)) setSelected(null);
    };
    socket.on('group:dissolved', handleDissolved);

    // Real-time member join/leave → update sidebar member list & count
    const handleMemberJoined = (data: any) => {
      setConversations(prev => prev.map(c => {
        if (String(c.id) !== String(data.groupId)) return c;
        const already = c.groupMembers?.some((m: any) => m.id === data.userId);
        return {
          ...c,
          groupMembers: already ? c.groupMembers : [
            ...(c.groupMembers || []),
            { id: data.userId, name: data.name, avatar: data.avatar, role: data.role },
          ],
        };
      }));
    };
    const handleMemberLeft = (data: any) => {
      setConversations(prev => prev.map(c => {
        if (String(c.id) !== String(data.groupId)) return c;
        return {
          ...c,
          groupMembers: (c.groupMembers || []).filter((m: any) => m.id !== data.userId),
        };
      }));
    };
    socket.on('group:member:joined', handleMemberJoined);
    socket.on('group:member:left', handleMemberLeft);

    // Poll events
    const handleNewPoll = (poll: any) => {
      if (String(selectedRef.current) === String(poll.groupId)) {
        setGroupPolls(prev => {
          if (prev.some(p => p.id === poll.id)) return prev;
          return [...prev, poll];
        });
      }
      // Update sidebar preview for all group members
      setConversations(prev => prev.map(c => String(c.id) === String(poll.groupId) ? {
        ...c,
        lastMsg: `📊 Poll: ${poll.question}`,
        time: new Date(poll.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      } : c));
    };
    const handlePollVote = (data: any) => {
      setGroupPolls(prev => prev.map(p => p.id === data.pollId ? {
        ...p, options: data.options, total: data.total,
      } : p));
    };
    socket.on('group:poll', handleNewPoll);
    socket.on('group:poll-vote', handlePollVote);

    return () => {
      socket.off('dm:message', handleNewMsg);
      socket.off('group:message', handleNewMsg);
      socket.off('group:joined', loadConvs);
      socket.off('group:removed', loadConvs);
      socket.off('group:dissolved', handleDissolved);
      socket.off('group:member:joined', handleMemberJoined);
      socket.off('group:member:left', handleMemberLeft);
      socket.off('group:poll', handleNewPoll);
      socket.off('group:poll-vote', handlePollVote);
    };
  }, [loadConvs, setSelected]);

  // Load messages when a conversation is selected
  useEffect(() => {
    if (!selected) { setChatMessages([]); return; }
    
    // Optimistically clear the unread badge on the sidebar
    setConversations(prev => prev.map(c => 
      c.id === selected ? { ...c, unread: 0 } : c
    ));
    
    // Sync the read cursor with the backend database
    api.markConversationAsRead(selected).catch(console.error);

    setLoadingMsgs(true);
    api.getConversationMessages(selected)
      .then(data => {
        setChatMessages(data.messages || []);
        // Scroll to bottom after messages load
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
      })
      .catch(() => setChatMessages([]))
      .finally(() => setLoadingMsgs(false));

    // Load polls (always attempt — API returns 403 for non-groups, which we silently ignore)
    api.getGroupPolls(selected).then(setGroupPolls).catch(() => setGroupPolls([]));
  }, [selected]);

  // Send message handler
  const handleSendMessage = async () => {
    if ((!input.trim() && localMsgs.filter(m => m.type === 'file' || m.type === 'image').length === 0) || !selected || sendingMsg) return;
    const text = input.trim();
    const attachments = localMsgs.filter(m => m.type === 'image' || m.type === 'file');
    setInput('');
    setSendingMsg(true);

    try {
      // 1. Send attachments
      for (const att of attachments) {
        if (!att.file) continue;
        const { url, type } = await api.uploadFile(att.file);
        const msg = await api.sendConversationMessage(selected, '', url, type);
        setChatMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      
      // 2. Send text message
      if (text) {
        const msg = await api.sendConversationMessage(selected, text);
        setChatMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }

      setLocalMsgs(prev => prev.filter(m => m.type !== 'image' && m.type !== 'file'));
      
      setConversations(prev => prev.map(c =>
        c.id === selected ? { ...c, lastMsg: text || '📷 Photo', time: 'now' } : c
      ));
    } catch {
      // Fallback
    } finally {
      setSendingMsg(false);
    }
  };

  const handleSendFile = async (file: File, type: 'image' | 'file') => {
    if (!selected) return;
    setSendingMsg(true);

    const tempId = Date.now().toString() + 'uploading';
    // Add temporary uploading indicator
    setChatMessages(prev => [...prev, {
      id: tempId,
      senderId: dbUserId,
      content: `Uploading ${file.name}...`,
      attachmentType: 'uploading',
      createdAt: new Date().toISOString(),
      sender: { id: dbUserId, name: dbUserName, avatar: null },
    } as any]);

    try {
      const uploadRes = await api.uploadFile(file);
      const msgContent = uploadRes.type === 'file' ? file.name : '';
      const msg = await api.sendConversationMessage(selected, msgContent, uploadRes.url, uploadRes.type);
      
      setChatMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempId);
        if (filtered.some(m => m.id === msg.id)) return filtered;
        return [...filtered, msg];
      });
      const previewLabel = uploadRes.type === 'image' ? '📷 Photo' : uploadRes.type === 'video' ? '🎬 Video' : '📎 File';
      setConversations(prev => prev.map(c =>
        c.id === selected ? { ...c, lastMsg: previewLabel, time: 'now' } : c
      ));
    } catch (err: any) {
      console.error('[handleSendFile] Upload failed:', err);
      // Replace uploading with error message
      setChatMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        content: `Upload failed: ${err.message || 'Unknown error'}`,
        attachmentType: 'error'
      } : m));
      // Remove error after 3 seconds
      setTimeout(() => setChatMessages(p => p.filter(m => m.id !== tempId)), 3000);
    } finally {
      setSendingMsg(false);
    }
  };

  const MKT_CATS = ['All', 'Risk Management', 'Investment Analysis', 'Operations', 'DeFi & On-chain'];
  const MKT_AGENTS = [
    { name: 'Risk Assessor', desc: 'Real-time credit scoring & borrower risk analysis using on-chain data', cat: 'Risk Management', color: 'bg-orange-500' },
    { name: 'Portfolio Risk Monitor', desc: 'Monitors concentration risk, liquidation thresholds & VaR metrics', cat: 'Risk Management', color: 'bg-rose-500' },
    { name: 'Fraud Detector', desc: 'ML-powered anomaly detection across transactions and wallet activities', cat: 'Risk Management', color: 'bg-red-400' },
    { name: 'Yield Optimizer', desc: 'Find and optimize the best yield opportunities across protocols', cat: 'DeFi & On-chain', color: 'bg-violet-500' },
    { name: 'Market Analyst', desc: 'Real-time market intelligence and investment opportunity identification', cat: 'Investment Analysis', color: 'bg-blue-500' },
    { name: 'Compliance Bot', desc: 'Automated KYC/AML checks and regulatory reporting', cat: 'Operations', color: 'bg-emerald-500' },
  ];
  const filteredMkt = mktSearch
    ? MKT_AGENTS.filter(a => a.name.toLowerCase().includes(mktSearch.toLowerCase()))
    : mktCat === 'All' ? MKT_AGENTS : MKT_AGENTS.filter(a => a.cat === mktCat);

  const filtered = filter === 'All' ? conversations
    : filter === 'People' ? conversations.filter(m => !m.isGroup)
      : conversations.filter(m => m.isGroup);

  const sel = selected ? conversations.find(m => m.id === selected) : null;

  // Merge polls into message timeline
  const mergedMsgs = useMemo(() => {
    const pollMsgs = groupPolls.map(p => ({
      id: `poll:${p.id}`,
      _isPoll: true,
      _pollData: p,
      senderId: p.creator?.id || p.userId,
      content: '',
      createdAt: p.createdAt,
      sender: p.creator || { id: p.userId, name: 'User' },
    }));
    return [...chatMessages, ...pollMsgs].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [chatMessages, groupPolls]);

  const msgs = mergedMsgs;
  
  const members = sel?.isGroup && sel.groupMembers ? {
    agents: [],
    members: sel.groupMembers.map((m: any) => ({
      id: m.id || m.userId,
      name: m.name || m.id,
      online: true,
      avatar: m.avatar,
      role: m.role
    })),
    isAdmin: sel.groupMembers.some((m: any) => m.id === dbUserId && ['creator', 'admin'].includes(m.role)),
  } : null;

  const [showAddMember, setShowAddMember] = useState(false);
  const [showDissolve, setShowDissolve] = useState(false);

    const removeMember = async (userId: string) => {
    if (!selected) return;
    try {
      const result = await api.removeGroupMember(selected, userId);
      setConversations(prev => prev.map(c =>
        c.id === selected ? { ...c, groupMembers: result.members } : c
      ));
    } catch (err) {
      console.error('Failed to kick member', err);
    }
  };
  const removeAgent = (name: string) => { console.log('TODO: remove agent', name); };
  const addMembers = async (userIds: string[]) => {
    if (!selected) return;
    try {
      const result = await api.addGroupMembers(selected, userIds);
      // Update the local conversation's groupMembers with the new list from server
      setConversations(prev => prev.map(c =>
        c.id === selected ? { ...c, groupMembers: result.members } : c
      ));
    } catch (err) {
      console.error('Failed to add members', err);
    }
  };
  const dissolveGroup = async () => {
    if (!selected) return;
    try {
      await api.dissolveGroup(selected);
      setConversations(prev => prev.filter(c => c.id !== selected));
      setSelected(null);
      setShowDissolve(false);
    } catch (err) {
      console.error('Failed to dissolve group', err);
      alert('Failed to dissolve group. Only the group creator can perform this action.');
      setShowDissolve(false);
    }
  };

  if (chatsReady && !chatsAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-full p-6 animate-fadeIn md:bg-gray-50/50">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-2xl font-black text-black mb-2">Authentication Required</h2>
          <p className="text-sm font-medium text-gray-400 leading-relaxed mb-6">
            Please sign in to access your private chats and community groups.
          </p>
          <button
            onClick={() => window.dispatchEvent(new Event('show-auth-modal'))}
            className="px-8 py-3 bg-black text-white rounded-full text-xs font-bold tracking-widest hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Modals */}
      {plusModal === 'friend' && <AddFriendModal onClose={() => setPlusModal(null)} />}
      {plusModal === 'group' && (
        <CreateGroupModal
          onClose={() => setPlusModal(null)}
          onCreated={(group: any) => {
            const groupColor = `bg-${['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan'][Math.abs(group.name.charCodeAt(0)) % 6]}-100 text-${['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan'][Math.abs(group.name.charCodeAt(0)) % 6]}-600`;
            setConversations(prev => [{
              id: group.id,
              name: group.name,
              avatar: group.avatar || group.name.charAt(0),
              role: 'group',
              lastMsg: 'Group created',
              time: 'now',
              unread: 0,
              isGroup: true,
              color: groupColor,
              groupMembers: group.members?.map((m: any) => ({
                id: m.user?.id || m.userId,
                name: m.user?.name || 'Unknown',
                avatar: m.user?.avatar,
                role: m.role,
              })) || [],
            }, ...prev]);
            setSelected(group.id);
            setPlusModal(null);
            // Also join the socket room
            socket.emit('join-group', group.id);
          }}
        />
      )}
      {/* ── Left: conversation list ── */}
      {/* Mobile: full-width when no chat selected, hidden when chat is open */}
      {/* Desktop: always visible as 288px sidebar */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-72 border-r border-gray-100 flex-col shrink-0 bg-white`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="text-[15px] font-semibold text-gray-900">Chats</h2>
          {/* + button with dropdown */}
          <div className="relative">
            <button onClick={() => setPlusMenu(v => !v)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-all">
              <I.Plus />
            </button>
            {plusMenu && (
              <div className="absolute right-0 top-8 w-44 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-30 animate-fadeIn">
                <button onClick={() => { setPlusModal('friend'); setPlusMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-left">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                  Add Friend
                </button>
                <div className="h-px bg-gray-50" />
                <button onClick={() => { setPlusModal('group'); setPlusMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-left">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Create Group
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="px-4 pb-3 flex gap-1">
          {(['All', 'People', 'Groups'] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${filter === t ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>{t}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {loadingConvs && conversations.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={`sk-${i}`} className="w-full flex items-start gap-3 px-3 py-3 rounded-lg mb-1 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-2 bg-gray-100 rounded w-3/4"></div>
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <p className="text-[13px] font-bold text-gray-900 mb-1">No chats yet</p>
              <p className="text-[11px] text-gray-400 mb-4 max-w-[180px] leading-relaxed">Discover people and build your network</p>
              <button 
                onClick={() => navigate('/discover')}
                className="px-4 py-2 bg-gray-900 text-white text-[12px] font-bold rounded-xl hover:bg-gray-800 transition-all active:scale-95 flex items-center gap-2 shadow-sm inline-flex"
              >
                Discover People
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          ) : (
            filtered.map(m => (
              <button key={m.id} onClick={() => setSelected(m.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${selected === m.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold overflow-hidden ${m.color || 'bg-gray-100 text-gray-600'}`}>
                  {m.avatar?.startsWith('http') ? <img src={m.avatar} className="w-full h-full object-cover" alt="" /> : m.avatar?.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{m.name}</p>
                    <span className="text-[11px] text-gray-300 shrink-0 ml-2">{m.time}</span>
                  </div>
                  <p className="text-[12px] text-gray-400 truncate mt-0.5">{m.lastMsg}</p>
                </div>
                {m.unread > 0 && <span className="min-w-[18px] h-[18px] bg-gray-900 text-white text-[9px] font-semibold rounded-full flex items-center justify-center px-1 shrink-0">{m.unread}</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Center: chat detail ── */}
      {sel ? (
        <>
          <div className="flex-1 flex flex-col min-w-0 bg-gray-50/30">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white shrink-0">
              {/* Back button — mobile only */}
              <button onClick={() => setSelected(null)} className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-all shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold overflow-hidden shrink-0 ${sel.color || 'bg-gray-100 text-gray-600'}`}>
                {sel.avatar?.startsWith('http') ? <img src={sel.avatar} className="w-full h-full object-cover" alt="" /> : sel.avatar?.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-gray-900">{sel.name}</p>
                {sel.isGroup && members && (
                  <p className="text-[11px] text-gray-400 font-medium">{members ? (members.agents.length + members.members.length) : 0} members</p>
                )}
              </div>
              {/* Toggle members sidebar */}
              {sel.isGroup && members && (
                <button onClick={() => setShowMembers(v => !v)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${showMembers ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                    }`} title="Members">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="max-w-4xl mx-auto w-full space-y-4">
              {loadingMsgs && msgs.length === 0 ? (
                <div className="space-y-6 animate-pulse pt-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={`flex items-start gap-3 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0"></div>
                      <div className={`flex-1 flex flex-col gap-2 ${i % 2 === 0 ? 'items-end' : 'items-start'}`}>
                        <div className="h-2.5 bg-gray-200 rounded w-16"></div>
                        <div className={`h-12 bg-gray-100 rounded-xl ${i % 2 === 0 ? 'rounded-tr-sm' : 'rounded-tl-sm'} ${i === 3 ? 'w-3/4 max-w-[300px] h-20' : 'w-1/2 max-w-[200px]'}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : msgs.map((msg: any, i: number) => {
                if (!msg._isPoll && msg.attachmentType === 'poll') return null;
                // ── System message (Telegram-style centered label) ──
                if (msg.attachmentType === 'system') {
                  return (
                    <div key={msg.id || i} className="flex justify-center my-3">
                      <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-3.5 py-1 font-medium select-none">
                        {msg.content}
                      </span>
                    </div>
                  );
                }
                const isMe = (msg.senderId || msg.userId || msg.sender?.id) === dbUserId;
                return (
                <div key={msg.id || i}>
                  {msg.sender && (
                    <div className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((msg.sender.name || 'U').charCodeAt(0)) % 5]}-500`}>
                        {msg.sender.avatar?.startsWith('http') 
                           ? <img src={msg.sender.avatar} className="w-full h-full object-cover" alt="" /> 
                           : (msg.sender.name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="max-w-[70%]">
                        <div className={`flex items-center gap-1.5 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                          <span className="text-[12px] font-semibold text-gray-800">{isMe ? 'You' : (msg.sender.name || 'User')}</span>
                          <span className="text-[10px] text-gray-400">{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                        <div className={`flex flex-col gap-1.5 ${isMe ? 'items-end' : 'items-start'}`}>
                          {msg.attachmentUrl && msg.attachmentType === 'image' && (
                            <img src={msg.attachmentUrl} alt="attachment" className="max-w-[260px] rounded-xl border border-gray-100 shadow-sm object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setPreviewImage(msg.attachmentUrl)} onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} />
                          )}
                          {msg.attachmentUrl && msg.attachmentType === 'video' && (
                            <video
                              src={msg.attachmentUrl}
                              controls
                              preload="metadata"
                              className="max-w-[300px] rounded-xl border border-gray-100 shadow-sm"
                              onLoadedMetadata={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                            />
                          )}
                          {msg.attachmentUrl && msg.attachmentType === 'file' && (
                            <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" download className={`flex items-center gap-2.5 border border-gray-100 rounded-xl px-3.5 py-2.5 shadow-sm transition-colors ${isMe ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-white hover:bg-gray-50'}`}>
                              <svg className={`w-7 h-7 shrink-0 ${isMe ? 'text-gray-300' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              <div className="min-w-0">
                                <p className="text-[12px] font-semibold truncate max-w-[200px]">{msg.content || 'Document'}</p>
                                <p className={`text-[10px] ${isMe ? 'text-gray-400' : 'text-gray-500'}`}>Click to download</p>
                              </div>
                            </a>
                          )}
                          {msg.attachmentType === 'uploading' && (
                            <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-sm ${isMe ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-500 border border-gray-100'}`}>
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                              <span className="text-[13px] italic">{msg.content}</span>
                            </div>
                          )}
                          {msg.attachmentType === 'error' && (
                            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-sm bg-red-50 text-red-500 border border-red-100">
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span className="text-[13px]">{msg.content}</span>
                            </div>
                          )}
                          {msg._isPoll && msg._pollData && (
                            <PollCard poll={{ ...msg._pollData, voted: msg._pollData.voted || undefined }} />
                          )}
                          {!msg._isPoll && msg.content && msg.attachmentType !== 'file' && msg.attachmentType !== 'uploading' && msg.attachmentType !== 'error' && msg.attachmentType !== 'poll' && (
                            <div className={`${isMe ? 'bg-gray-900 text-white rounded-xl rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-700 rounded-xl rounded-tl-sm'} px-3.5 py-2.5 text-[13px] shadow-sm leading-relaxed`}>
                              {msg.content}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
              })}
              {loadingMsgs && msgs.length > 0 && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                </div>
              )}
              {/* Group Polls section removed — polls are now merged into the message timeline */}
              {/* Local messages (images, polls, etc.) */}
              {localMsgs.map((msg) => {
                const myColor = `bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((dbUserName || 'U').charCodeAt(0)) % 5]}-500`;
                const myInitials = (dbUserName || 'U').substring(0, 2).toUpperCase();
                return (
                <div key={msg.id} className="flex items-start gap-2.5 flex-row-reverse">
                  <div className={`w-7 h-7 rounded-full ${myColor} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>{myInitials}</div>
                  <div className="max-w-[75%]">
                    <div className="flex items-center gap-1.5 mb-1 flex-row-reverse">
                      <span className="text-[12px] font-semibold text-gray-800">{dbUserName}</span>
                      <span className="text-[10px] text-gray-300">now</span>
                    </div>
                    {/* Image message */}
                    {msg.type === 'image' && (
                      <img src={msg.content} alt="upload" className="max-w-[260px] rounded-xl border border-gray-100 shadow-sm object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setPreviewImage(msg.content)} />
                    )}
                    {/* File message */}
                    {msg.type === 'file' && (
                      <div className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl px-3.5 py-2.5 shadow-sm">
                        <svg className="w-7 h-7 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 truncate">{msg.content}</p>
                          <p className="text-[10px] text-gray-400">Attachment</p>
                        </div>
                      </div>
                    )}
                    {/* Text message */}
                    {msg.type === 'text' && (
                      <div className="bg-gray-900 rounded-xl rounded-tr-sm px-3.5 py-2.5 text-[13px] text-white shadow-sm leading-relaxed">{msg.content}</div>
                    )}
                    {/* Poll message */}
                    {msg.type === 'poll' && (
                      <PollCard poll={msg.poll!} />
                    )}
                  </div>
                </div>
              )})}
              {msgs.length === 0 && localMsgs.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-gray-400">No messages yet</p>
                </div>
              )}
                <div ref={messagesEndRef} className="h-px" />
              </div>
            </div>

            {/* Poll Modal */}
            {showPoll && selected && (
              <PollModal
                onClose={() => setShowPoll(false)}
                onSubmit={async (pollData) => {
                  try {
                    const newPoll = await api.createPoll(selected, {
                      question: pollData.question,
                      options: pollData.options.map(o => o.text),
                      duration: pollData.duration,
                    });
                    // Add poll immediately so creator sees it (WebSocket dedup prevents duplicates)
                    setGroupPolls(prev => {
                      if (prev.some(p => p.id === newPoll.id)) return prev;
                      return [...prev, newPoll];
                    });
                    // Update sidebar conversation preview
                    setConversations(prev => prev.map(c => c.id === selected ? {
                      ...c,
                      lastMsg: `📊 Poll: ${pollData.question}`,
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    } : c));
                  } catch (err) {
                    console.error('Failed to create poll:', err);
                  }
                  setShowPoll(false);
                }}
              />
            )}

            <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
              <div className="max-w-4xl mx-auto w-full relative">
              {showAttachMenu && (
                <div className="absolute bottom-[calc(100%+6px)] right-4 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden w-40 z-10 animate-fadeIn">
                  {/* Photo / Video */}
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={e => e.stopPropagation()}>
                    <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <span className="text-[12px] font-semibold text-gray-700">Photo or Video</span>
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0];
                      console.log('[Attach] Photo/Video selected:', file?.name, file?.size);
                      if (!file) return;
                      handleSendFile(file, 'image');
                      setShowAttachMenu(false);
                      e.target.value = '';
                    }} />
                  </label>
                  {/* Document */}
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors border-t border-gray-50"
                    onClick={e => e.stopPropagation()}>
                    <div className="w-6 h-6 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    </div>
                    <span className="text-[12px] font-semibold text-gray-700">Document</span>
                    <input type="file" className="hidden" onChange={e => {
                      const file = e.target.files?.[0];
                      console.log('[Attach] Document selected:', file?.name, file?.size);
                      if (!file) return;
                      handleSendFile(file, 'file');
                      setShowAttachMenu(false);
                      e.target.value = '';
                    }} />
                  </label>
                  {/* Poll — group only */}
                  {sel.isGroup && (
                    <button onClick={() => { setShowPoll(true); setShowAttachMenu(false); }}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors w-full text-left border-t border-gray-50">
                      <div className="w-6 h-6 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      </div>
                      <span className="text-[12px] font-semibold text-gray-700">Poll</span>
                    </button>
                  )}
                </div>
              )}
              {/* Click-away backdrop */}
              {showAttachMenu && <div className="fixed inset-0 z-[9]" onClick={() => setShowAttachMenu(false)} />}

              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3.5 py-2.5 focus-within:border-gray-300 transition-all">
                {/* Text input */}
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Message..."
                  className="flex-1 bg-transparent outline-none text-[13px] text-gray-900 placeholder:text-gray-400 min-w-0"
                />
                {/* Attach button */}
                <button onClick={() => setShowAttachMenu(v => !v)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 ${showAttachMenu ? 'text-gray-700 bg-gray-100' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                </button>
                {/* Mic / Send */}
                {input.trim() || localMsgs.some(m => m.type === 'image' || m.type === 'file') ? (
                  <button disabled={sendingMsg} onClick={handleSendMessage} className={`w-7 h-7 rounded-lg flex items-center justify-center bg-gray-900 text-white transition-all shrink-0 hover:bg-gray-700 ${sendingMsg ? 'opacity-50' : ''}`}>
                    <I.Send />
                  </button>
                ) : (
                  <button title="Voice input (coming soon)"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>
                )}
              </div>
              </div>
            </div>
          </div>

          {/* ── Right: members sidebar (groups only) ── */}
          {/* Mobile: right-sliding drawer with backdrop */}
          {sel.isGroup && members && showMembers && (
            <div className="md:hidden fixed inset-0 z-[100] flex justify-end">
              {/* Backdrop — z above mobile tab bar (z-50) so drawer is not covered */}
              <div 
                className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
                onClick={() => setShowMembers(false)}
                style={{ animation: 'fadeIn 0.25s ease' }}
              />
              <style>{`
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
              `}</style>
              {/* Drawer Container */}
              <div 
                className="relative w-[260px] bg-white h-full max-h-[100dvh] flex flex-col shadow-2xl rounded-l-2xl overflow-hidden min-h-0"
                style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)' }}
              >
                <div
                  className="flex items-center justify-between px-4 pb-4 border-b border-gray-100 bg-white z-10 shrink-0"
                  style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
                >
                  <div>
                    <p className="text-[15px] font-bold text-gray-900">Members</p>
                    <p className="text-[11px] text-gray-400 font-medium">{members.agents.length + members.members.length} total</p>
                  </div>
                  <button onClick={() => setShowMembers(false)} className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-6 space-y-6">
                  {/* ── AI Agents ── */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Agents</p>
                    {members.agents.map(a => (
                      <div key={a} className="flex items-center gap-2.5 py-2 group">
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-[12px] font-bold text-violet-600">{a[0]}</div>
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{a}</p>
                          <p className="text-[10px] text-emerald-500">Always online</p>
                        </div>
                        {members.isAdmin && (
                          <button onClick={() => removeAgent(a)}
                            className="w-8 h-8 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all active:bg-red-100">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    ))}
                    {/* Add Agent button — admin only */}
                    {members.isAdmin && (
                      <button onClick={() => { setShowMembers(false); setShowMarketplace(true); }}
                        className="flex items-center gap-3 mt-2 py-2 w-full text-left active:opacity-70">
                        <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
                        </div>
                        <span className="text-[13px] font-semibold text-gray-400">Add agent</span>
                      </button>
                    )}
                  </div>
                  {/* ── Members ── */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-4">Members</p>
                    {members.members.map(m => {
                      const userColor = `bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((m.name || 'a').charCodeAt(0)) % 5]}-500`;
                      return (
                        <div key={m.name} className="flex items-center gap-2.5 py-2 group">
                          <div className="relative shrink-0">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white overflow-hidden ${userColor}`}>
                              {m.avatar?.startsWith('http') ? <img src={m.avatar} className="w-full h-full object-cover" alt="" /> : m.name[0]?.toUpperCase()}
                            </div>
                            {m.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full" /> }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[13px] font-semibold text-gray-800 truncate">{m.name}</p>
                              {['creator', 'admin'].includes(m.role) && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 shrink-0">Admin</span>
                              )}
                            </div>
                            <p className={`text-[10px] ${m.online ? 'text-emerald-500' : 'text-gray-300'}`}>{m.online ? 'Online' : 'Offline'}</p>
                          </div>
                          {members.isAdmin && m.id !== dbUserId && (
                            <div className="relative shrink-0">
                              <button onClick={() => setMemberMenuOpts(memberMenuOpts === m.id ? null : m.id)}
                                className="w-8 h-8 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all active:bg-gray-200">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                              </button>
                              {memberMenuOpts === m.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setMemberMenuOpts(null)} />
                                  <div className="absolute right-0 top-9 w-40 bg-white border border-gray-100 rounded-xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] z-20 py-1 animate-fadeIn">
                                    <button onClick={() => { setMemberToKick(m); setMemberMenuOpts(null); }} className="w-full text-left px-4 py-3 text-[14px] font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      Remove User
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Add Member button — admin only */}
                    {members.isAdmin && (
                      <button onClick={() => { setShowMembers(false); setShowAddMember(true); }}
                        className="flex items-center gap-3 mt-2 py-2 w-full text-left active:opacity-70">
                        <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
                        </div>
                        <span className="text-[13px] font-semibold text-gray-400">Add member</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Admin: Dissolve group */}
                {members.isAdmin && (
                  <div
                    className="px-5 pt-4 border-t border-gray-100 bg-gray-50/50 mt-auto shrink-0 z-10"
                    style={{ paddingBottom: 'max(1.25rem, calc(0.5rem + env(safe-area-inset-bottom)))' }}
                  >
                    <button onClick={() => setShowDissolve(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold text-red-500 bg-white border border-red-100 shadow-sm transition-all active:scale-[0.98]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      Dissolve Group
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Desktop: sidebar */}
          {sel.isGroup && members && showMembers && (
            <div className="hidden md:flex w-60 border-l border-gray-100 bg-white flex-col shrink-0 overflow-y-auto">
              {/* Header */}
              <div className="px-4 pt-5 pb-3 border-b border-gray-50">
                <p className="text-[13px] font-bold text-gray-900">Members</p>
                <p className="text-[11px] text-gray-400">{members.agents.length + members.members.length} total</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                {/* ── AI Agents ── */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Agents</p>
                  {members.agents.map(a => (
                    <div key={a} className="flex items-center gap-2.5 py-1.5 group">
                      <div className="relative shrink-0">
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600">{a[0]}</div>
                        <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 border-2 border-white rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">{a}</p>
                        <p className="text-[10px] text-emerald-500">Always online</p>
                      </div>
                      {members.isAdmin && (
                        <button onClick={() => removeAgent(a)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {/* Add Agent button — admin only */}
                  {members.isAdmin && (
                    <button onClick={() => setShowMarketplace(true)}
                      className="flex items-center gap-2 mt-1 py-1.5 w-full text-left group">
                      <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-200 group-hover:border-gray-400 flex items-center justify-center shrink-0 transition-colors">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
                      </div>
                      <span className="text-[11px] font-semibold text-gray-400 group-hover:text-gray-700 transition-colors">Add agent</span>
                    </button>
                  )}
                </div>

                {/* ── Members ── */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Members</p>
                  {members.members.map(m => {
                    const userColor = `bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((m.name || 'a').charCodeAt(0)) % 5]}-500`;
                    return (
                      <div key={m.name} className="flex items-center gap-2.5 py-1.5 group">
                        <div className="relative shrink-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white overflow-hidden ${userColor}`}>
                            {m.avatar?.startsWith('http') ? <img src={m.avatar} className="w-full h-full object-cover" alt="" /> : m.name[0]?.toUpperCase()}
                          </div>
                          {m.online && <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 border-2 border-white rounded-full" />}
                        </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-semibold text-gray-800 truncate">{m.name}</p>
                          {['creator', 'admin'].includes(m.role) && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 shrink-0">Admin</span>
                          )}
                        </div>
                        <p className={`text-[10px] ${m.online ? 'text-emerald-500' : 'text-gray-300'}`}>{m.online ? 'Online' : 'Offline'}</p>
                      </div>
                      {members.isAdmin && m.id !== dbUserId && (
                        <div className="relative shrink-0">
                          <button onClick={() => setMemberMenuOpts(memberMenuOpts === m.id ? null : m.id)}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                          </button>
                          {memberMenuOpts === m.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMemberMenuOpts(null)} />
                              <div className="absolute right-0 top-7 w-36 bg-white border border-gray-100 rounded-xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] z-20 py-1 animate-fadeIn">
                                <button onClick={() => { setMemberToKick(m); setMemberMenuOpts(null); }} className="w-full text-left px-4 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  Remove User
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {/* Add Member button — admin only */}
                  {members.isAdmin && (
                    <button onClick={() => setShowAddMember(true)}
                      className="flex items-center gap-2 mt-1 py-1.5 w-full text-left group">
                      <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-200 group-hover:border-gray-400 flex items-center justify-center shrink-0 transition-colors">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
                      </div>
                      <span className="text-[11px] font-semibold text-gray-400 group-hover:text-gray-700 transition-colors">Add member</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Admin: Dissolve group */}
              {members.isAdmin && (
                <div className="px-4 py-3 border-t border-gray-50">
                  <button onClick={() => setShowDissolve(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold text-red-400 hover:bg-red-50 hover:text-red-500 transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Dissolve Group
                  </button>
                </div>
              )}

            </div>
          )}

          {/* Add Member modal */}
          {showAddMember && members && (
            <AddMemberModal
              existingIds={members.members.map((m: any) => m.id).filter(Boolean)}
              onClose={() => setShowAddMember(false)}
              onConfirm={(userIds) => { addMembers(userIds); setShowAddMember(false); }}
            />
          )}

          {/* Remove Member Confirmation Modal */}
          {memberToKick && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setMemberToKick(null)} />
              <div className="relative bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden p-7 animate-fadeInScale">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-[18px] font-bold text-gray-900 mb-2">Remove Participant?</h3>
                <p className="text-[14px] text-gray-500 mb-8 leading-relaxed">Are you sure you want to remove <span className="font-semibold text-gray-900">{memberToKick.name}</span> from this group? They will lose all access to the chat history.</p>
                <div className="flex gap-3">
                  <button onClick={() => setMemberToKick(null)} className="flex-1 py-3 px-4 rounded-xl font-bold text-[13px] text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
                  <button onClick={() => { removeMember(memberToKick.id); setMemberToKick(null); }} className="flex-1 py-3 px-4 rounded-xl font-bold text-[13px] text-white bg-red-500 hover:bg-red-600 shadow-sm shadow-red-500/20 transition-all">Remove</button>
                </div>
              </div>
            </div>
          )}

          {/* Dissolve confirmation */}
          {showDissolve && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowDissolve(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6" onClick={e => e.stopPropagation()}>
                <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <p className="text-[15px] font-bold text-gray-900 text-center mb-1">Dissolve Group?</p>
                <p className="text-[12px] text-gray-400 text-center mb-5">This action cannot be undone. All members will be removed and the group chat will be permanently deleted.</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDissolve(false)}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">Cancel</button>
                  <button onClick={dissolveGroup}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white bg-red-500 hover:bg-red-600 transition-all">Dissolve</button>
                </div>
              </div>
            </div>
          )}


          {/* ── Agent Marketplace Modal ── */}
          {showMarketplace && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowMarketplace(false)}>
              <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:w-[640px] max-h-[85vh] md:max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Modal header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h2 className="text-[18px] font-bold text-gray-900">Agent Marketplace</h2>
                      <p className="text-[13px] text-gray-400 mt-0.5">Add AI agents to enhance your group's capabilities</p>
                    </div>
                    <button onClick={() => setShowMarketplace(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {/* Search */}
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mt-4">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                    <input value={mktSearch} onChange={e => setMktSearch(e.target.value)} placeholder="Search agents..." className="flex-1 bg-transparent outline-none text-[13px] text-gray-900 placeholder:text-gray-400" />
                  </div>
                  {/* Categories */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {MKT_CATS.map(c => (
                      <button key={c} onClick={() => setMktCat(c)}
                        className={`px-3 py-1 rounded-full text-[12px] font-medium transition-all ${mktCat === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>{c}</button>
                    ))}
                  </div>
                </div>
                {/* Agent list */}
                <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredMkt.map(a => (
                    <div key={a.name} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${a.color} flex items-center justify-center text-white text-[14px] font-bold shrink-0`}>{a.name[0]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900">{a.name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{a.desc}</p>
                      </div>
                      <button className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all shrink-0">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-[13px] text-gray-400">0 agents added to this group</p>
                  <button onClick={() => setShowMarketplace(false)} className="px-5 py-2 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 transition-colors">Done</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50/50">
          <p className="text-[14px] text-gray-400">Select a conversation</p>
        </div>
      )}

      {/* ── Image Preview Modal ── */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 transition-opacity animate-fadeIn" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 sm:top-6 right-4 sm:right-6 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all z-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <img src={previewImage} className="max-w-full max-h-full object-contain animate-fadeInScale" alt="Preview" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

/* ── Discover Page Data ── */
const DISCOVER_GROUPS = [
  { id: 1, name: 'DeFi Alpha Hunters', desc: 'Find early DeFi opportunities and yield strategies', members: 1240, letter: 'D', color: 'bg-blue-100 text-blue-600' },
  { id: 2, name: 'RWA Investment Club', desc: 'Real-world asset tokenization discussion', members: 890, letter: 'R', color: 'bg-emerald-100 text-emerald-600' },
  { id: 3, name: 'AI Trading Signals', desc: 'AI-generated trading signals and market analysis', members: 2100, letter: 'A', color: 'bg-violet-100 text-violet-600' },
  { id: 4, name: 'Credit Score Maximizers', desc: 'Tips to improve your Loka credit score', members: 560, letter: 'C', color: 'bg-amber-100 text-amber-600' },
  { id: 5, name: 'Macro Research Daily', desc: 'Daily macro economic research and insights', members: 1780, letter: 'M', color: 'bg-rose-100 text-rose-600' },
  { id: 6, name: 'Stablecoin Yield Farming', desc: 'Best stablecoin yield farming strategies', members: 920, letter: 'S', color: 'bg-cyan-100 text-cyan-600' },
  { id: 7, name: 'On-chain Data Analysis', desc: 'Deep dive into on-chain metrics and trends', members: 670, letter: 'O', color: 'bg-indigo-100 text-indigo-600' },
  { id: 8, name: 'Portfolio Construction', desc: 'Build and optimize your investment portfolio', members: 430, letter: 'P', color: 'bg-pink-100 text-pink-600' },
];

const DISCOVER_AGENTS = [
  { id: 1, name: 'Finance Assistant', desc: 'Analyze financial data and generate investment insights', category: 'Finance', letter: 'F', color: 'bg-blue-500' },
  { id: 2, name: 'Risk Analyzer', desc: 'Evaluate portfolio risk and suggest hedging strategies', category: 'Finance', letter: 'R', color: 'bg-red-500' },
  { id: 3, name: 'Market Research', desc: 'Research market trends, competitors, and opportunities', category: 'Research', letter: 'M', color: 'bg-emerald-500' },
  { id: 4, name: 'Credit Scorer', desc: 'AI-powered credit assessment for lending decisions', category: 'Finance', letter: 'C', color: 'bg-amber-500' },
  { id: 5, name: 'Yield Optimizer', desc: 'Find and optimize the best yield opportunities', category: 'DeFi', letter: 'Y', color: 'bg-violet-500' },
  { id: 6, name: 'News Aggregator', desc: 'Curate and summarize financial news in real-time', category: 'Research', letter: 'N', color: 'bg-cyan-500' },
  { id: 7, name: 'Smart Contract Auditor', desc: 'Audit smart contracts for security vulnerabilities', category: 'DeFi', letter: 'S', color: 'bg-indigo-500' },
  { id: 8, name: 'Tokenomics Analyst', desc: 'Analyze token economics and distribution models', category: 'Research', letter: 'T', color: 'bg-pink-500' },
];

const DISCOVER_CONTACTS = [
  { id: 1, name: 'Alex Chen',     role: 'Founder & CEO',    bio: 'Building the future of AI-driven copy trading on-chain.',        twitter: '@alexchen_defi', followers: 12400, initials: 'AC', bgColor: 'bg-blue-500' },
  { id: 2, name: 'Sarah Kim',     role: 'Co-founder & CTO', bio: 'MEV researcher & Solidity engineer. prev @Flashbots.',           twitter: '@sarahkim_eth',  followers: 8900,  initials: 'SK', bgColor: 'bg-violet-500' },
  { id: 3, name: 'Marcus Rivera', role: null,                bio: 'DeFi yield optimizer. Obsessed with capital efficiency.',         twitter: null,             followers: 15600, initials: 'MR', bgColor: 'bg-emerald-500' },
  { id: 4, name: 'Emily Zhang',   role: 'CEO',              bio: 'On-chain credit scoring for the underbanked. ex-Goldman.',       twitter: '@emilyzhang',    followers: 6700,  initials: 'EZ', bgColor: 'bg-amber-500' },
  { id: 5, name: 'David Park',    role: 'Head of Research', bio: 'Tokenomics & AI agent marketplace research. PhD candidate.',     twitter: '@dpark_rsch',    followers: 4200,  initials: 'DP', bgColor: 'bg-rose-500' },
  { id: 6, name: 'Lisa Wang',     role: 'Founder & CPO',   bio: 'Product-led growth for web3 native apps. ex-Figma.',            twitter: null,             followers: 3100,  initials: 'LW', bgColor: 'bg-cyan-500' },
  { id: 7, name: 'James Liu',     role: null,               bio: 'Investing in RWA & stablecoin infrastructure since 2019.',       twitter: '@jamesliu_vc',   followers: 28500, initials: 'JL', bgColor: 'bg-indigo-500' },
  { id: 8, name: 'Nina Patel',    role: 'Lead Engineer',   bio: 'Solidity & ZK circuits. love hard technical problems.',           twitter: null,             followers: 5400,  initials: 'NP', bgColor: 'bg-pink-500' },
  { id: 9, name: 'Tom Wu',        role: 'CFO',              bio: 'Treasury management & tokenomics for DeFi protocols.',           twitter: '@tomwu_fi',      followers: 7800,  initials: 'TW', bgColor: 'bg-orange-500' },
];

const AGENT_CATEGORIES = ['All', 'Finance', 'Research', 'DeFi'];

// Mock "strangers" database — not in contacts
export const STRANGER_DB = [
  { id: 's1', name: 'Alice Zhou',   account: '@alicez',     email: 'alice@defi.xyz',        role: 'DeFi Researcher',       mutual: 3, grad: 'from-fuchsia-500 to-pink-500',   initials: 'AZ' },
  { id: 's2', name: 'Bob Chen',     account: '@bobchen',    email: 'bob@cryptofund.io',      role: 'Portfolio Manager',     mutual: 1, grad: 'from-sky-500 to-blue-500',       initials: 'BC' },
  { id: 's3', name: 'Chloe Martin', account: '@chloe_m',    email: 'chloe@loka.fi',         role: 'Smart Contract Auditor',mutual: 7, grad: 'from-emerald-500 to-teal-500',   initials: 'CM' },
  { id: 's4', name: 'Daniel Lee',   account: '@dlee_web3',  email: 'd.lee@rwa.capital',      role: 'RWA Strategist',        mutual: 2, grad: 'from-amber-400 to-orange-400',   initials: 'DL' },
  { id: 's5', name: 'Eva Rossi',    account: '@evarossi',   email: 'eva@stablecoin.io',      role: 'Protocol Economist',    mutual: 0, grad: 'from-violet-500 to-purple-500',  initials: 'ER' },
  { id: 's6', name: 'Tom Zhang',    account: '@tomzhang',   email: 'tom@lokafi.xyz',         role: 'Yield Farmer',          mutual: 4, grad: 'from-rose-500 to-pink-500',      initials: 'TZ' },
  { id: 's7', name: 'Jay Park',     account: '@jaypark',    email: 'jay@onchain.vc',         role: 'On-chain Analyst',      mutual: 0, grad: 'from-indigo-500 to-blue-600',   initials: 'JP' },
  { id: 's8', name: 'Lena Fischer', account: '@lena_fi',    email: 'lena@defiresearch.io',   role: 'Token Economist',       mutual: 2, grad: 'from-cyan-500 to-sky-500',       initials: 'LF' },
  { id: 's9', name: 'Mike Torres',  account: '@miketorres', email: 'mike@creditlayer.io',    role: 'Credit Analyst',        mutual: 1, grad: 'from-orange-400 to-amber-500',   initials: 'MT' },
];

export const AddFriendModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!q.trim() || q.trim().length < 2) return;
    setSearching(true);
    setSearched(false);
    setSendError(null);
    try {
      const users = await api.searchUsers(q.trim());
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setSearched(true);
      setSearching(false);
    }
  };

  const sendRequest = async (userId: string) => {
    if (sent.has(userId)) return;
    setSendError(null);
    try {
      await api.sendFriendRequest(userId);
      setSent(prev => { const n = new Set(prev); n.add(userId); return n; });
    } catch (err: any) {
      setSendError(err?.message || 'Failed to send request');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Add Friend</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Search by name or email</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                autoFocus value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Name or email..."
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-300"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <button onClick={handleSearch}
              className="px-4 py-2.5 bg-gray-900 text-white text-[12px] font-bold rounded-xl hover:bg-gray-700 transition-all shrink-0">
              Search
            </button>
          </div>
          {sendError && <p className="text-[11px] text-red-500 mt-2">{sendError}</p>}
        </div>

        {/* Results area */}
        <div className="min-h-[120px] max-h-72 overflow-y-auto px-5 pb-4">
          {searching && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              <p className="text-[11px] text-gray-400">Searching...</p>
            </div>
          )}

          {searched && !searching && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-1.5">
              <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <p className="text-[13px] font-semibold text-gray-400">No users found</p>
              <p className="text-[11px] text-gray-300">Try a different name or email</p>
            </div>
          )}

          {!searching && results.map((s: any) => {
            const isSent = sent.has(s.id);
            const initials = (s.name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={s.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 overflow-hidden bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((s.name || s.email?.split('@')[0] || 'U').charCodeAt(0)) % 5]}-500`}>
                  {s.avatar?.startsWith('http') ? <img src={s.avatar} className="w-full h-full object-cover" alt="" /> : (s.avatar || initials)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight">{s.name || 'Unknown'}</p>
                  {s.email && <p className="text-[10px] text-gray-400 mt-0.5">{s.email}</p>}
                </div>
                <button onClick={() => sendRequest(s.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${isSent ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                  {isSent ? 'Sent ✓' : 'Add'}
                </button>
              </div>
            );
          })}

          {/* Empty initial state */}
          {!searching && !searched && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-300">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
              <p className="text-[12px]">Enter a keyword to find people</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-500 hover:bg-gray-100 transition-all">Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Create Group Modal ─────────────────────────────────────────────────
const CreateGroupModal: React.FC<{
  onClose: () => void;
  onCreated?: (group: any) => void;
}> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState<'members' | 'info'>('members');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [groupBio, setGroupBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);

  useEffect(() => {
    api.getFriends().then((res: any[]) => {
      setContacts(res.map((f: any) => ({ id: f.user.id, name: f.user.name, avatar: f.user.avatar })));
      setLoadingContacts(false);
    }).catch(err => {
      console.error(err);
      setLoadingContacts(false);
    });
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const toggleMember = (id: string | number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Agents available to add (use negative IDs to distinguish from contacts)
  const AVAILABLE_AGENTS = [
    { id: -1, name: 'Loka Agent',      desc: 'AI-powered investment assistant',   initials: 'L' },
    { id: -2, name: 'Risk Analyzer',   desc: 'Credit scoring & risk analysis',     initials: 'R' },
    { id: -3, name: 'Market Research', desc: 'Real-time market intelligence',      initials: 'M' },
    { id: -4, name: 'Yield Optimizer', desc: 'Find the best yield opportunities',  initials: 'Y' },
  ];

  const selectedCount = selected.size;

  const GRAD_MAP: Record<string, string> = {
    'bg-blue-500': 'from-blue-500 to-indigo-500', 'bg-violet-500': 'from-violet-500 to-purple-500',
    'bg-emerald-500': 'from-emerald-500 to-teal-500', 'bg-amber-500': 'from-amber-400 to-orange-400',
    'bg-rose-500': 'from-rose-500 to-pink-500', 'bg-cyan-500': 'from-cyan-500 to-sky-500',
    'bg-indigo-500': 'from-indigo-500 to-blue-600', 'bg-pink-500': 'from-pink-500 to-rose-500',
    'bg-orange-500': 'from-orange-400 to-amber-500',
  };

  const stepLabel = step === 'members' ? 'Step 1 of 2 — Select members'
    : 'Step 2 of 2 — Group info (optional)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {step === 'info' && (
              <button onClick={() => setStep('members')} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Create Group</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">{stepLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ── Step 1: Select Members ── */}
        {step === 'members' && (
          <div className="max-h-[26rem] overflow-y-auto">
            {/* AI Agents section */}
            <div className="px-5 pt-3 pb-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">AI Agents</p>
            </div>
            {AVAILABLE_AGENTS.map(a => {
              const isSel = selected.has(a.id);
              return (
                <div key={a.id} onClick={() => toggleMember(a.id)}
                  className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-[12px] font-black text-violet-600 shrink-0">{a.initials}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-gray-900 leading-tight">{a.name}</p>
                      <span className="text-[10px] font-semibold text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded-md">Agent</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{a.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${isSel ? 'bg-gray-900 border-gray-900' : 'border-gray-200'}`}>
                    {isSel && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                </div>
              );
            })}

            {/* Divider */}
            <div className="px-5 pt-3 pb-1 border-t border-gray-50 mt-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Contacts</p>
            </div>
            {loadingContacts ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
              </div>
            ) : contacts.length > 0 ? contacts.map(c => {
              const userColor = `bg-${['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((c.name || 'a').charCodeAt(0)) % 5]}-500`;
              const isSel = selected.has(c.id);
              const initials = (c.name || c.email || 'U').substring(0, 2).toUpperCase();
              return (
                <div key={c.id} onClick={() => toggleMember(c.id)}
                  className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                  {c.avatar && c.avatar.startsWith('http') ? (
                    <img src={c.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                  ) : (
                    <div className={`w-9 h-9 rounded-full ${userColor} text-white flex items-center justify-center text-[12px] font-black shrink-0`}>{initials}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-gray-900 leading-tight">{c.name || c.email?.split('@')[0]}</p>
                      <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">User</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{c.email}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${isSel ? 'bg-gray-900 border-gray-900' : 'border-gray-200'}`}>
                    {isSel && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                </div>
              );
            }) : (
              <div className="px-5 py-6 text-center text-[12px] text-gray-400">No contacts found</div>
            )}
          </div>
        )}

        {/* ── Step 2: Group Info (optional) ── */}
        {step === 'info' && (
          <div className="px-5 py-5 space-y-4">
            {/* Avatar upload */}
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-2">Avatar <span className="font-normal text-gray-300">(optional)</span></label>
              <div className="flex items-center gap-3">
                {/* Preview */}
                <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    : <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  }
                </div>
                {/* Upload button */}
                <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-100 bg-gray-50 text-[12px] font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Upload photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
                {avatarUrl && (
                  <button onClick={() => setAvatarUrl(null)} className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Remove</button>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-2">Name <span className="font-normal text-gray-300">(optional)</span></label>
              <input autoFocus value={groupName} onChange={e => setGroupName(e.target.value)}
                placeholder="e.g. DeFi Alpha Hunters"
                className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-300" />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-2">Description <span className="font-normal text-gray-300">(optional)</span></label>
              <textarea value={groupBio} onChange={e => setGroupBio(e.target.value)} rows={2}
                placeholder="What's this group about?"
                className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-300 resize-none" />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-400 hover:bg-gray-100 transition-all">Cancel</button>
          <div className="flex items-center gap-2">
            {step === 'members' ? (
              <button onClick={() => selected.size > 0 && setStep('info')}
                className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${selected.size > 0 ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                {selectedCount > 0 ? `Next (${selectedCount} selected)` : 'Select at least 1'}
              </button>
            ) : (
              <button
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    // Upload avatar to R2 if one was selected
                    let uploadedAvatarUrl: string | undefined;
                    if (avatarFile) {
                      const uploadRes = await api.uploadFile(avatarFile);
                      uploadedAvatarUrl = uploadRes.url;
                    }
                    const group = await api.createCommunityGroup({
                      name: groupName.trim() || 'New Group',
                      bio: groupBio,
                      avatar: uploadedAvatarUrl,
                      memberIds: Array.from(selected).map(String)
                    });
                    onCreated?.(group);
                  } catch (err) {
                    console.error('Failed to create group:', err);
                    alert('Failed to create group');
                    setLoading(false);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${loading ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                {loading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// ── Mock pending friend requests ─────────────────────────────────────
const MOCK_REQUESTS = [
  { id: 'r1', name: 'Bob Chen',     account: '@bobchen',    role: 'Portfolio Manager',     mutual: 1, grad: 'from-sky-500 to-blue-500',     initials: 'BC', time: '2m ago' },
  { id: 'r2', name: 'Lena Fischer', account: '@lena_fi',    role: 'Token Economist',       mutual: 2, grad: 'from-cyan-500 to-sky-500',     initials: 'LF', time: '1h ago' },
  { id: 'r3', name: 'Jay Park',     account: '@jaypark',    role: 'On-chain Analyst',      mutual: 0, grad: 'from-indigo-500 to-blue-600', initials: 'JP', time: '3h ago' },
];

// ── ContactsPage ───────────────────────────────────────────────────────
export default ChatsPage;
