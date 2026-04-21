import { api } from './api';

export interface IFlytekResult {
  text: string;
  isFinal: boolean;
}

export class IFlytekStreamer {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  
  private onResultCb?: (res: IFlytekResult) => void;
  private onErrorCb?: (error: Error) => void;
  private onStopCb?: () => void;
  
  private status = 0; // 0: first frame, 1: middle, 2: last
  private currentFullText = '';

  public onResult(cb: (res: IFlytekResult) => void) { this.onResultCb = cb; }
  public onError(cb: (error: Error) => void) { this.onErrorCb = cb; }
  public onStop(cb: () => void) { this.onStopCb = cb; }

  public async start() {
    this.status = 0;
    this.currentFullText = '';

    try {
      // 1. Get signed URL from backend
      const res = await api.getIflytekToken();
      const { url, appId } = res;

      // 2. Setup WebSocket
      this.ws = new WebSocket(url);
      
      this.ws.onopen = async () => {
        // Start streaming microphones
        await this.startRecording(appId);
      };

      this.ws.onmessage = (e) => {
        const response = JSON.parse(e.data);
        if (response.code !== 0) {
          this.handleError(new Error(`iFlytek Error: ${response.code} - ${response.message}`));
          return;
        }

        const wsResult = response.data?.result;
        if (wsResult) {
          const ws = wsResult.ws;
          let str = '';
          if (ws) {
            for (const item of ws) {
              str += item.cw[0].w;
            }
          }
           
          // Append new segment
          this.currentFullText += str;

          if (this.onResultCb) {
             this.onResultCb({
                text: this.currentFullText,
                isFinal: response.data.status === 2
             });
          }
        }

        if (response.data.status === 2) {
           this.stop();
        }
      };

      this.ws.onerror = () => {
        this.handleError(new Error('WebSocket connection error'));
      };
      
      this.ws.onclose = () => {
        this.stop();
      };

    } catch (err: any) {
      this.handleError(new Error(err.message || 'Failed to initialize iFlytek'));
    }
  }

  private async startRecording(appId: string) {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Safari polyfill and create 16kHz context
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass({ sampleRate: 16000 });
    
    const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
    const bufferSize = 4096;
    this.scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);
    
    source.connect(this.scriptNode);
    this.scriptNode.connect(this.audioCtx.destination); 

    this.scriptNode.onaudioprocess = (e) => {
      if (this.status === 2) return;
      const float32Array = e.inputBuffer.getChannelData(0);
      this.sendAudioFrame(float32Array, appId);
    };
  }

  private sendAudioFrame(float32Array: Float32Array, appId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Fast Float32 down to Int16
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Fast Int16 to Base64
    const uint8Array = new Uint8Array(pcm16.buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    const audioBase64 = btoa(binary);

    const frame: any = {
      data: {
        status: this.status,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: audioBase64
      }
    };

    if (this.status === 0) {
      frame.common = { app_id: appId };
      frame.business = {
        language: 'zh_cn', 
        domain: 'iat',
        accent: 'mandarin',
        vad_eos: 5000
      };
    }

    this.ws.send(JSON.stringify(frame));

    if (this.status === 0) {
      this.status = 1;
    }
  }

  public stop() {
    if (this.status !== 2 && this.ws && this.ws.readyState === WebSocket.OPEN) {
       this.status = 2; // End
       this.ws.send(JSON.stringify({
          data: {
             status: 2,
             format: 'audio/L16;rate=16000',
             encoding: 'raw',
             audio: ''
          }
       }));
    }

    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    
    setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
           this.ws.close();
           this.ws = null;
        }
    }, 1500);

    if (this.onStopCb) {
        this.onStopCb();
        this.onStopCb = undefined; // Fire only once
    }
  }

  private handleError(e: Error) {
    if (this.onErrorCb) this.onErrorCb(e);
    this.stop();
  }
}
