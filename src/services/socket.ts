import { io, Socket } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Properly derive socket connection URL and path from API_BASE
// e.g. "https://nftkashai.online/lokacash/api" → origin: "https://nftkashai.online", path: "/lokacash/api/socket.io"
let SOCKET_URL: string;
let SOCKET_PATH: string;

if (API_BASE.startsWith('http')) {
  const url = new URL(API_BASE);
  SOCKET_URL = url.origin;
  SOCKET_PATH = url.pathname.replace(/\/?$/, '') + '/socket.io';
} else {
  SOCKET_URL = window.location.origin;
  SOCKET_PATH = API_BASE.replace(/\/?$/, '') + '/socket.io';
}

const LOG = '[LokaSocket]';

class SocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private tokenGetter: (() => Promise<string | null>) | null = null;
  private listeners: Record<string, Function[]> = {};
  private isRefreshing = false; // Prevent concurrent refresh loops
  private emitQueue: { event: string; args: unknown[] }[] = [];
  private static readonly EMIT_QUEUE_MAX = 32;

  setToken(token: string) {
    if (this.token === token) return;
    this.token = token;
    this.connect();
  }

  /** Register a dynamic token getter (e.g. Privy getAccessToken) for auto-refresh */
  setTokenGetter(getter: () => Promise<string | null>) {
    this.tokenGetter = getter;
  }

  clearToken() {
    this.token = null;
    this.tokenGetter = null;
    this.emitQueue = [];
    this.disconnect();
  }

  private flushEmitQueue() {
    if (!this.socket?.connected) return;
    const n = this.emitQueue.length;
    if (n) console.log(LOG, 'flushEmitQueue', n, 'event(s)');
    while (this.emitQueue.length > 0) {
      const item = this.emitQueue.shift()!;
      console.log(LOG, 'emit (from queue) →', item.event);
      this.socket.emit(item.event, ...(item.args as []));
    }
  }

  getDebugState() {
    return {
      connected: Boolean(this.socket?.connected),
      socketId: this.socket?.id ?? null,
      queuedEmits: this.emitQueue.length,
      socketUrl: SOCKET_URL,
      socketPath: SOCKET_PATH,
      hasToken: Boolean(this.token),
    };
  }

  private connect() {
    if (!this.token) {
      console.warn(LOG, 'connect() skipped — no token');
      return;
    }

    console.log(LOG, 'connect()', { url: SOCKET_URL, path: SOCKET_PATH });

    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      auth: { token: this.token },
      reconnection: true,
      reconnectionAttempts: Infinity,  // Never give up (Telegram-style)
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,     // Cap at 30s with exponential backoff
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket Connected', LOG, 'id=', this.socket?.id, 'queued=', this.emitQueue.length);
      this.isRefreshing = false; // Reset on successful connect
      this.flushEmitQueue();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔴 WebSocket Disconnected', LOG, reason);
    });

    this.socket.on('connect_error', async (err) => {
      console.error('Socket connect error:', err.message);

      // If the error is auth-related and we have a tokenGetter, refresh and retry
      const isAuthError = /expired|invalid|auth|unauthorized|jwt/i.test(err.message);
      if (isAuthError && this.tokenGetter && !this.isRefreshing) {
        this.isRefreshing = true;
        console.warn('[Socket] Auth error detected, refreshing token...');
        try {
          const freshToken = await this.tokenGetter();
          if (freshToken && this.socket) {
            this.token = freshToken;
            (this.socket.auth as any).token = freshToken;
            // socket.io will auto-retry with the updated auth on next reconnection attempt
            console.log('[Socket] Token refreshed, reconnecting...');
          }
        } catch (refreshErr) {
          console.error('[Socket] Token refresh failed:', refreshErr);
        } finally {
          // Allow another refresh attempt after a cooldown
          setTimeout(() => { this.isRefreshing = false; }, 5000);
        }
      }
    });

    this.socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    // Setup global listeners dispatcher
    this.socket.onAny((event, ...args) => {
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => cb(...args));
      }
    });
  }

  /**
   * Reconnect with a fresh token. Same token + already connected → no action; same token but no instance → connect;
    */
  reconnectWithToken(token: string) {
    if (!token) return;
    if (this.token === token) {
      if (this.socket?.connected) {
        console.log(LOG, 'reconnectWithToken: same token, already connected');
        return;
      }
      if (!this.socket) {
        console.log(LOG, 'reconnectWithToken: same token, no socket → connect()');
        this.connect();
      } else {
        console.log(LOG, 'reconnectWithToken: same token, socket exists but not connected (wait reconnect)');
      }
      return;
    }
    console.log(LOG, 'reconnectWithToken: new token → reconnect');
    this.token = token;
    if (this.socket) {
      (this.socket.auth as any).token = token;
      this.socket.disconnect();
      this.socket.connect();
    } else {
      this.connect();
    }
  }

  private disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Subscribe to typed events
  on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback); // Return unsubscribe function
  }

  off(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event: string, ...args: any[]) {
    if (!this.socket?.connected) {
      if (this.emitQueue.length >= SocketClient.EMIT_QUEUE_MAX) {
        console.warn(LOG, 'emit queue full, drop oldest');
        this.emitQueue.shift();
      }
      this.emitQueue.push({ event, args });
      const preview =
        event === 'agent:chat' && args[0] && typeof args[0] === 'object'
          ? { mode: (args[0] as { mode?: string }).mode, sessionId: (args[0] as { sessionId?: string }).sessionId }
          : undefined;
      console.warn(LOG, 'emit QUEUED (offline)', event, preview ?? '', 'queueLen=', this.emitQueue.length);
      return;
    }
    const preview =
      event === 'agent:chat' && args[0] && typeof args[0] === 'object'
        ? { mode: (args[0] as { mode?: string }).mode, sessionId: (args[0] as { sessionId?: string }).sessionId }
        : undefined;
    console.log(LOG, 'emit →', event, preview ?? '');
    this.socket.emit(event, ...args);
  }

  get connected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const socket = new SocketClient();
