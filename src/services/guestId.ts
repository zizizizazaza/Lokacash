/**
 * Guest identity — a stable UUID held in localStorage so unauthenticated
 * users can accumulate quota and chat history across page reloads.
 *
 * The id is never shown to the user; it's purely a handle for the backend
 * GuestQuota table and the local chat-history cache. When the user signs
 * in, we keep the id around (harmless) but stop using it.
 */
const LS_KEY = 'loka_guest_id';

function randomUuid(): string {
  // Prefer native crypto.randomUUID when available (all evergreens + HTTPS).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback — RFC4122-ish. Good enough for a non-security-sensitive id.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(LS_KEY);
    if (existing && existing.length >= 8 && existing.length <= 128) {
      return existing;
    }
  } catch {
    // localStorage can throw in private mode / sandboxed iframes; fall through.
  }
  const fresh = randomUuid();
  try {
    localStorage.setItem(LS_KEY, fresh);
  } catch {
    // Non-persistent fallback; guest will get a new id on every reload.
  }
  return fresh;
}

export function readGuestId(): string | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v && v.length >= 8 && v.length <= 128 ? v : null;
  } catch {
    return null;
  }
}
