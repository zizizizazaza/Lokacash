import React, { useState, useCallback } from 'react';
import { api } from '../../services/api';

interface Props {
  sessionId: string | null | undefined;
  /** True when there is a real assistant reply worth sharing. We hide the
   *  button on empty/streaming-only sessions to avoid generating dead links. */
  hasContent: boolean;
  lang?: 'zh' | 'en';
  /** When set, the button shares the current page URL directly instead of
   *  minting a DB-backed share token. Used by demo replay pages whose URL
   *  is already public (e.g. /?demo=roundtable-nvda). */
  staticShareUrl?: string;
}

const T = {
  zh: {
    share: '分享',
    title: '分享对话',
    sub: '获得链接的人都可以查看这次对话',
    copy: '复制链接',
    copied: '已复制',
    publishX: '发布到',
    creating: '生成链接中…',
    error: '生成失败，请稍后再试',
    privacy: '*请勿分享个人信息或第三方未授权内容。',
  },
  en: {
    share: 'Share',
    title: 'Share Chat',
    sub: 'Anyone with this link can view the conversation',
    copy: 'Copy Link',
    copied: 'Copied',
    publishX: 'Publish to',
    creating: 'Generating link…',
    error: 'Failed to generate link. Please retry.',
    privacy: "*Don't share personal info or third-party content without permission.",
  },
};

const ShareChatButton: React.FC<Props> = ({ sessionId, hasContent, lang = 'en', staticShareUrl }) => {
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    setOpen(true);
    setErr(null);

    // Static share: just use the provided URL directly — no API call.
    if (staticShareUrl) {
      setLink(staticShareUrl);
      return;
    }

    if (!sessionId) return;
    if (link) return; // reuse already-fetched
    setLoading(true);
    try {
      const { token } = await api.createShareLink(sessionId);
      const url = `${window.location.origin}/share/${token}`;
      setLink(url);
    } catch (e: any) {
      setErr(t.error);
    } finally {
      setLoading(false);
    }
  }, [sessionId, link, t.error, staticShareUrl]);

  const onCopy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select-all behaviour by select on a temp input
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }, [link]);

  const onPublishX = useCallback(() => {
    if (!link) return;
    const text = encodeURIComponent('Check out this conversation on LokaCash:');
    const url = encodeURIComponent(link);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener,noreferrer');
  }, [link]);

  // Show button when we have either: a real session+content (DB share path)
  // or a static URL to share directly (demo replay path).
  if (!staticShareUrl && (!sessionId || !hasContent)) return null;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title={t.share}
        aria-label={t.share}
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 share-modal-fade" role="dialog" aria-modal="true">
          <style>{`
            @keyframes share-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes share-scale-in { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes share-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
            .share-modal-fade { animation: share-fade-in .15s ease-out; }
            .share-modal-card { animation: share-scale-in .22s cubic-bezier(.2,.9,.3,1.2); }
            .share-shimmer-bg {
              background: linear-gradient(90deg, rgba(243,244,246,0) 0%, rgba(229,231,235,.7) 50%, rgba(243,244,246,0) 100%);
              background-size: 200% 100%;
              animation: share-shimmer 1.4s ease-in-out infinite;
            }
          `}</style>
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900/50 via-gray-900/40 to-gray-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="share-modal-card relative w-full max-w-[440px] bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] border border-gray-200/60 overflow-hidden">
            {/* Header with subtle gradient accent */}
            <div className="relative px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-300/60 to-transparent" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center text-white shadow-sm">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-gray-900 leading-tight">{t.title}</h3>
                    <p className="text-[12px] text-gray-500 mt-0.5 truncate">{t.sub}</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="shrink-0 w-8 h-8 -mr-1.5 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-3">
              {/* Link row */}
              <div className="group rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/70 border border-gray-200/70 hover:border-gray-300 transition-colors p-1.5 pl-4 flex items-center gap-2">
                <svg className="shrink-0 text-gray-400" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {loading ? (
                  <div className="flex-1 h-4 rounded share-shimmer-bg" />
                ) : (
                  <input
                    readOnly
                    value={link || ''}
                    className="flex-1 min-w-0 bg-transparent text-[12.5px] text-gray-700 outline-none truncate font-mono"
                    onFocus={e => e.currentTarget.select()}
                  />
                )}
                <button
                  onClick={onCopy}
                  disabled={!link || loading}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${
                    copied
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-gray-900 text-white hover:bg-black hover:shadow-md hover:shadow-gray-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t.copied}
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                      </svg>
                      {t.copy}
                    </>
                  )}
                </button>
              </div>

              {/* Publish to X — single visual unit, less cluttered */}
              <button
                onClick={onPublishX}
                disabled={!link || loading}
                className="group w-full inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-200/80 hover:border-gray-900 hover:bg-gray-900 hover:text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-700 disabled:hover:border-gray-200/80"
              >
                <span className="shrink-0 w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </span>
                <span className="flex-1 text-left text-[13px] font-medium">{t.publishX} X</span>
                <svg className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
              </button>

              {err && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700 flex items-start gap-2">
                  <svg className="shrink-0 mt-0.5" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {err}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-4">
              <p className="text-[11px] text-gray-400 leading-relaxed flex items-start gap-1.5">
                <svg className="shrink-0 mt-0.5 text-gray-300" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>{t.privacy}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ShareChatButton;
