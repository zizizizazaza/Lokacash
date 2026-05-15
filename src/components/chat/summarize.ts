// Summarize a free-form user question into a short topic title used as the
// chat session label. Extracted from SuperAgentChat.tsx during the Phase-1
// refactor.

const STOP_WORDS = new Set(['THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'HOW', 'WHY', 'CAN', 'YOU', 'HAS', 'WAS', 'HIS', 'HER', 'ALL', 'ANY', 'WHO', 'ITS', 'GET', 'LET', 'MAY', 'OUR', 'SAY', 'SHE', 'TOO', 'USE', 'WAY', 'NOW', 'FROM', 'WITH', 'VIEW', 'TAKE']);

// Detect guru names mentioned in the query → returns display-friendly short name
const GURU_TITLE_MAP: Array<[RegExp, string]> = [
    [/\b(warren\s+)?buffett\b|巴菲特|股神/i, 'Buffett'],
    [/\b(charlie\s+)?munger\b|芒格/i, 'Munger'],
    [/\b(peter\s+)?lynch\b|林奇/i, 'Lynch'],
    [/\b(ben(jamin)?\s+)?graham\b|格雷厄姆/i, 'Graham'],
    [/\b(phil(ip)?\s+)?fisher\b|费雪/i, 'Fisher'],
    [/\b(bill\s+)?ackman\b|阿克曼/i, 'Ackman'],
    [/\bcathie(\s+wood)?\b|木头姐/i, 'Cathie Wood'],
    [/\b(michael\s+)?burry\b|伯里|大空头/i, 'Burry'],
    [/\b(mohnish\s+)?pabrai\b|帕布莱/i, 'Pabrai'],
    [/\b(nassim\s+)?taleb\b|塔勒布|黑天鹅/i, 'Taleb'],
    [/\b(stanley\s+)?druckenmiller\b|德鲁肯米勒/i, 'Druckenmiller'],
    [/\b(aswath\s+)?damodaran\b|达摩达兰/i, 'Damodaran'],
    [/\bjhunjhunwala\b|rakesh/i, 'Jhunjhunwala'],
];

function detectGurus(q: string): string[] {
    const found = new Set<string>();
    for (const [re, name] of GURU_TITLE_MAP) {
        if (re.test(q)) found.add(name);
    }
    return Array.from(found);
}

export function summarizeTitle(raw: string): string {
    if (!raw) return 'New Chat';
    const q = raw.replace(/[？?！!。]+$/g, '').trim();
    const tickers = [...new Set((q.match(/\b[A-Z]{2,5}\b/g) || []).filter(t => !STOP_WORDS.has(t)))];
    const gurus = detectGurus(q);
    const isZh = /[\u4e00-\u9fff]/.test(q);

    // Guru-centric queries → "TSLA: Damodaran's Take" / "巴菲特看 TSLA"
    if (gurus.length > 0) {
        const subject = tickers[0] || (() => {
            // Try extract a subject noun before/after the guru mention
            const m = q.match(/(?:on|about|for|看|怎么看|的观点|分析)\s*([A-Za-z\u4e00-\u9fff0-9\.\-]{2,20})/i);
            return m ? m[1].trim() : '';
        })();
        const guruStr = gurus.length === 1 ? gurus[0] : gurus.slice(0, 2).join(' & ');
        if (subject) return isZh ? `${guruStr}看${subject}` : `${subject}: ${guruStr}'s Take`;
        return isZh ? `${guruStr}的观点` : `${guruStr}'s View`;
    }

    const cmpMatch = q.match(/(?:compare|对比|vs\.?)\s+(.{2,15})\s+(?:vs\.?|and|与|和|跟)\s+(.{2,15})/i);
    if (cmpMatch) return `${cmpMatch[1].trim()} vs ${cmpMatch[2].trim().replace(/\s*(fundamentals|for|的|基本面).*/i, '')} Comparison`;

    const analyzeMatch = q.match(/(?:analyze|analysis|分析|研究|evaluate|评估)\s+(.{2,30}?)(?:\s+(?:stock|recent|latest|最近|performance|表现|情况|from|by).*)?$/i);
    if (analyzeMatch) {
        const subject = analyzeMatch[1].replace(/^(the|a|an|this)\s+/i, '').replace(/'s$/, '').trim();
        return `${subject} Analysis`;
    }

    const buyMatch = q.match(/(?:is|should|are|值得|适合|能不能|可以)\s+(.{2,20}?)\s+(?:still\s+)?(?:a\s+)?(?:buy|worth|invest|入手|买入|购买)/i);
    if (buyMatch) return `${buyMatch[1].replace(/^(i|we)\s+/i, '').trim()} Investment Outlook`;

    if (/risk|风险/.test(q)) {
        const subject = q.match(/(?:risk|风险)\s*(?:of|assessment|评估)?\s*(?:of|for)?\s*(.{2,20})/i);
        return subject ? `${subject[1].trim()} Risk Assessment` : 'Risk Assessment';
    }
    if (/forecast|predict|预测|simulate|模拟/.test(q)) {
        return tickers.length > 0 ? `${tickers.join('/')} Forecast` : 'Market Forecast';
    }
    if (/demand|市场|landscape|competitive|竞品|行业/.test(q)) {
        const topicMatch = q.match(/(?:demand|市场|landscape|competitive|行业)\s*(?:for|of|about|关于)?\s*(.{2,25})/i);
        return topicMatch ? `${topicMatch[1].replace(/[？?]$/, '').trim()} Market Research` : 'Market Research';
    }
    if (/^(which|what|哪些|哪个|推荐)/i.test(q)) {
        const topicMatch = q.match(/(?:which|what|哪些|哪个)\s+(.{2,30}?)(?:\s+(?:have|has|are|is|worth|best|最好|right now))/i);
        return topicMatch ? `${topicMatch[1].trim()} Overview` : tickers.length > 0 ? `${tickers[0]} Overview` : 'Investment Overview';
    }
    if (tickers.length > 0) return `${tickers.slice(0, 2).join(' & ')} Analysis`;

    const core = q
        .replace(/^(help me|please|帮我|请|能不能|可以帮我|i want to|i need to)\s+/i, '')
        .replace(/^(search|find|look|check|tell me|give me|show me)\s+(for|about|into|up)?\s*/i, '')
        .trim();
    const words = core.split(/\s+/);
    const short = words.length > 8 ? words.slice(0, 8).join(' ') : core;
    return short.length > 50 ? short.slice(0, 48) + '…' : short;
}
