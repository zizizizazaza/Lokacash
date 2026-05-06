import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { renderMarkdownContent, QuoteCard, TokenCard, type TokenSnapshotData } from '../utils/markdown';
import { RoundtableWorkbench } from './chat/RoundtableWorkbench';
import type { ThinkingFlow } from './SuperAgentChat';

interface ShareMsg {
  id: string;
  role: string;
  content: string;
  agentId?: string | null;
  metadata?: string | null;
  createdAt: string;
}

interface SharePayload {
  token: string;
  sessionId: string;
  createdAt: string;
  messages: ShareMsg[];
}

interface ParsedMeta {
  thinkingFlow?: ThinkingFlow;
  consensusResult?: any;
  liveDebateLog?: any;
  analystIds?: string[];
  htmlReport?: string;
  sources?: any[];
  quoteCard?: any;
  tokenCard?: TokenSnapshotData;
}

function parseMeta(raw: string | null | undefined): ParsedMeta | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ParsedMeta; } catch { return null; }
}

const SharedChatView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.getSharedChat(token)
      .then(d => setData(d))
      .catch(e => setErr(e?.message || 'Failed to load share'))
      .finally(() => setLoading(false));
  }, [token]);

  // Detect language from the first user message for header copy.
  const firstUser = data?.messages.find(m => m.role === 'user');
  const isZh = !!firstUser && /[一-鿿]/.test(firstUser.content);

  const t = isZh
    ? { brand: 'Loka', readonly: '只读分享', cta: '在 Loka 开始你的对话', tryIt: '前往 Loka', notFound: '链接不存在或已被作者撤销', loading: '加载中…' }
    : { brand: 'Loka', readonly: 'Read-only share', cta: 'Start your own conversation on Loka', tryIt: 'Open Loka', notFound: 'Link not found or revoked by the author', loading: 'Loading…' };

  // Look up the most recent user message preceding `idx` to use as the
  // RoundtableWorkbench topic label.
  const topicLabelBefore = (msgs: ShareMsg[], idx: number) => {
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'user') return msgs[i].content || '';
    }
    return '';
  };

  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center text-[13px] font-bold">L</span>
            <span className="text-[14px] font-semibold tracking-tight">{t.brand}</span>
            <span className="text-[11px] text-gray-400 ml-1">· {t.readonly}</span>
          </Link>
          <Link
            to="/"
            className="text-[12px] font-medium text-gray-700 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            {t.tryIt}
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {loading && (
          <div className="text-[13px] text-gray-400">{t.loading}</div>
        )}

        {!loading && err && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-8 text-center">
            <div className="text-[13px] text-gray-700">{t.notFound}</div>
          </div>
        )}

        {!loading && data && (
          <div className="space-y-8">
            {data.messages.map((m, idx) => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="max-w-3xl mx-auto flex justify-end">
                    <div className="max-w-[85%] px-4 py-3 bg-gray-100 rounded-2xl rounded-br-sm border border-gray-200/70 text-[13.5px] text-gray-900 whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  </div>
                );
              }
              if (m.role === 'assistant') {
                const meta = parseMeta(m.metadata);
                const flow = meta?.thinkingFlow;
                const isRoundtable =
                  flow?.routedMode === 'roundtable' ||
                  !!meta?.consensusResult ||
                  (flow?.rtRounds?.length ?? 0) > 0;
                const showWorkbench = isRoundtable && !!flow;

                return (
                  <div key={m.id} className="space-y-4">
                    {showWorkbench && (
                      <div className="w-full">
                        <RoundtableWorkbench
                          thinking={flow!}
                          isLive={false}
                          topicLabel={topicLabelBefore(data.messages, idx)}
                        />
                      </div>
                    )}
                    <div className="max-w-3xl mx-auto space-y-3">
                      <div className="text-[11px] uppercase tracking-wider text-gray-400">{m.agentId || 'Loka'}</div>
                      {meta?.quoteCard && (
                        <QuoteCard
                          quote={{
                            ...meta.quoteCard,
                            // Re-derive lang from user question so labels match
                            // the language of the conversation rather than
                            // whatever was captured at recording time.
                            lang: meta.quoteCard.lang || (isZh ? 'zh' : 'en'),
                          }}
                        />
                      )}
                      {meta?.tokenCard && meta.tokenCard.id && (
                        <TokenCard token={meta.tokenCard} lang={isZh ? 'zh' : 'en'} />
                      )}
                      <div className="text-[13.5px] text-gray-800 leading-relaxed markdown-content">
                        {renderMarkdownContent(m.content || '')}
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })}

            <div className="pt-8 border-t border-gray-100 text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[13px] font-medium hover:bg-black"
              >
                {t.cta}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedChatView;
