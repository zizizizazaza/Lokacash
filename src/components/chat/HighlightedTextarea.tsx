import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';

/**
 * HighlightedTextarea — a textarea that visually highlights http(s) URLs
 * in the user's input as blue clickable text, the way ChatGPT / Cursor /
 * iMessage do it.
 *
 * Layering trick: a transparent <textarea> sits BELOW an aria-hidden
 * <div> that re-renders the same text with `<a>` tags around URLs. The
 * overlay is `pointer-events: none` so it doesn't eat caret-positioning
 * clicks — except for the URL anchors themselves, which opt in to
 * `pointer-events: auto` so they can be clicked normally. Plain-text
 * spans stay non-interactive, letting clicks fall through to the
 * textarea underneath.
 *
 * The two layers MUST share font / size / line-height / padding / wrap
 * behaviour exactly, otherwise highlights drift away from the actual
 * characters.
 */

interface Props extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const URL_RE = /\bhttps?:\/\/[^\s<>()"'`]+/gi;

/**
 * Strip trailing punctuation that's almost certainly part of the
 * surrounding sentence rather than the URL itself, so we don't paint
 * `.`/`,`/`)`/`，` etc. as part of the link.
 */
function trimTrailingPunct(raw: string): { core: string; tail: string } {
  const m = raw.match(/[\s.,;:!?。，；：！？、\]\)]+$/u);
  if (!m) return { core: raw, tail: '' };
  const cut = raw.length - m[0].length;
  return { core: raw.slice(0, cut), tail: m[0] };
}

/**
 * Walk the text once and yield alternating plain-text / url chunks.
 * Returning chunks (not raw HTML) lets React handle escaping for free.
 */
function tokenize(text: string): Array<{ type: 'text' | 'url'; value: string }> {
  if (!text) return [];
  const out: Array<{ type: 'text' | 'url'; value: string }> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) out.push({ type: 'text', value: text.slice(lastIndex, start) });
    const { core, tail } = trimTrailingPunct(match[0]);
    out.push({ type: 'url', value: core });
    if (tail) out.push({ type: 'text', value: tail });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) out.push({ type: 'text', value: text.slice(lastIndex) });
  return out;
}

const HighlightedTextarea = forwardRef<HTMLTextAreaElement, Props>(function HighlightedTextarea(
  { value, onChange, className, style, disabled, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Forward the inner ref so callers (focus management, autosize, etc.)
  // still get the textarea handle they'd normally hold.
  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement, []);

  // Keep overlay scroll synced with textarea scroll. Without this, long
  // multi-line inputs would have their highlighted overlay scroll out of
  // alignment with the textarea's caret.
  useLayoutEffect(() => {
    const ta = innerRef.current;
    const ov = overlayRef.current;
    if (!ta || !ov) return;
    const sync = () => {
      ov.scrollTop = ta.scrollTop;
      ov.scrollLeft = ta.scrollLeft;
    };
    sync();
    ta.addEventListener('scroll', sync);
    return () => ta.removeEventListener('scroll', sync);
  }, []);

  // Re-sync after every value change too — auto-resizing or wrapping shifts can
  // momentarily desync scroll positions.
  useEffect(() => {
    const ta = innerRef.current;
    const ov = overlayRef.current;
    if (ta && ov) {
      ov.scrollTop = ta.scrollTop;
      ov.scrollLeft = ta.scrollLeft;
    }
  }, [value]);

  const tokens = tokenize(value);

  return (
    <div className="relative" style={{ minHeight: style?.minHeight }}>
      {/* Textarea — the editing layer. Sits UNDER the overlay (DOM-first)
          so the overlay's URL anchors can grab clicks while plain-text
          spans (pointer-events:none) let edits pass through. Glyphs are
          painted transparent so only the overlay's coloured text shows. */}
      <textarea
        ref={innerRef}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`relative ${className || ''}`}
        style={{
          ...style,
          color: 'transparent',
          caretColor: '#111827',
        }}
        {...rest}
      />

      {/* Highlight overlay — the VISIBLE layer, stacked on top.
          `pointer-events: none` on the wrapper so caret-positioning
          clicks reach the textarea below; URL <a> children opt back in
          to `pointer-events: auto` so they're directly clickable like a
          normal hyperlink. */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words ${className || ''}`}
        style={{ ...style, caretColor: 'transparent' }}
      >
        {tokens.map((t, i) =>
          t.type === 'url' ? (
            <a
              key={i}
              href={t.value}
              target="_blank"
              rel="noopener noreferrer"
              title={t.value}
              className="text-blue-600 underline decoration-blue-400/60 underline-offset-2 hover:decoration-blue-600 cursor-pointer"
              style={{ pointerEvents: 'auto' }}
            >
              {t.value}
            </a>
          ) : (
            <span key={i}>{t.value}</span>
          ),
        )}
        {/* Trailing newline handling: when the value ends in '\n', the textarea
            renders an empty visual line that the overlay would otherwise
            collapse — append a zero-width space to preserve the line. */}
        {value.endsWith('\n') ? '​' : ''}
      </div>
    </div>
  );
});

export default HighlightedTextarea;
