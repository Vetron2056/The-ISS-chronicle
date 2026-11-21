/**
 * Procedural Web Audio synthesizer for orbital ambience, milestone telemetry chimes,
 * and 2031 atmospheric re-entry rumble. Zero external audio files required.
 */
export class OrbitalAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private enabled = false;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    if (!this.enabled) {
      this.enable();
    } else {
      this.disable();
    }
    return this.enabled;
  }

  public enable(): void {
    if (this.enabled) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.setupNodes();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.4);
    }
    this.enabled = true;
  }

  public disable(): void {
    if (!this.enabled) return;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.25);
    }
    this.enabled = false;
  }

  private setupNodes(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(ctx.destination);

    // Subtle deep orbital harmonic pad (F#1 + C#2 + A2 filtered)
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.16;

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    droneFilter.Q.value = 0.8;

    this.droneGain.connect(droneFilter);
    droneFilter.connect(this.masterGain);

    const freqs = [55, 82.41, 110, 164.81];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (idx - 1.5) * 4;
      const g = ctx.createGain();
      g.gain.value = idx === 0 ? 0.45 : 0.22 / (idx + 1);
      osc.connect(g);
      g.connect(this.droneGain!);
      osc.start();
    });

    // Procedural noise buffer for re-entry atmospheric plasma roar
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.04 * white) / 1.04;
      data[i] = lastOut * 2.5;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'bandpass';
    this.rumbleFilter.frequency.value = 110;
    this.rumbleFilter.Q.value = 0.9;

    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;

    noiseSource.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.masterGain);
    noiseSource.start();
  }

  public playMilestoneBeep(isFinal = false): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 523.25 : 880, now);
    if (!isFinal) {
      osc.frequency.setValueAtTime(1174.66, now + 0.065);
    }

    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.14, now + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, now + (isFinal ? 0.9 : 0.24));

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isFinal ? 0.95 : 0.28));
  }

  public setReentryIntensity(intensity: number): void {
    if (!this.ctx || !this.rumbleGain || !this.rumbleFilter) return;
    const clamped = Math.max(0, Math.min(1, intensity));
    this.rumbleGain.gain.setTargetAtTime(clamped * 0.45, this.ctx.currentTime, 0.15);
    this.rumbleFilter.frequency.setTargetAtTime(90 + clamped * 280, this.ctx.currentTime, 0.15);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.enabled = false;
  }
}
