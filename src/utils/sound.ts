/**
 * Web Audio API synthesizer & sound effects manager.
 * 100% offline, ultra-low latency, zero external asset dependencies.
 */

class SoundEffects {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  public enabled: boolean = true;
  public ambienceEnabled: boolean = false;
  private isUnlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // Auto-unlock Web Audio context on first user interaction (touch/click/keydown)
      const unlock = () => {
        this.unlockContext();
        window.removeEventListener('click', unlock);
        window.removeEventListener('touchstart', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('click', unlock, { once: true, passive: true });
      window.addEventListener('touchstart', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true, passive: true });

      // Suspend/resume audio automatically when tab visibility changes
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => {});
          }
        } else {
          if (this.ctx && this.ctx.state === 'suspended' && this.enabled) {
            this.ctx.resume().catch(() => {});
          }
        }
      });
    }
  }

  private initCtx() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        this.pregenerateNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public unlockContext() {
    this.initCtx();
    this.isUnlocked = true;
  }

  private pregenerateNoiseBuffer() {
    if (!this.ctx || this.noiseBuffer) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.1);
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
  }

  /** Subtle card hover / selection tone */
  public playCardSelect() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(784, now + 0.05);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Ignore
    }
  }

  /** Tactile card snap / impact on felt */
  public playCardPlay() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;

      // Low thump
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.06);
      oscGain.gain.setValueAtTime(0.25, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.06);

      // Noise snap
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start(now);
      }
    } catch {
      // Ignore
    }
  }

  /** "Le Mbap" - Puissant claquement sec de carte maîtresse (10, 9♠ ou 3 Kora) */
  public playMbapSlap(isMajor: boolean = true) {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;

      // Deep wood/felt punch
      const punchOsc = this.ctx.createOscillator();
      const punchGain = this.ctx.createGain();
      punchOsc.type = 'triangle';
      punchOsc.frequency.setValueAtTime(isMajor ? 180 : 150, now);
      punchOsc.frequency.exponentialRampToValueAtTime(30, now + 0.12);

      punchGain.gain.setValueAtTime(isMajor ? 0.45 : 0.3, now);
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      punchOsc.connect(punchGain);
      punchGain.connect(this.masterGain);
      punchOsc.start(now);
      punchOsc.stop(now + 0.12);

      // Sharp acoustic table slap
      const slapOsc = this.ctx.createOscillator();
      const slapGain = this.ctx.createGain();
      slapOsc.type = 'square';
      slapOsc.frequency.setValueAtTime(320, now);
      slapOsc.frequency.exponentialRampToValueAtTime(80, now + 0.04);

      slapGain.gain.setValueAtTime(0.25, now);
      slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      slapOsc.connect(slapGain);
      slapGain.connect(this.masterGain);
      slapOsc.start(now);
      slapOsc.stop(now + 0.04);

      // Snappy white noise whip
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400, now);
        filter.Q.setValueAtTime(2, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
      }
    } catch {
      // Ignore
    }
  }

  /** Effet sonore tranchant "COUPÉ !" (Quand une carte maîtresse est coupée par un 10) */
  public playCutSlash() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;

      // Metallic high slash
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(1200, now);
      osc1.frequency.exponentialRampToValueAtTime(2400, now + 0.04);
      osc1.frequency.exponentialRampToValueAtTime(400, now + 0.12);

      gain1.gain.setValueAtTime(0.22, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.14);

      // Sharp low accent
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(260, now + 0.02);
      osc2.frequency.exponentialRampToValueAtTime(80, now + 0.15);

      gain2.gain.setValueAtTime(0.2, now + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now + 0.02);
      osc2.stop(now + 0.15);
    } catch {
      // Ignore
    }
  }

  /** Battement de cœur de tension pour la 5ème main ("Heartbeat") */
  public playHeartbeatTension() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;

      // First thud
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(75, now);
      osc1.frequency.exponentialRampToValueAtTime(35, now + 0.1);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.1);

      // Second thud (shortly after)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(65, now + 0.14);
      osc2.frequency.exponentialRampToValueAtTime(30, now + 0.25);
      gain2.gain.setValueAtTime(0.22, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.25);
    } catch {
      // Ignore
    }
  }

  /** Tintement de jetons en cascade lors du gain de pot */
  public playCoinCascade() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const freqs = [1568, 1760, 2093, 2349, 2793]; // G6, A6, C7, D7, F7
      freqs.forEach((freq, idx) => {
        const time = this.ctx!.currentTime + idx * 0.05;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.05, time + 0.08);

        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(time);
        osc.stop(time + 0.1);
      });
    } catch {
      // Ignore
    }
  }

  /** Pop d'émoticône / Réplique */
  public playEmotePop() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore
    }
  }

  /** Son de K.O. / Élimination (Gong sombre) */
  public playEliminationKO() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;

      // Low dramatic gong
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.6);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.7);
    } catch {
      // Ignore
    }
  }

  /** Ambiance sonore de salon/table (Ultra douce, feutrée et apaisante) */
  public setAmbience(enable: boolean) {
    this.ambienceEnabled = enable;
    if (!enable) {
      if (this.ambienceSource) {
        try {
          this.ambienceSource.stop();
          this.ambienceSource.disconnect();
        } catch {
          // Ignore
        }
        this.ambienceSource = null;
      }
      return;
    }

    if (!this.enabled) return;

    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain || this.ambienceSource) return;

      // Generate 2 seconds of smooth pink/brown room noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      }

      this.ambienceSource = this.ctx.createBufferSource();
      this.ambienceSource.buffer = buffer;
      this.ambienceSource.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(0.025, this.ctx.currentTime); // Very subtle

      this.ambienceSource.connect(filter);
      filter.connect(this.ambienceGain);
      this.ambienceGain.connect(this.masterGain);

      this.ambienceSource.start();
    } catch {
      // Ignore
    }
  }

  /** Shuffling sequence */
  public playShuffle() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      for (let j = 0; j < 4; j++) {
        setTimeout(() => {
          this.playCardPlay();
        }, j * 65);
      }
    } catch {
      // Ignore
    }
  }

  /** Trick sweep / card collection animation sound */
  public playCardSweep() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;

      // Whoosh filter over noise
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(3.0, now);
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.18);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
      }

      // Soft rising chime
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.2);

      oscGain.gain.setValueAtTime(0.12, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      // Ignore
    }
  }

  /** Trick winning chime */
  public playTrickWin() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const now = this.ctx!.currentTime + i * 0.07;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.24);
      });
    } catch {
      // Ignore
    }
  }

  /** Effet sonore d'alerte / Chasse de Kora déclenchée */
  public playKoraAlert() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      // High dramatic alarm chime
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Low bass alert thud
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(150, now);
      osc2.frequency.exponentialRampToValueAtTime(45, now + 0.3);
      gain2.gain.setValueAtTime(0.35, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now);
      osc2.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }

  /** Round/Partie Victory Fanfare */
  public playRoundVictory() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const fanfare = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      fanfare.forEach((freq, idx) => {
        const now = this.ctx!.currentTime + idx * 0.11;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.4);
      });
    } catch {
      // Ignore
    }
  }

  /** Kora Win Effect (3 on 5th trick) */
  public playKora() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const notes = [392, 587.33, 783.99]; // G4, D5, G5
      notes.forEach((freq, idx) => {
        const now = this.ctx!.currentTime + idx * 0.08;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.45);
      });
    } catch {
      // Ignore
    }
  }

  /** Double Kora Win Effect (Consecutive 3s) */
  public playDoubleKora() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
      notes.forEach((freq, idx) => {
        const now = this.ctx!.currentTime + idx * 0.06;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.38);
      });
    } catch {
      // Ignore
    }
  }

  /** Three Sevens (777) Jackpot Sound */
  public playThreeSevens() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const notes = [587.33, 739.99, 880, 1174.66, 1479.98]; // D5, F#5, A5, D6, F#6
      notes.forEach((freq, idx) => {
        const now = this.ctx!.currentTime + idx * 0.07;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.55);
      });
    } catch {
      // Ignore
    }
  }

  /** Under 21 Special Fanfare */
  public playUnder21() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const notes = [523.25, 783.99, 1046.5, 1318.51, 1567.98];
      notes.forEach((freq, idx) => {
        const now = this.ctx!.currentTime + idx * 0.075;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.6);
      });
    } catch {
      // Ignore
    }
  }

  /** Rapid ascending tick/chime for bet incrementation animation */
  public playBetIncreaseCountUp() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const pitches = [440, 554.37, 659.25, 880, 1108.73];
      pitches.forEach((freq, idx) => {
        const now = this.ctx!.currentTime + idx * 0.055;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.12);
      });
    } catch {
      // Ignore
    }
  }

  /** Dramatic low descent sound when player is defeated / eliminated / bankrupt */
  public playRoundDefeat() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;

      const defeatTones = [330, 293.66, 261.63, 220, 164.81]; // E4, D4, C4, A3, E3
      defeatTones.forEach((freq, idx) => {
        const now = this.ctx!.currentTime + idx * 0.12;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.35);
      });
    } catch {
      // Ignore
    }
  }

  public playElimination() {
    this.playRoundDefeat();
  }
}

export const sounds = new SoundEffects();

/**
 * Mobile vibration haptic feedback helper
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'turn' = 'light') {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.vibrate ||
    (typeof document !== 'undefined' && document.hidden)
  ) {
    return;
  }
  try {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'heavy':
        navigator.vibrate(40);
        break;
      case 'success':
        navigator.vibrate([20, 35, 30]);
        break;
      case 'turn':
        navigator.vibrate([15, 20, 15]);
        break;
    }
  } catch {
    // Silently ignore if blocked by browser policy
  }
}
