import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { renderMarkdownContent, QuoteCard, TokenCard, type TokenSnapshotData, extractHeadings } from '../utils/markdown';
import { RoundtableWorkbench } from './chat/RoundtableWorkbench';
import { reconstructRtFromMetadata, buildDemoRtFields } from './chat/rtReconstruct';
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
  const [activeTocId, setActiveTocId] = useState<string>('');

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
    ? { brand: 'Loka', readonly: '只读分享', cta: '在 Loka 开始你的对话', tryIt: '前往 Loka', notFound: '链接不存在或已被作者撤销', loading: '加载中…', sections: '目录' }
    : { brand: 'Loka', readonly: 'Read-only share', cta: 'Start your own conversation on Loka', tryIt: 'Open Loka', notFound: 'Link not found or revoked by the author', loading: 'Loading…', sections: 'Sections' };

  // Look up the most recent user message preceding `idx` to use as the
  // RoundtableWorkbench topic label.
  const topicLabelBefore = (msgs: ShareMsg[], idx: number) => {
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'user') return msgs[i].content || '';
    }
    return '';
  };

  // Build TOC from the LAST assistant message that has enough headings.
  // We pick the last one so re-shares with multi-turn convos still feel
  // like the "main report" sidebar of the original chat.
  const tocHeadings = useMemo(() => {
    if (!data) return [] as { level: number; text: string; id: string }[];
    for (let i = data.messages.length - 1; i >= 0; i--) {
      const m = data.messages[i];
      if (m.role !== 'assistant' || !m.content) continue;
      // Pass no msgIdx so the slug ids match what renderMarkdownContent
      // emits below (also called without an idx). Otherwise extractHeadings
      // would prefix with "m{i}-" and the TOC button's getElementById
      // lookups would all return null.
      const h = extractHeadings(m.content);
      if (h.length >= 3) return h;
    }
    return [];
  }, [data]);

  const showToc = tocHeadings.length >= 3;

  // Scroll-spy: highlight whichever heading is closest to the top of the
  // viewport. Cheap rAF throttle — no IntersectionObserver since headings
  // can re-render with new ids on data load.
  useEffect(() => {
    if (!showToc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const offset = 120; // header height + a little breathing room
        let best = '';
        for (const h of tocHeadings) {
          const el = document.getElementById(h.id);
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          if (top - offset <= 0) best = h.id; else break;
        }
        if (best) setActiveTocId(best);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [showToc, tocHeadings]);

  // Optimize the heading hierarchy the same way SuperAgentChat does:
  //   - if there's only one level-2 heading, promote level-3 children to top
  //   - otherwise, drop solitary level-3 children for a flatter outline
  const optimizedToc = useMemo(() => {
    const filtered = tocHeadings.filter(h => h.level >= 2);
    const level2Count = filtered.filter(h => h.level === 2).length;
    if (level2Count <= 1) {
      const promoted = filtered.filter(h => h.level >= 3).map(h => ({ ...h, level: 2 }));
      return promoted.length === 0 ? filtered : promoted;
    }
    const out: typeof filtered = [];
    for (let fi = 0; fi < filtered.length; fi++) {
      const h = filtered[fi];
      if (h.level === 2) {
        out.push(h);
      } else if (h.level >= 3) {
        let siblingCount = 0;
        for (let si = fi; si < filtered.length && filtered[si].level >= 3; si++) siblingCount++;
        if (siblingCount >= 2) out.push(h);
      }
    }
    return out;
  }, [tocHeadings]);

  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className={`${showToc ? 'max-w-[1380px]' : 'max-w-6xl'} mx-auto px-5 py-3 flex items-center justify-between`}>
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

      <main className={`${showToc ? 'max-w-[1380px]' : 'max-w-6xl'} mx-auto px-5 py-8`}>
        {loading && (
          <div className="text-[13px] text-gray-400">{t.loading}</div>
        )}

        {!loading && err && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-8 text-center">
            <div className="text-[13px] text-gray-700">{t.notFound}</div>
          </div>
        )}

        {!loading && data && (
          <div className="flex items-start gap-6 xl:gap-8">
            {/* TOC sidebar */}
            {showToc && (
              <aside className="hidden md:block w-[220px] shrink-0 self-start sticky" style={{ top: 84 }}>
                <nav className="overflow-hidden">
                  <div className="w-[220px] max-h-[calc(100dvh-120px)] overflow-y-auto bg-white/95 backdrop-blur-md border border-gray-200/60 rounded-xl shadow-lg shadow-gray-200/30 py-3 px-2">
                    <p className="px-2 pb-2 text-[13px] font-bold text-gray-900 tracking-tight sticky top-0 bg-white/95 backdrop-blur-md z-10">{t.sections}</p>
                    <ul className="space-y-0.5">
                      {optimizedToc.map((h, idx, arr) => {
                        const isActive = activeTocId === h.id;
                        const sectionNum = h.level === 2
                          ? arr.filter(x => x.level === 2).indexOf(h) + 1
                          : null;
                        return (
                          <li key={idx}>
                            <button
                              onClick={() => {
                                const el = document.getElementById(h.id);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                              className={`group w-full text-left flex items-start gap-1.5 rounded-lg px-2 py-2 text-[12px] leading-snug transition-all ${
                                isActive
                                  ? 'bg-blue-50/80 text-blue-700 font-semibold'
                                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                              } ${h.level >= 3 ? 'pl-7' : ''}`}
                            >
                              {sectionNum !== null && (
                                <span className={`shrink-0 w-4 text-center text-[11px] font-bold ${
                                  isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                                }`}>
                                  {sectionNum}
                                </span>
                              )}
                              {h.level >= 3 && (
                                <span className={`shrink-0 mt-[6px] w-1 h-1 rounded-full ${isActive ? 'bg-blue-500' : 'bg-gray-400'}`} />
                              )}
                              <span className="break-words whitespace-normal">{h.text}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </nav>
              </aside>
            )}

            {/* Main column */}
            <div className="min-w-0 flex-1 space-y-8">
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

                  // Reconstruct rtRounds / selectedAgentIds / rtConsensus from
                  // liveDebateLog + consensusResult + analystIds, mirroring the
                  // history-restore path in SuperAgentChat.
                  let displayFlow: ThinkingFlow | undefined = flow;
                  if (isRoundtable && flow) {
                    const real = reconstructRtFromMetadata(meta);
                    displayFlow = real
                      ? {
                          ...flow,
                          isActive: false,
                          routedMode: 'roundtable',
                          selectedAgentIds: real.selectedAgentIds,
                          rtPreparationStatus: 'done',
                          rtRounds: real.rtRounds,
                          rtConsensus: real.rtConsensus,
                          rtReportStatus: 'done',
                        }
                      : { ...flow, isActive: false, routedMode: 'roundtable', ...buildDemoRtFields() };
                  }
                  const showWorkbench = isRoundtable && !!displayFlow;

                  return (
                    <div key={m.id} className="space-y-4">
                      {showWorkbench && (
                        <div className="w-full">
                          <RoundtableWorkbench
                            thinking={displayFlow!}
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
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedChatView;
