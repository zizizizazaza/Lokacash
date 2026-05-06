import React, { useEffect } from 'react';

interface Props {
  message: string | null;
  onDismiss: () => void;
  /** Duration ms before auto-dismissing. Default 2800. */
  duration?: number;
}

/** Tiny transient toast pinned to the bottom-center of the viewport.
 *  Used to surface client-side validation hints (e.g. "Up to 4 images").
 *  Dismisses on its own after `duration` ms. */
const ImageCapToast: React.FC<Props> = ({ message, onDismiss, duration = 2800 }) => {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [message, onDismiss, duration]);

  if (!message) return null;
  return (
    <div className="fixed left-1/2 bottom-24 z-[95] -translate-x-1/2 pointer-events-none">
      <div className="px-4 py-2.5 rounded-full bg-gray-900 text-white text-[12.5px] font-medium shadow-xl shadow-black/20 ring-1 ring-white/10 flex items-center gap-2">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {message}
      </div>
    </div>
  );
};

export default ImageCapToast;
