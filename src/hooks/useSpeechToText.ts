import { useState, useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { IFlytekStreamer } from '../services/iflytek';

export interface UseSpeechToTextProps {
  onResult?: (text: string) => void;
  language?: string;
}

export function useSpeechToText(props?: UseSpeechToTextProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { onResult, language = 'zh-CN' } = props || {};

  const [isAvailable, setIsAvailable] = useState(true);
  const iflytekRef = useRef<IFlytekStreamer | null>(null);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // iFlytek is our native engine
      setIsAvailable(true);
    } else {
      // Web fallback engine
      const WebSpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setIsAvailable(!!WebSpeechClass);
    }
    
    return () => {
       if (iflytekRef.current) {
         iflytekRef.current.stop();
       }
    };
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    setIsListening(true);

    if (Capacitor.isNativePlatform()) {
      try {
        const streamer = new IFlytekStreamer();
        iflytekRef.current = streamer;

        streamer.onResult((res) => {
          setTranscript(res.text);
          if (onResult) onResult(res.text);
        });

        streamer.onError((err) => {
          setError(err.message);
          setIsListening(false);
        });

        streamer.onStop(() => {
          setIsListening(false);
          iflytekRef.current = null;
        });

        await streamer.start();
        
      } catch (err: any) {
        setError(err.message || 'iFlytek initialization failed');
        setIsListening(false);
      }
    } else {
      // Web fallback
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          if (onResult) onResult(currentTranscript);
        };
        recognition.onerror = (event: any) => {
          setError(event.error);
          setIsListening(false);
        };
        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
        (window as any)._webSpeechPlugin = recognition;
      } else {
        setError('Browser does not support Speech Recognition');
        setIsListening(false);
      }
    }
  }, [language, onResult]);

  const stopListening = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      if (iflytekRef.current) {
        iflytekRef.current.stop();
      }
    } else {
      if ((window as any)._webSpeechPlugin) {
        (window as any)._webSpeechPlugin.stop();
      }
    }
    setIsListening(false);
  }, []);

  return { isListening, transcript, error, startListening, stopListening, isAvailable };
}
