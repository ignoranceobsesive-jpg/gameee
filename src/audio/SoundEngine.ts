import { AudioEvent, DayPhase } from '../game/types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private windNode: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private muted = false;
  private masterVol = 0.6;
  private ambientVol = 0.45;
  private sfxVol = 0.7;
  private started = false;

  public unlock(): void {
    if (this.started) {
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.ambientGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.applyVolumes();
      this.startAmbientBed();
      this.started = true;
    } catch {
      // AudioContext unavailable
    }
  }

  private startAmbientBed(): void {
    if (!this.ctx || !this.ambientGain) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 210;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 65.41;

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 98.0;

    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.05;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(padGain);
    padGain.connect(this.ambientGain);
    osc1.start();
    osc2.start();
    this.droneOsc1 = osc1;
    this.droneOsc2 = osc2;
    this.droneGain = padGain;

    // Soft filtered dusty wind bed
    const bufSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 1.6;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 380;
    windFilter.Q.value = 0.85;

    const wGain = this.ctx.createGain();
    wGain.gain.value = 0.05;

    noise.connect(windFilter);
    windFilter.connect(wGain);
    wGain.connect(this.ambientGain);
    noise.start();
    this.windNode = noise;
    this.windGain = wGain;
  }

  public updateAtmosphere(phase: DayPhase, alarmActive: boolean, isStorm: boolean): void {
    if (!this.ctx || !this.droneOsc1 || !this.droneOsc2 || !this.droneGain || !this.windGain) return;
    const now = this.ctx.currentTime;
    if (alarmActive) {
      this.droneOsc1.frequency.setTargetAtTime(58.27, now, 0.8);
      this.droneOsc2.frequency.setTargetAtTime(82.41, now, 0.8);
      this.droneGain.gain.setTargetAtTime(0.095, now, 0.8);
    } else if (phase === 'NIGHT') {
      // Unsettling low sub-drone with quiet wind for suspense
      this.droneOsc1.frequency.setTargetAtTime(49.0, now, 1.5);
      this.droneOsc2.frequency.setTargetAtTime(69.3, now, 1.5);
      this.droneGain.gain.setTargetAtTime(0.075, now, 1.5);
    } else if (phase === 'EVENING') {
      this.droneOsc1.frequency.setTargetAtTime(55.0, now, 1.5);
      this.droneOsc2.frequency.setTargetAtTime(82.41, now, 1.5);
      this.droneGain.gain.setTargetAtTime(0.045, now, 1.5);
    } else {
      // Deliberate daytime calm / near silence
      this.droneOsc1.frequency.setTargetAtTime(65.41, now, 1.5);
      this.droneOsc2.frequency.setTargetAtTime(98.0, now, 1.5);
      this.droneGain.gain.setTargetAtTime(0.025, now, 1.5);
    }

    this.windGain.gain.setTargetAtTime(isStorm ? 0.14 : phase === 'NIGHT' ? 0.07 : 0.04, now, 1.2);
  }

  public playEvent(ev: AudioEvent): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const pitch = 0.93 + Math.random() * 0.14;

    const playTone = (
      type: OscillatorType,
      f0: number,
      f1: number,
      dur: number,
      vol: number
    ) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0 * pitch, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, f1 * pitch), now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    };

    switch (ev.kind) {
      case 'swing':
        playTone('triangle', 320, 110, 0.11, 0.09);
        break;
      case 'bow':
        playTone('sine', 540, 210, 0.1, 0.08);
        break;
      case 'hit_flesh':
        playTone('sawtooth', 170, 55, 0.12, 0.14);
        break;
      case 'hit_wood':
        playTone('square', 230, 92, 0.09, 0.1);
        break;
      case 'hit_stone':
        playTone('triangle', 680, 310, 0.09, 0.1);
        break;
      case 'hurt':
        playTone('sawtooth', 140, 48, 0.22, 0.18);
        break;
      case 'dodge':
        playTone('sine', 260, 440, 0.09, 0.07);
        break;
      case 'pickup':
        playTone('triangle', 520, 780, 0.09, 0.08);
        break;
      case 'build':
        playTone('square', 190, 290, 0.13, 0.1);
        break;
      case 'heal':
        playTone('sine', 440, 660, 0.22, 0.09);
        break;
      case 'alarm':
        // Clanging village iron bell
        playTone('triangle', 587, 575, 0.45, 0.16);
        setTimeout(() => playTone('triangle', 587, 575, 0.45, 0.13), 260);
        break;
      case 'howl':
        playTone('sawtooth', 220, 340, 0.42, 0.1);
        setTimeout(() => playTone('triangle', 320, 150, 0.5, 0.09), 280);
        break;
      case 'watcher':
        playTone('sine', 74, 46, 0.9, 0.15);
        break;
      case 'crt_static':
        playTone('square', 920, 180, 0.16, 0.08);
        break;
      case 'footstep':
        playTone('sine', 110, 60, 0.04, 0.03);
        break;
      case 'lightning':
        playTone('sawtooth', 1280, 220, 0.14, 0.13);
        setTimeout(() => playTone('square', 920, 140, 0.11, 0.09), 55);
        break;
      case 'fire_ignite':
        playTone('sawtooth', 260, 520, 0.18, 0.11);
        setTimeout(() => playTone('triangle', 420, 160, 0.22, 0.08), 70);
        break;
      case 'boss_roar':
        playTone('sawtooth', 98, 42, 0.72, 0.2);
        setTimeout(() => playTone('triangle', 142, 54, 0.65, 0.16), 140);
        break;
      case 'merchant_bell':
        playTone('sine', 880, 876, 0.32, 0.12);
        setTimeout(() => playTone('sine', 1174, 1170, 0.36, 0.1), 160);
        break;
      case 'shrine':
        playTone('sine', 196, 130, 0.68, 0.15);
        setTimeout(() => playTone('triangle', 293, 220, 0.55, 0.11), 180);
        break;
      case 'rescue':
        playTone('triangle', 440, 660, 0.18, 0.11);
        setTimeout(() => playTone('triangle', 660, 880, 0.24, 0.12), 140);
        break;
    }
  }

  public playUiClick(): void {
    this.playEvent({ kind: 'pickup' });
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolumes(master: number, ambient: number, sfx: number): void {
    this.masterVol = master;
    this.ambientVol = ambient;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.ambientGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVol, now, 0.05);
    this.ambientGain.gain.setTargetAtTime(this.ambientVol, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, now, 0.05);
  }

  public dispose(): void {
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      this.windNode?.stop();
      void this.ctx?.close();
    } catch {
      // ignore
    }
  }
}
