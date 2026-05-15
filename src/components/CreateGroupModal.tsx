import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export const CreateGroupModal: React.FC<{
  onClose: () => void;
  onCreated?: (newGroupId: string) => void;
}> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState<'members' | 'info'>('members');
  const [selected, setSelected] = useState<Set<any>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [groupBio, setGroupBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [realFriends, setRealFriends] = useState<any[]>([]);

  useEffect(() => {
    api.getFriends().then((data: any[]) => {
      setRealFriends(data.map((f: any) => ({
        id: f.user.id,
        name: f.user.name || 'User',
        role: 'Friend',
        bio: f.user.email || 'LokaCash Member',
        initials: (f.user.name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
        avatar: f.user.avatar,
        bgColor: 'bg-' + ['blue', 'violet', 'emerald', 'amber', 'rose'][Math.abs((f.user.name || 'a').charCodeAt(0)) % 5] + '-500'
      })));
    }).catch(() => { });
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const toggleMember = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Agents available to add (use negative IDs to distinguish from contacts)
  const AVAILABLE_AGENTS = [
    { id: -1, name: 'Loka Agent', desc: 'AI-powered investment assistant', initials: 'L' },
    { id: -2, name: 'Risk Analyzer', desc: 'Credit scoring & risk analysis', initials: 'R' },
    { id: -3, name: 'Market Research', desc: 'Real-time market intelligence', initials: 'M' },
    { id: -4, name: 'Yield Optimizer', desc: 'Find the best yield opportunities', initials: 'Y' },
  ];

  const selectedCount = selected.size;

  const GRAD_MAP: Record<string, string> = {
    'bg-blue-500': 'from-blue-500 to-indigo-500', 'bg-violet-500': 'from-violet-500 to-purple-500',
    'bg-emerald-500': 'from-emerald-500 to-teal-500', 'bg-amber-500': 'from-amber-400 to-orange-400',
    'bg-rose-500': 'from-rose-500 to-pink-500', 'bg-cyan-500': 'from-cyan-500 to-sky-500',
    'bg-indigo-500': 'from-indigo-500 to-blue-600', 'bg-pink-500': 'from-pink-500 to-rose-500',
    'bg-orange-500': 'from-orange-400 to-amber-500',
  };

  const stepLabel = step === 'members' ? 'Step 1 of 2 Select members'
    : 'Step 2 of 2 Group info (optional)';

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

        {/* Step 1: Select Members  */}
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
            {realFriends.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-gray-400 text-center">No friends yet. Add friends from the Contacts page.</p>
            ) : null}
            {realFriends.map(c => {
              const grad = GRAD_MAP[c.bgColor] ?? 'from-gray-400 to-gray-500';
              const isSel = selected.has(c.id);
              return (
                <div key={c.id} onClick={() => toggleMember(c.id)}
                  className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                  {c.avatar && typeof c.avatar === 'string' && c.avatar.startsWith('http') ? (
                    <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
                      <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-[12px] font-black text-white shrink-0`}>{c.initials}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-gray-900 leading-tight">{c.name}</p>
                      {c.role && <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{c.role}</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{c.bio}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${isSel ? 'bg-gray-900 border-gray-900' : 'border-gray-200'}`}>
                    {isSel && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/*  Step 2: Group Info (optional)  */}
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
                onClick={() => {
                  const newId = `g-${Date.now()}`;
                  onCreated?.(newId);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl text-[12px] font-bold bg-gray-900 text-white hover:bg-gray-700 transition-all">
                Create Group
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CreateGroupModal;
