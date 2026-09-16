/**
 * Procedural synth — unlocked on the first user gesture.
 * Master + sfx + music buses; all ramps go through setTargetAtTime.
 */

export class NexusAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private muted = false;
  private lastReverse = 0;

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.gain.value = 0.7;
      this.music.gain.value = 0.28;
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.startDrone();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    this.applyMute();
  }

  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
  }

  private applyMute(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  private startDrone(): void {
    if (!this.ctx || !this.music) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 55;
    g.gain.value = 0.05;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.music);
    osc.start();
    this.drone = osc;
    this.droneGain = g;
  }

  setTension(stage: number, time: number): void {
    if (!this.ctx || !this.drone) return;
    const freq = 55 + Math.min(40, stage * 6 + time * 0.35);
    this.drone.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
    if (this.droneGain) {
      const level = 0.04 + Math.min(0.08, stage * 0.012);
      this.droneGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.1);
    }
  }

  beat(intensity = 1): void {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 70 + intensity * 10;
    g.gain.setValueAtTime(0.18 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.13);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  reverse(): void {
    if (!this.ctx || !this.sfx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastReverse < 0.04) return;
    this.lastReverse = now;
    const t = now;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.07);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.09);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  graze(): void {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1480, t);
    osc.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.11);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  pass(): void {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    const rate = 0.94 + Math.random() * 0.12;
    osc.frequency.value = 440 * rate;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.07);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  stageUp(): void {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 330 * (i + 1);
      const start = t + i * 0.07;
      g.gain.setValueAtTime(0.08, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(g);
      g.connect(this.sfx);
      osc.start(start);
      osc.stop(start + 0.2);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    }
  }

  death(): void {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.35, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    noise.start(t);
    noise.stop(t + 0.36);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.4);
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(og);
    og.connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.44);
  }

  destroy(): void {
    try {
      this.drone?.stop();
      this.drone?.disconnect();
      void this.ctx?.close();
    } catch {
      // already closed
    }
    this.ctx = null;
    this.drone = null;
  }
}
