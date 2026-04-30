// HtmlReportFrame — sandboxed iframe that renders the LLM's HTML report
// output (Web mode). Self-measuring height + cross-window guard so multiple
// frames don't fight over each other's postMessage events.
// Extracted from SuperAgentChat.tsx during the Phase-2 refactor.
import React, { useEffect, useRef, useState } from 'react';

export const HtmlReportFrame: React.FC<{ html: string; isStreaming: boolean }> = ({ html, isStreaming }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [iframeHeight, setIframeHeight] = useState(400);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        // Strip any markdown code fences the LLM might have wrapped around
        const cleanHtml = html.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        const fontOrigin = window.location.origin;
        const fullDoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face { font-family: 'Open Runde'; src: url('${fontOrigin}/fonts/open-runde/OpenRunde-Regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Open Runde'; src: url('${fontOrigin}/fonts/open-runde/OpenRunde-Medium.woff2') format('woff2'); font-weight: 500; font-display: swap; }
@font-face { font-family: 'Open Runde'; src: url('${fontOrigin}/fonts/open-runde/OpenRunde-Semibold.woff2') format('woff2'); font-weight: 600; font-display: swap; }
@font-face { font-family: 'Open Runde'; src: url('${fontOrigin}/fonts/open-runde/OpenRunde-Bold.woff2') format('woff2'); font-weight: 700; font-display: swap; }
:root { --color-text-primary: #1a1a1a; --color-text-secondary: #666; --color-text-tertiary: #999; --color-background-secondary: #f5f5f5; --color-border-tertiary: #e5e5e5; --border-radius-md: 8px; --border-radius-lg: 12px; --font-sans: 'Open Runde', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { overflow-x: hidden; max-width: 100%; width: 100%; touch-action: pan-y; }
body { font-family: var(--font-sans); color: var(--color-text-primary); background: white; line-height: 1.75; font-size: 15px; word-wrap: break-word; overflow-wrap: anywhere; }
ul, ol { padding-left: 1.2em; margin: 0.5rem 0; text-align: left; }
li { margin-bottom: 4px; font-size: 15px; line-height: 1.75; }
img, video, canvas, svg { max-width: 100%; height: auto; }
table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; }
th, td { word-wrap: break-word; overflow-wrap: anywhere; }
pre { max-width: 100%; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
code { word-break: break-word; }
a { word-break: break-all; }
</style>
</head><body>${cleanHtml}
<style id="loka-report-override">
  /* Force-upgrade typography for both new and historical reports */
  .report-wrap, .report-wrap p, .report-wrap li, .report-wrap td, .report-wrap .guru-analysis, .report-wrap .debate-text, .report-wrap .consensus-detail, .report-wrap .risk-item { font-family: 'Open Runde', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; }
  /* Headings and titles use Inter (geometric) for report-like authority */
  .report-wrap h1, .report-wrap h2, .report-wrap h3, .report-wrap h4, .report-wrap .report-title, .report-wrap .section-title, .report-wrap .consensus-verdict, .report-wrap .report-label, .report-wrap .guru-name, .report-wrap th { font-family: 'Open Runde', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; letter-spacing: -0.01em; }
  .report-wrap { font-size: 15px !important; line-height: 1.75 !important; }
  .report-wrap p, .report-wrap li, .report-wrap .guru-analysis, .report-wrap .debate-text, .report-wrap .consensus-detail, .report-wrap .risk-item { font-size: 15px !important; line-height: 1.75 !important; }
  .report-wrap .report-title { font-size: 26px !important; font-weight: 700 !important; line-height: 1.35 !important; letter-spacing: -0.015em !important; }
  .report-wrap .consensus-verdict { font-size: 20px !important; font-weight: 700 !important; letter-spacing: -0.01em !important; }
  .report-wrap .guru-name { font-size: 16px !important; font-weight: 600 !important; }
  .report-wrap .cmp-table { font-size: 14px !important; }
</style>
<script>
  // Strip follow-up questions section — the frontend renders it separately as interactive buttons.
  // The HTML generation prompt says not to include it, but the LLM sometimes adds it anyway.
  (function() {
    var kw = ['持续跟踪','关键问题','follow-up questions','follow up questions','questions to watch','延伸思考','延伸问题'];
    function hasKw(t) { t = (t||'').toLowerCase(); return kw.some(function(k){ return t.indexOf(k.toLowerCase()) >= 0; }); }
    document.querySelectorAll('.section-title').forEach(function(el) {
      if (hasKw(el.textContent)) { var s = el.closest('.section') || el.parentElement; if (s) s.remove(); }
    });
    ['h1','h2','h3','h4','strong','b'].forEach(function(tag) {
      document.querySelectorAll(tag).forEach(function(el) {
        if (hasKw(el.textContent)) {
          var block = el.closest('div') || el.parentElement;
          if (block && block !== document.body) block.remove();
        }
      });
    });
  })();
  function measure() {
    // Use the larger of body and documentElement to handle browsers that
    // measure scrollHeight differently. Round up to avoid sub-pixel underflow.
    var h = Math.ceil(Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
      document.body ? document.body.scrollHeight : 0,
      document.body ? document.body.offsetHeight : 0
    ));
    return h;
  }
  var lastSent = 0;
  function sendHeight() {
    var h = measure();
    if (h === lastSent) return;
    lastSent = h;
    window.parent.postMessage({ type: 'loka-iframe-height', height: h }, '*');
  }
  sendHeight();
  // ResizeObserver fires on any size change — catches font swaps, image loads,
  // CSS-only reflows, anything MutationObserver would miss.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(sendHeight).observe(document.documentElement);
    if (document.body) new ResizeObserver(sendHeight).observe(document.body);
  } else {
    new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true });
  }
  // Re-measure after fonts and late images settle.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(sendHeight).catch(function(){});
  }
  window.addEventListener('load', function() {
    sendHeight();
    setTimeout(sendHeight, 200);
    setTimeout(sendHeight, 800);
  });
</` + `script>
</body></html>`;
        iframe.srcdoc = fullDoc;
    }, [html]);

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            // CRITICAL: only accept messages from THIS iframe's contentWindow.
            // Without this guard, every HtmlReportFrame instance on the page
            // updates its height to whatever any other iframe just posted —
            // causing all reports to jitter on every tap.
            if (e.source !== iframeRef.current?.contentWindow) return;
            if (e.data?.type === 'loka-iframe-height' && typeof e.data.height === 'number') {
                // +16 buffer absorbs sub-pixel rounding and any final layout
                // shift after measure() runs but before the iframe finishes
                // painting. Cap at 8000 to handle long Roundtable reports.
                const next = Math.min(e.data.height + 16, 8000);
                setIframeHeight(prev => (prev === next ? prev : next));
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    return (
        <div className="relative w-full">
            {isStreaming && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200/60 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[11px] text-gray-500 font-medium">Rendering...</span>
                </div>
            )}
            <iframe
                ref={iframeRef}
                sandbox="allow-scripts"
                scrolling="no"
                className="w-full border-0 rounded-xl block"
                style={{ height: iframeHeight, display: 'block' }}
                title="Research Report"
            />
        </div>
    );
};
