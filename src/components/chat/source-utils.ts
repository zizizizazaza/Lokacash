// Source-list merge + collection helpers. Extracted from SuperAgentChat.tsx
// during the Phase-1 refactor.
import type { SearchSource, SearchModuleData, ThinkingFlow } from './types';

/** Merge two source lists by url|domain|title key, preferring earlier entries
 *  but filling in missing fields (snippet, url) from later duplicates. */
export function mergeSearchSources(primary?: SearchSource[], secondary?: SearchSource[]): SearchSource[] {
    const out: SearchSource[] = [];
    const byKey = new Map<string, number>();
    const list = [...(primary || []), ...(secondary || [])];

    for (const s of list) {
        const key = `${s.url || ''}|${s.domain || ''}|${s.title || ''}`.toLowerCase();
        const idx = byKey.get(key);
        if (idx == null) {
            byKey.set(key, out.length);
            out.push({ ...s });
            continue;
        }
        const prev = out[idx];
        out[idx] = {
            ...prev,
            ...s,
            snippet: prev.snippet || s.snippet,
            url: prev.url || s.url,
        };
    }
    return out;
}

/** Walk all `search` modules in a thinking flow and gather every source —
 *  including ones nested inside `sections[].sources`. Deduplicated. */
export function collectThinkingSearchSources(flow?: ThinkingFlow): SearchSource[] {
    if (!flow?.modules?.length) return [];
    const gathered: SearchSource[] = [];
    for (const m of flow.modules) {
        if (m.type !== 'search' || !m.data) continue;
        const data = m.data as SearchModuleData;
        if (Array.isArray(data.sources)) gathered.push(...data.sources);
        if (Array.isArray(data.sections)) {
            for (const sec of data.sections) {
                if (Array.isArray(sec.sources)) gathered.push(...sec.sources);
            }
        }
    }
    return mergeSearchSources(gathered, []);
}
