import React, { useState } from 'react';
import { STRANGER_DB } from '../constants';

export const AddFriendModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<typeof STRANGER_DB>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const handleSearch = () => {
    if (!q.trim()) return;
    setSearching(true);
    setSearched(false);
    setTimeout(() => {
      const lower = q.toLowerCase();
      const found = STRANGER_DB.filter(s =>
        s.account.toLowerCase().includes(lower) ||
        s.name.toLowerCase().includes(lower) ||
        s.email.toLowerCase().includes(lower)
      );
      setResults(found);
      setSearched(true);
      setSearching(false);
    }, 600);
  };

  const sendRequest = (id: string) =>
    setSent(prev => { const n = new Set(prev); n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Add Friend</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Search by account, nickname, or email</p>
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
                placeholder="@account · nickname · email"
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-300"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <button onClick={handleSearch}
              className="px-4 py-2.5 bg-gray-900 text-white text-[12px] font-bold rounded-xl hover:bg-gray-700 transition-all shrink-0">
              Search
            </button>
          </div>
          {!searched && !searching && (
            <div className="flex gap-2 mt-2.5">
              {['Account ID', 'Nickname', 'Email'].map(hint => (
                <span key={hint} className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">{hint}</span>
              ))}
            </div>
          )}
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
              <p className="text-[11px] text-gray-300">Try a different account ID or email</p>
            </div>
          )}
          {!searching && results.map(s => {
            const isSent = sent.has(s.id);
            return (
              <div key={s.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.grad} flex items-center justify-center text-[12px] font-black text-white shrink-0`}>
                  {s.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-semibold text-gray-900 leading-tight">{s.name}</p>
                    <span className="text-[10px] text-gray-400 font-mono">{s.account}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.role}</p>
                  {s.mutual > 0 && (
                    <p className="text-[10px] text-gray-300 mt-0.5">{s.mutual} mutual connection{s.mutual > 1 ? 's' : ''}</p>
                  )}
                </div>
                <button onClick={() => !isSent && sendRequest(s.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${isSent ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                  {isSent ? 'Sent ✓' : 'Add'}
                </button>
              </div>
            );
          })}
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

export default AddFriendModal;
