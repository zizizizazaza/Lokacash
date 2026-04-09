/**
 * Build Thinking-panel "social search" rows for Signal Radar.
 * Frontend expects SearchSource: { favicon, title, domain, url? }.
 */

export type SignalSearchSource = {
  favicon: string;
  title: string;
  domain: string;
  url?: string;
};

function hostKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function faviconForHost(host: string): string {
  const h = host.toLowerCase();
  if (h.includes('reddit')) return 'reddit';
  if (h.includes('twitter') || h.includes('x.com')) return 'x';
  if (h.includes('youtube') || h.includes('youtu.be')) return 'youtube';
  if (h.includes('weibo')) return 'weibo';
  if (h.includes('wechat') || h.includes('qq.com')) return 'wechat';
  if (h.includes('hackernews') || h === 'news.ycombinator.com') return 'hackernews';
  if (h.includes('discord')) return 'discord';
  if (h.includes('telegram') || h.includes('t.me')) return 'telegram';
  return 'web';
}

/** Dedupe key: prefer URL, else domain+title */
function sourceKey(s: SignalSearchSource): string {
  if (s.url) return s.url;
  return `${s.domain}|${s.title}`;
}

export function mergeSignalSources(
  existing: SignalSearchSource[],
  incoming: SignalSearchSource[],
  max = 20,
): SignalSearchSource[] {
  const seen = new Set(existing.map(sourceKey));
  const out = [...existing];
  for (const s of incoming) {
    const k = sourceKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const stripUrlTrailing = (u: string) => u.replace(/[),.;>'"]+$/g, '');

function isSkippableUrl(url: string): boolean {
  const h = hostKey(url);
  if (!h || h === 'localhost') return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
  } catch {
    return true;
  }
  return false;
}

function cleanCompactTitle(raw: string): string {
  let t = raw.trim().replace(/^\s*[-*]\s+/, '');
  if (t.startsWith('*') && t.endsWith('*') && t.length > 2 && !t.startsWith('**')) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\s+/g, ' ').slice(0, 200);
}

function isNoisePrevLine(t: string): boolean {
  if (!t) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^insights:$/i.test(t)) return true;
  if (/^highlights:$/i.test(t)) return true;
  if (/^caption:$/i.test(t)) return true;
  if (/^tags:\s*#/i.test(t)) return true;
  if (/^FIRST_RUN:\s*/i.test(t)) return true;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^={3,}$/.test(t)) return true;
  return false;
}

/** Compact-item header lines like **id** (score:...) — skip when hunting for a human title. */
function isResearchItemHeaderLine(t: string): boolean {
  if (!t.startsWith('**')) return false;
  return /\(score:/i.test(t) || /\[WEB\]/i.test(t);
}

function polymarketOutcomeLine(t: string): boolean {
  return /\|/.test(t) && /\d+%/.test(t);
}

function pickTitleForCompactUrl(lines: string[], urlIndex: number): string {
  const maxLookback = 10;
  for (let j = urlIndex - 1; j >= 0 && j >= urlIndex - maxLookback; j--) {
    const t = lines[j].trimEnd();
    const trimmed = t.trim();
    if (isNoisePrevLine(trimmed)) continue;
    if (isResearchItemHeaderLine(trimmed)) continue;
    if (polymarketOutcomeLine(trimmed)) continue;
    if (/^[-–]\s*"/.test(trimmed)) continue;
    const cleaned = cleanCompactTitle(trimmed);
    if (cleaned.length >= 2) return cleaned;
  }
  return '';
}

/**
 * Extract real post/page URLs from last30days.py compact stdout (render_compact).
 * Each item prints title/snippet lines then a bare `https://...` line.
 */
export function sourcesFromLast30DaysCompact(raw: string, max = 25): SignalSearchSource[] {
  if (!raw || !raw.trim()) return [];

  const lines = raw.split(/\r?\n/);
  const out: SignalSearchSource[] = [];
  const seen = new Set<string>();
  const urlLine = /^\s*(https?:\/\/\S+)/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(urlLine);
    if (!m) continue;

    let url = stripUrlTrailing(m[1]);
    if (seen.has(url) || isSkippableUrl(url)) continue;

    const title = pickTitleForCompactUrl(lines, i);
    const host = hostKey(url);
    if (!host) continue;

    seen.add(url);
    out.push({
      favicon: faviconForHost(host),
      title: title || host.replace(/^www\./, ''),
      domain: host.replace(/^www\./, ''),
      url,
    });
    if (out.length >= max) break;
  }

  return out;
}

/** Infer platforms / outlets mentioned in stderr progress lines (Chinese + English pipelines). */
export function sourcesFromSignalRadarLogLine(log: string): SignalSearchSource[] {
  const hits: SignalSearchSource[] = [];
  const add = (s: SignalSearchSource) => hits.push(s);

  // Include canonical `url` so the frontend renders <a> (opens in new tab); log lines rarely carry article URLs.
  if (/reddit/i.test(log))
    add({
      favicon: 'reddit',
      title: 'Reddit',
      domain: 'reddit.com',
      url: 'https://www.reddit.com',
    });
  if (/twitter|\bx\.com\b|tweet/i.test(log))
    add({
      favicon: 'x',
      title: 'X / Twitter',
      domain: 'x.com',
      url: 'https://x.com',
    });
  if (/youtube|youtu\.be/i.test(log))
    add({
      favicon: 'youtube',
      title: 'YouTube',
      domain: 'youtube.com',
      url: 'https://www.youtube.com',
    });
  if (/exa\.ai|\bExa\b|include-web|web search/i.test(log))
    add({
      favicon: 'web',
      title: 'Web search (Exa)',
      domain: 'exa.ai',
      url: 'https://exa.ai',
    });
  if (/finance\.sina|新浪财经/i.test(log))
    add({
      favicon: 'web',
      title: 'Sina Finance',
      domain: 'finance.sina.com.cn',
      url: 'https://finance.sina.com.cn',
    });
  if (/36kr|36氪|36kr\.com/i.test(log))
    add({ favicon: 'web', title: '36Kr', domain: '36kr.com', url: 'https://www.36kr.com' });
  if (/bloomberg/i.test(log))
    add({
      favicon: 'web',
      title: 'Bloomberg',
      domain: 'bloomberg.com',
      url: 'https://www.bloomberg.com',
    });
  if (/cnbc/i.test(log))
    add({ favicon: 'web', title: 'CNBC', domain: 'cnbc.com', url: 'https://www.cnbc.com' });
  if (/weibo|微博/i.test(log))
    add({ favicon: 'weibo', title: 'Weibo', domain: 'weibo.com', url: 'https://weibo.com' });
  if (/zhihu|知乎/i.test(log))
    add({ favicon: 'web', title: 'Zhihu', domain: 'zhihu.com', url: 'https://www.zhihu.com' });
  if (/bilibili|哔哩/i.test(log))
    add({
      favicon: 'web',
      title: 'Bilibili',
      domain: 'bilibili.com',
      url: 'https://www.bilibili.com',
    });
  if (/wallstreet|wsj/i.test(log))
    add({ favicon: 'web', title: 'WSJ', domain: 'wsj.com', url: 'https://www.wsj.com' });
  if (/seeking\s*alpha/i.test(log))
    add({
      favicon: 'web',
      title: 'Seeking Alpha',
      domain: 'seekingalpha.com',
      url: 'https://seekingalpha.com',
    });
  return hits;
}

/** Pull cited links from synthesized Markdown report for the side panel. */
export function sourcesFromSignalRadarSummary(text: string, max = 15): SignalSearchSource[] {
  if (!text || !text.trim()) return [];

  const out: SignalSearchSource[] = [];
  const seen = new Set<string>();

  const stripTrail = (u: string) => u.replace(/[),.;]+$/g, '');

  const md = /\[([^\]]{1,200})\]\((https?:[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(text)) !== null && out.length < max) {
    const url = stripTrail(m[2]);
    const title = m[1].replace(/\s+/g, ' ').trim() || 'Link';
    if (!/^https?:\/\//i.test(url)) continue;
    const host = hostKey(url);
    if (!host || seen.has(url)) continue;
    seen.add(url);
    out.push({
      favicon: faviconForHost(host),
      title: title.slice(0, 120),
      domain: host,
      url,
    });
  }

  if (out.length >= max) return out;

  const bare = /https?:\/\/[^\s\])>'"]+/gi;
  let bm: RegExpExecArray | null;
  while ((bm = bare.exec(text)) !== null && out.length < max) {
    const url = stripTrail(bm[0]);
    const host = hostKey(url);
    if (!host || seen.has(url)) continue;
    seen.add(url);
    const short = host.replace(/^www\./, '');
    out.push({
      favicon: faviconForHost(host),
      title: short,
      domain: short,
      url,
    });
  }

  return out;
}
