/**
 * useAgentSocket — Unified socket event management for agent apps.
 * 
 * Eliminates the repeated pattern of:
 *   1. Defining 4+ handlers per app (started/progress/done/error)
 *   2. Each handler doing sessionId validation
 *   3. Binding on mount, unbinding on cleanup
 * 
 * Usage:
 *   useAgentSocket('agent:hedgefund', sessionId, {
 *     onStarted: () => setIsStreaming(true),
 *     onProgress: (data) => appendLog(data.log),
 *     onDone: (data) => finishWithReport(data.report),
 *     onError: (data) => showError(data.error),
 *   });
 */
import { useEffect } from 'react';
import { socket } from '../services/socket';

interface SocketHandlers {
  onStarted?: (data: any) => void;
  onProgress?: (data: any) => void;
  onStep?: (data: any) => void;
  onDone?: (data: any) => void;
  onError?: (data: any) => void;
}

/**
 * @param prefix - Socket event prefix, e.g. 'agent:hedgefund'
 * @param sessionId - Current session ID for filtering
 * @param handlers - Callbacks for each event phase
 * @param deps - Additional dependencies to re-bind listeners
 */
export function useAgentSocket(
  prefix: string,
  sessionId: string,
  handlers: SocketHandlers,
  deps: any[] = []
) {
  useEffect(() => {
    if (!prefix) return;

    const makeHandler = (cb?: (data: any) => void) => {
      if (!cb) return undefined;
      return (data: any) => {
        // Session filtering — skip events from other sessions
        if (data.sessionId && data.sessionId !== sessionId) return;
        cb(data);
      };
    };

    const onStarted = makeHandler(handlers.onStarted);
    const onProgress = makeHandler(handlers.onProgress);
    const onStep = makeHandler(handlers.onStep);
    const onDone = makeHandler(handlers.onDone);
    const onError = makeHandler(handlers.onError);

    if (onStarted) socket.on(`${prefix}:started`, onStarted);
    if (onProgress) socket.on(`${prefix}:progress`, onProgress);
    if (onStep) socket.on(`${prefix}:step`, onStep);
    if (onDone) socket.on(`${prefix}:done`, onDone);
    if (onError) socket.on(`${prefix}:error`, onError);

    return () => {
      if (onStarted) socket.off(`${prefix}:started`, onStarted);
      if (onProgress) socket.off(`${prefix}:progress`, onProgress);
      if (onStep) socket.off(`${prefix}:step`, onStep);
      if (onDone) socket.off(`${prefix}:done`, onDone);
      if (onError) socket.off(`${prefix}:error`, onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, sessionId, ...deps]);
}

/**
 * useMultiAgentSocket — Specifically for the consensus chat flow.
 * Handles: agent:chat:started, progress, stream_done, consensus_done, error, routing, routed
 */
interface MultiAgentHandlers {
  onStarted?: (data: any) => void;
  onProgress?: (data: { content: string; sessionId?: string }) => void;
  onStreamDone?: (data: { content: string; sessionId?: string }) => void;
  onConsensusDone?: (data: { result: any; sessionId?: string }) => void;
  onError?: (data: { error: string; sessionId?: string }) => void;
  onRouting?: (data: { sessionId: string }) => void;
  onRouted?: (data: { sessionId: string; mode: string }) => void;
}

export function useMultiAgentSocket(
  sessionId: string,
  handlers: MultiAgentHandlers,
  deps: any[] = []
) {
  useEffect(() => {
    const makeH = (cb?: (data: any) => void) => {
      if (!cb) return undefined;
      return (data: any) => {
        if (data.sessionId && data.sessionId !== sessionId) return;
        cb(data);
      };
    };

    const entries: [string, ((data: any) => void) | undefined][] = [
      ['agent:chat:started', makeH(handlers.onStarted)],
      ['agent:chat:progress', makeH(handlers.onProgress)],
      ['agent:chat:stream_done', makeH(handlers.onStreamDone)],
      ['agent:chat:consensus_done', makeH(handlers.onConsensusDone)],
      ['agent:chat:error', makeH(handlers.onError)],
      ['agent:chat:routing', makeH(handlers.onRouting)],
      ['agent:chat:routed', makeH(handlers.onRouted)],
    ];

    for (const [event, handler] of entries) {
      if (handler) socket.on(event, handler);
    }

    return () => {
      for (const [event, handler] of entries) {
        if (handler) socket.off(event, handler);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ...deps]);
}
