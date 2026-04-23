/**
 * Audio Utilities for WebSocket Voice Assistant
 * Handles PCM audio recording, encoding, and playback
 */

export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
};

/**
 * Downsample Float32 audio from `srcRate` to `dstRate` using a simple average
 * box-filter. Good enough for speech recognition (Deepgram doesn't need
 * audiophile quality). Upsampling is not supported — returns input unchanged
 * if srcRate <= dstRate.
 */
export function downsampleFloat32(
  input: Float32Array,
  srcRate: number,
  dstRate: number,
): Float32Array {
  if (srcRate === dstRate || srcRate <= dstRate) return input;
  const ratio = srcRate / dstRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < outLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (
      let i = offsetBuffer;
      i < nextOffsetBuffer && i < input.length;
      i++
    ) {
      accum += input[i];
      count++;
    }
    output[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return output;
}

/**
 * Convert Float32Array PCM data to Int16Array
 */
export function float32ToInt16(buffer: Float32Array): Int16Array {
  const int16 = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Convert Int16Array to base64 string
 */
export function int16ToBase64(int16: Int16Array): string {
  const uint8 = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/**
 * Convert Float32Array PCM to base64 (complete pipeline)
 */
export function pcmToBase64(pcmData: Float32Array): string {
  const int16 = float32ToInt16(pcmData);
  return int16ToBase64(int16);
}

/**
 * Convert base64 string to Int16Array
 */
export function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const uint8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8[i] = binary.charCodeAt(i);
  }
  return new Int16Array(uint8.buffer);
}

/**
 * Convert Int16Array to Float32Array for playback
 */
export function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

/**
 * Audio Player class using Web Audio API
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  /**
   * AudioContext timestamp when the next chunk should start. When a chunk
   * arrives we schedule it at `max(currentTime, nextPlayTime)` so consecutive
   * chunks play gap-free even if they come from a stream-of-small-pieces TTS
   * like Minimax (~57ms/chunk).
   */
  private nextPlayTime = 0;

  constructor(private config: AudioConfig = DEFAULT_AUDIO_CONFIG) {}

  async initialize(): Promise<void> {
    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
    });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);

    // Tap the same audio graph with an AnalyserNode so consumers (e.g.
    // Live2D avatar lip-sync) can read the RMS level without the sample-rate
    // mismatch issues that a MediaStreamAudioDestinationNode would introduce.
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.gainNode.connect(this.analyserNode);
  }

  /** Access the analyser tapping the TTS output for lip-sync, visualizers etc. */
  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** Expose audio context so callers can react to suspended state etc. */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  async playBase64Audio(
    base64Audio: string,
    sampleRate?: number,
  ): Promise<void> {
    if (!this.audioContext || !this.gainNode) {
      await this.initialize();
    }
    // Browsers auto-suspend AudioContexts until a user gesture. Recording
    // already counts as one, but just in case:
    if (this.audioContext?.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {}
    }

    const int16 = base64ToInt16(base64Audio);
    const float32 = int16ToFloat32(int16);

    this.schedulePCM(float32, sampleRate ?? this.config.sampleRate);
  }

  /**
   * Schedule a PCM chunk to play immediately after the previously scheduled
   * one, with no gap. This replaces the old queue-and-await-onended approach
   * that left 10-50ms JS event-loop gaps between chunks (→ choppy playback
   * with fine-grained TTS like Minimax).
   */
  private schedulePCM(pcmData: Float32Array, sampleRate: number): void {
    if (!this.audioContext || !this.gainNode) return;

    const audioBuffer = this.audioContext.createBuffer(
      this.config.channels,
      pcmData.length,
      sampleRate,
    );
    audioBuffer.getChannelData(0).set(pcmData);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    const now = this.audioContext.currentTime;
    // Clamp: if we've fallen behind (e.g. context was paused), restart from now.
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + audioBuffer.duration;
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  destroy(): void {
    this.nextPlayTime = 0;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Audio Recorder class using MediaRecorder and AudioWorklet
 */
export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private onDataCallback: ((base64: string) => void) | null = null;

  constructor(private config: AudioConfig = DEFAULT_AUDIO_CONFIG) {}

  async start(onData: (base64: string) => void): Promise<void> {
    this.onDataCallback = onData;

    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.config.sampleRate,
        channelCount: this.config.channels,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Make sure all audio tracks are enabled
    this.mediaStream.getAudioTracks().forEach((t) => (t.enabled = true));

    // Create audio context
    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
    });

    // Some browsers start AudioContext in "suspended" even on user gesture.
    // Explicitly resume to ensure ScriptProcessor receives frames immediately.
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (_) {
        // ignore — will resume below after connections
      }
    }

    // Create source from media stream
    this.sourceNode = this.audioContext.createMediaStreamSource(
      this.mediaStream,
    );

    // Create processor node (buffer size 4096)
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    // Browsers (especially macOS Chrome) often ignore the 16000Hz request
    // and run the AudioContext at 44100/48000 instead. The ScriptProcessor
    // then delivers samples at that native rate. Deepgram is configured for
    // exactly 16000Hz, so we must downsample client-side before sending.
    const TARGET_RATE = this.config.sampleRate;
    const actualRate = this.audioContext.sampleRate;
    console.log(
      `[AudioRecorder] AudioContext rate=${actualRate}, target=${TARGET_RATE}, resampling=${actualRate !== TARGET_RATE}`,
    );

    this.processorNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      const resampled =
        actualRate === TARGET_RATE
          ? inputData
          : downsampleFloat32(inputData, actualRate, TARGET_RATE);
      const base64 = pcmToBase64(resampled);

      if (this.onDataCallback) {
        this.onDataCallback(base64);
      }
    };

    // Connect nodes
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    // Final resume to guarantee processing kicks in without needing a re-toggle
    if (this.audioContext.state !== "running") {
      try {
        await this.audioContext.resume();
      } catch (err) {
        console.warn("AudioContext resume failed:", err);
      }
    }
  }

  stop(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.onDataCallback = null;
  }

  getStream(): MediaStream | null {
    return this.mediaStream;
  }
}

/**
 * Calculate audio volume from PCM data
 */
export function calculateVolume(pcmData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < pcmData.length; i++) {
    sum += pcmData[i] * pcmData[i];
  }
  return Math.sqrt(sum / pcmData.length);
}

/**
 * Analyze audio frequencies for visualization
 */
export class AudioAnalyzer {
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;

  constructor(
    private audioContext: AudioContext,
    private source: AudioNode,
  ) {
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(
      new ArrayBuffer(this.analyser.frequencyBinCount)
    );
    this.source.connect(this.analyser);
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.dataArray) return null;
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }

  destroy(): void {
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    this.dataArray = null;
  }
}
