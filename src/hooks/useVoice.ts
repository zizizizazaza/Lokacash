/**
 * useVoice — unified voice input (ASR) + output (TTS) hook
 *
 * Three-tier ASR strategy (fastest to slowest):
 *  1. Capacitor Native  — Android/iOS app (SpeechRecognizer SDK, <500ms)
 *  2. Web Speech API   — Desktop Chrome/Edge, Android Chrome browser (<1s)
 *  3. Whisper fallback — Firefox / old browsers (~13s, last resort)
 *
 * TTS: Native speechSynthesis API (all browsers)
 * Voice Mode: continuous listen → speak → listen loop
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// ─── Types ──────────────────────────────────────────────────────────

type AsrMode = 'capacitor' | 'webSpeech' | 'whisper';

interface UseVoiceOptions {
  language?: string;
  onTranscript?: (text: string) => void;
  onRecordingEnd?: (text: string) => void;
  autoSendOnSilence?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function detectAsrMode(browserSupportsSpeechRecognition: boolean): AsrMode {
  // IMPORTANT: window.Capacitor is present even in desktop browsers because the
  // Capacitor JS lib is always bundled. We must use isNativePlatform() to check
  // whether we're actually running inside a real iOS/Android app.
  const cap = (window as any).Capacitor;
  const isNative = !!(cap?.isNativePlatform?.());
  if (isNative) return 'capacitor';

  // iOS browser / Safari — Web Speech API in iOS Safari is unreliable
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) return 'whisper';

  // Firefox and browsers without Web Speech API
  if (!browserSupportsSpeechRecognition) return 'whisper';

  // Desktop Chrome/Edge/Opera and Android Chrome browser → fast!
  return 'webSpeech';
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useVoice(options: UseVoiceOptions = {}) {
  const { language = 'en-US', onTranscript, onRecordingEnd, autoSendOnSilence = true } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [asrMode, setAsrMode] = useState<AsrMode>('whisper'); // determined after mount

  // MediaRecorder (Whisper fallback) refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscriptRef = useRef('');

  // Web Speech API
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  // ─── Determine ASR mode after mount ────────────────────────────

  useEffect(() => {
    const mode = detectAsrMode(browserSupportsSpeechRecognition);
    console.log('[Voice] ASR mode detected:', mode, '| Capacitor:', !!(window as any).Capacitor);
    setAsrMode(mode);
  }, [browserSupportsSpeechRecognition]);

  // Convenience booleans
  const useFallback = asrMode === 'whisper';
  const useCapacitorNative = asrMode === 'capacitor';

  // ─── Web Speech API path ────────────────────────────────────────

  useEffect(() => {
    if (asrMode !== 'webSpeech' || !isRecording) return;
    if (transcript) {
      lastTranscriptRef.current = transcript;
      onTranscript?.(transcript);

      if (autoSendOnSilence && silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (autoSendOnSilence) {
        silenceTimerRef.current = setTimeout(() => {
          if (isRecording && lastTranscriptRef.current) {
            stopRecording();
          }
        }, 2000);
      }
    }
  }, [transcript, isRecording, asrMode]);

  useEffect(() => {
    if (asrMode !== 'webSpeech' || listening || !isRecording || !lastTranscriptRef.current) return;
    const finalText = lastTranscriptRef.current;
    setIsRecording(false);
    onRecordingEnd?.(finalText);
    resetTranscript();
    lastTranscriptRef.current = '';
  }, [listening, isRecording, asrMode]);

  // ─── Capacitor Native path (Android / iOS App) ────────────────

  const startCapacitorRecording = useCallback(async () => {
    try {
      console.log('[Voice] Using Capacitor native speech recognition');
      const { SpeechRecognition: CapSR } = await import('@capacitor-community/speech-recognition');

      let permResult: any;
      try {
        permResult = await CapSR.requestPermissions();
      } catch {
        permResult = await (CapSR as any).requestPermission();
      }
      const granted = permResult?.speechRecognition === 'granted' || permResult?.status === 'granted';
      if (!granted) {
        console.warn('[Voice] Microphone permission denied');
        setIsRecording(false);
        return;
      }

      await CapSR.removeAllListeners();

      // Capture partial (and final) results as they arrive
      await CapSR.addListener('partialResults' as any, (data: any) => {
        const match = data?.matches?.[0] || '';
        if (match) {
          lastTranscriptRef.current = match;
          onTranscript?.(match);
          console.log('[Voice] Capacitor partialResult:', match);
        }
      });

      // Handle auto-stop (silence timeout / Android ends recognition by itself)
      // The plugin may fire 'listeningState' with status 'stopped'
      try {
        await (CapSR as any).addListener('listeningState', (data: any) => {
          console.log('[Voice] Capacitor listeningState:', JSON.stringify(data));
          const stopped = data?.status === 'stopped' || data?.status === 'done';
          if (stopped) {
            const text = lastTranscriptRef.current;
            CapSR.removeAllListeners().catch(() => {});
            if (text) {
              onRecordingEnd?.(text);
              lastTranscriptRef.current = '';
            }
            setIsRecording(false);
          }
        });
      } catch { /* event may not exist in all plugin versions */ }

      await CapSR.start({
        language,
        maxResults: 1,
        partialResults: true,
        popup: false,
      } as any);

    } catch (err: any) {
      const errMsg = err?.message || '';
      // "No match" means no speech was detected — NOT a plugin failure.
      // Keep using native SDK for subsequent recordings.
      if (errMsg === 'No match' || errMsg.includes('NO_SPEECH') || errMsg.includes('no match')) {
        console.log('[Voice] No speech detected (normal if silent/emulator mic)');
        setIsRecording(false);
        return;
      }
      // Real plugin failure (e.g. "Method not implemented on web") → fall back to Whisper
      console.error('[Voice] ❌ Capacitor speech recognition error:', errMsg, err);
      console.warn('[Voice] Falling back to Whisper due to Capacitor error');
      setAsrMode('whisper');
      setIsRecording(false);
    }
  }, [language, onTranscript, onRecordingEnd]);

  const stopCapacitorRecording = useCallback(async () => {
    try {
      const { SpeechRecognition: CapSR } = await import('@capacitor-community/speech-recognition');
      await CapSR.stop();
      // Wait 800ms for the plugin to fire its final partialResults event after stop()
      // (200ms was too short — Android fires the event asynchronously)
      await new Promise(resolve => setTimeout(resolve, 800));
      const result = lastTranscriptRef.current;
      await CapSR.removeAllListeners();
      if (result) {
        onRecordingEnd?.(result);
        lastTranscriptRef.current = '';
      }
      setIsRecording(false);
    } catch (err) {
      console.error('[Voice] ❌ Capacitor stop error:', err);
      setIsRecording(false);
    }
  }, [onRecordingEnd]);

  // ─── MediaRecorder / Whisper fallback (Firefox etc.) ─────────

  const startMediaRecorder = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.error('[Voice] getUserMedia not available');
        setIsRecording(false);
        return;
      }

      console.log('[Voice] Using Whisper fallback (MediaRecorder)');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = 'audio/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/wav';
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
        }
      }
      console.log('[Voice] mimeType:', mimeType || 'browser default');

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('[Voice] MediaRecorder error:', event.error?.name, event.error?.message);
      };

      mediaRecorder.onstop = async () => {
        console.log('[Voice] MediaRecorder stopped. Chunks:', audioChunksRef.current.length);
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        console.log('[Voice] Audio blob:', audioBlob.size, 'bytes');

        if (audioBlob.size < 1000) {
          console.log('[Voice] Audio too short, ignoring');
          setIsRecording(false);
          return;
        }
        try {
          console.log('[Voice] Sending to Whisper...');
          const text = await transcribeAudio(audioBlob);
          console.log('[Voice] ✅ Whisper result:', text);
          if (text) onRecordingEnd?.(text);
        } catch (err) {
          console.error('[Voice] ❌ Whisper transcription failed:', err);
        }
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);
    } catch (err: any) {
      console.error('[Voice] ❌ Microphone access error:', err?.name, err?.message);
      setIsRecording(false);
    }
  }, [onRecordingEnd]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ─── Whisper API call ────────────────────────────────────────

  async function transcribeAudio(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('webm') ? 'webm' : 'wav';
    formData.append('audio', audioBlob, `recording.${ext}`);
    formData.append('language', language);

    const token = sessionStorage.getItem('loka_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/chat/transcribe`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) throw new Error(`Transcription failed: ${response.status}`);
    const result = await response.json();
    return result.text || '';
  }

  // ─── Public Controls ─────────────────────────────────────────

  const startRecording = useCallback(() => {
    console.log('[Voice] startRecording | asrMode:', asrMode);
    lastTranscriptRef.current = '';
    resetTranscript();
    setIsRecording(true);

    if (asrMode === 'capacitor') {
      startCapacitorRecording();
    } else if (asrMode === 'webSpeech') {
      console.log('[Voice] Using Web Speech API (fast path)');
      SpeechRecognition.startListening({ continuous: true, language });
    } else {
      startMediaRecorder();
    }
  }, [asrMode, language, startCapacitorRecording, startMediaRecorder, resetTranscript]);

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (asrMode === 'capacitor') {
      stopCapacitorRecording();
    } else if (asrMode === 'webSpeech') {
      SpeechRecognition.stopListening();
      if (lastTranscriptRef.current) {
        const finalText = lastTranscriptRef.current;
        setIsRecording(false);
        onRecordingEnd?.(finalText);
        resetTranscript();
        lastTranscriptRef.current = '';
      } else {
        setIsRecording(false);
      }
    } else {
      stopMediaRecorder();
    }
  }, [asrMode, stopCapacitorRecording, stopMediaRecorder, onRecordingEnd, resetTranscript]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // ─── TTS (Text-to-Speech) ────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      v => v.lang.startsWith(language.split('-')[0]) && v.name.includes('Google')
    ) || voices.find(
      v => v.lang.startsWith(language.split('-')[0]) && !v.localService
    ) || voices.find(
      v => v.lang.startsWith(language.split('-')[0])
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (voiceMode) setTimeout(() => startRecording(), 300);
    };
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [language, voiceMode, startRecording]);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  // ─── Voice Mode ───────────────────────────────────────────────

  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      setVoiceMode(false);
      stopRecording();
      stopSpeaking();
    } else {
      setVoiceMode(true);
      startRecording();
    }
  }, [voiceMode, startRecording, stopRecording, stopSpeaking]);

  // ─── Cleanup ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      stopMediaRecorder();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [stopMediaRecorder]);

  return {
    // Recording state
    isRecording,
    transcript: asrMode === 'webSpeech' ? transcript : '',
    listening: asrMode === 'webSpeech' ? listening : isRecording,

    // TTS state
    isSpeaking,
    speak,
    stopSpeaking,

    // Voice mode
    voiceMode,
    toggleVoiceMode,

    // Controls
    startRecording,
    stopRecording,
    toggleRecording,

    // Capabilities / debug
    hasSpeechRecognition: browserSupportsSpeechRecognition,
    hasSpeechSynthesis: typeof window !== 'undefined' && 'speechSynthesis' in window,
    useFallback,          // kept for backwards compat
    useCapacitorNative,   // true when running in Capacitor app
    asrMode,              // 'capacitor' | 'webSpeech' | 'whisper'
  };
}
