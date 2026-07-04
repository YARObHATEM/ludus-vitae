/**
 * The Resonance Matrix — a fully procedural WebAudio engine. No sample files:
 * every mud squelch, iron strike and reckoning drum is synthesized, so the
 * soundscape works offline forever.
 *
 * Laws applied here are COMPUTED IN RUST and delivered via the snapshot:
 *   - pitch_multiplier  = base pitch × momentum (clamped)
 *   - lowpass_cutoff    = muffled world below momentum 1.0
 *   - degradation       = rusted habits add a slow wobble to the master bus
 */

type StepKind = "MUD" | "EARTH" | "COBBLE" | "PAVED";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private ambienceBus!: GainNode;
  private wobbleOsc: OscillatorNode | null = null;
  private wobbleGain: GainNode | null = null;
  private ambienceStarted = false;

  private pitchMult = 1.0;
  private targetCutoff = 18000;
  private masterVol = 0.85;
  private sfxVol = 0.9;
  private musicVol = 0.6;
  private muted = false;

  /** Create lazily on the first user gesture (autoplay policy). */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.masterVol;
    this.lowpass = c.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = this.targetCutoff;
    this.lowpass.Q.value = 0.4;
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.ambienceBus = c.createGain();
    this.ambienceBus.gain.value = this.musicVol;
    this.sfxBus.connect(this.lowpass);
    this.ambienceBus.connect(this.lowpass);
    this.lowpass.connect(this.master);
    this.master.connect(c.destination);
    return c;
  }

  resume() {
    const c = this.ensure();
    if (c && c.state === "suspended") void c.resume();
    if (c && !this.ambienceStarted) this.startAmbience();
  }

  setVolumes(master: number, sfx: number, music: number) {
    this.masterVol = master;
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : master, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.ambienceBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05);
  }

  /** Apply the audio law computed by the Rust formulas module. */
  applyLaw(pitchMultiplier: number, lowpassCutoff: number, degradation: boolean) {
    this.pitchMult = pitchMultiplier;
    this.targetCutoff = lowpassCutoff;
    if (!this.ctx) return;
    this.lowpass.frequency.setTargetAtTime(lowpassCutoff, this.ctx.currentTime, 0.8);
    this.setDegradation(degradation);
  }

  private setDegradation(on: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.wobbleOsc) {
      // Slow amplitude wobble: the interface itself feels rusted.
      this.wobbleOsc = c.createOscillator();
      this.wobbleOsc.frequency.value = 0.55;
      this.wobbleGain = c.createGain();
      this.wobbleGain.gain.value = 0.07;
      this.wobbleOsc.connect(this.wobbleGain);
      this.wobbleGain.connect(this.master.gain);
      this.wobbleOsc.start();
    } else if (!on && this.wobbleOsc) {
      this.wobbleOsc.stop();
      this.wobbleOsc.disconnect();
      this.wobbleGain?.disconnect();
      this.wobbleOsc = null;
      this.wobbleGain = null;
    }
  }

  // ------------------------------------------------------------- helpers

  private noiseBuffer(seconds: number): AudioBuffer {
    const c = this.ctx!;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // pinkish noise via leaky integrator
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      data[i] = last * 3.2;
    }
    return buf;
  }

  private env(node: GainNode, t0: number, peak: number, attack: number, decay: number) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private ping(freq: number, peak: number, decay: number, type: OscillatorType = "sine", when = 0) {
    const c = this.ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * this.pitchMult;
    const g = c.createGain();
    this.env(g, t0, peak, 0.004, decay);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
  }

  private burst(opts: {
    dur: number; peak: number; filterType: BiquadFilterType; freq: number; q?: number;
    freqEnd?: number; when?: number;
  }) {
    const c = this.ensure();
    if (!c) return;
    const t0 = c.currentTime + (opts.when ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(opts.dur + 0.05);
    const filter = c.createBiquadFilter();
    filter.type = opts.filterType;
    filter.frequency.setValueAtTime(opts.freq * this.pitchMult, t0);
    if (opts.freqEnd) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd * this.pitchMult), t0 + opts.dur);
    }
    filter.Q.value = opts.q ?? 0.8;
    const g = c.createGain();
    this.env(g, t0, opts.peak, 0.003, opts.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.1);
  }

  // ------------------------------------------------------------- ambience

  private startAmbience() {
    const c = this.ensure();
    if (!c || this.ambienceStarted) return;
    this.ambienceStarted = true;

    // Wind bed: looped noise through a wandering bandpass.
    const wind = c.createBufferSource();
    wind.buffer = this.noiseBuffer(4);
    wind.loop = true;
    const windFilter = c.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.5;
    const windGain = c.createGain();
    windGain.gain.value = 0.05;
    const windLfo = c.createOscillator();
    windLfo.frequency.value = 0.07;
    const windLfoGain = c.createGain();
    windLfoGain.gain.value = 220;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambienceBus);
    wind.start();
    windLfo.start();

    // Deep hall drone: two detuned lows, barely audible, very medieval.
    const droneGain = c.createGain();
    droneGain.gain.value = 0.035;
    for (const [freq, type] of [[55, "sine"], [82.5, "triangle"]] as [number, OscillatorType][]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = Math.random() * 7 - 3.5;
      o.connect(droneGain);
      o.start();
    }
    droneGain.connect(this.ambienceBus);

    // Slow breathing of the drone.
    const breathe = c.createOscillator();
    breathe.frequency.value = 0.03;
    const breatheGain = c.createGain();
    breatheGain.gain.value = 0.018;
    breathe.connect(breatheGain);
    breatheGain.connect(droneGain.gain);
    breathe.start();
  }

  // ------------------------------------------------------------- one-shots

  /** Locomotion footstep, voiced by the terrain under the avatar. */
  footstep(kind: StepKind) {
    if (kind === "MUD") {
      // Heavy squelch: low noise splat + suction tail.
      this.burst({ dur: 0.13, peak: 0.16, filterType: "lowpass", freq: 420, freqEnd: 120 });
      this.ping(64, 0.1, 0.12, "sine");
    } else if (kind === "EARTH") {
      this.burst({ dur: 0.07, peak: 0.11, filterType: "lowpass", freq: 900, freqEnd: 300 });
      this.ping(85, 0.06, 0.08, "sine");
    } else if (kind === "COBBLE") {
      // Crisp stone strike with a slight ring.
      this.burst({ dur: 0.045, peak: 0.1, filterType: "highpass", freq: 1900, q: 1.1 });
      this.ping(210, 0.05, 0.09, "triangle");
    } else {
      this.burst({ dur: 0.035, peak: 0.09, filterType: "highpass", freq: 2600, q: 1.4 });
      this.ping(300, 0.045, 0.07, "triangle");
    }
  }

  /** Verified execution — the anvil strike. Deliberately satisfying. */
  anvilStrike() {
    this.burst({ dur: 0.09, peak: 0.3, filterType: "bandpass", freq: 2400, q: 2.2 });
    this.ping(220, 0.26, 0.32, "square");
    this.ping(660, 0.12, 0.4, "sine", 0.006);
    this.ping(991, 0.07, 0.5, "sine", 0.01);
    this.ping(55, 0.24, 0.2, "sine");
  }

  /** Milestone sealed — two brass notes rising a fifth. */
  milestoneSeal() {
    for (const [f, w] of [[262, 0], [392, 0.16]] as [number, number][]) {
      const c = this.ensure();
      if (!c) return;
      const t0 = c.currentTime + w;
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * this.pitchMult;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      const g = c.createGain();
      this.env(g, t0, 0.14, 0.02, 0.55);
      o.connect(lp); lp.connect(g); g.connect(this.sfxBus);
      o.start(t0); o.stop(t0 + 0.75);
    }
    this.ping(1568, 0.05, 0.7, "sine", 0.32);
  }

  /** Boss destroyed. */
  bossDown() {
    this.ping(48, 0.34, 0.7, "sine");
    this.burst({ dur: 0.4, peak: 0.2, filterType: "lowpass", freq: 800, freqEnd: 90 });
    for (const [f, w] of [[196, 0.15], [247, 0.3], [294, 0.45]] as [number, number][]) {
      this.ping(f, 0.1, 0.6, "triangle", w);
    }
  }

  /** Missed/negative feedback — a dark thud. */
  declineThud() {
    const c = this.ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.32);
    const g = c.createGain();
    this.env(g, t0, 0.2, 0.008, 0.34);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t0); o.stop(t0 + 0.45);
  }

  /** The Reckoning — three war drums. */
  reckoningDrums() {
    for (const w of [0, 0.42, 0.84]) {
      const c = this.ensure();
      if (!c) return;
      const t0 = c.currentTime + w;
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(110, t0);
      o.frequency.exponentialRampToValueAtTime(52, t0 + 0.3);
      const g = c.createGain();
      this.env(g, t0, 0.32, 0.005, 0.36);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t0); o.stop(t0 + 0.5);
      this.burst({ dur: 0.12, peak: 0.12, filterType: "lowpass", freq: 500, freqEnd: 150, when: w });
    }
  }

  /** Gate opened — rising ascension arpeggio. */
  levelAscend() {
    const notes = [262, 330, 392, 523, 659];
    notes.forEach((f, i) => this.ping(f, 0.13, 0.8, "triangle", i * 0.13));
    this.ping(1047, 0.06, 1.4, "sine", notes.length * 0.13);
  }

  /** Oracle speaks — airy whisper sweep. */
  oracleWhisper() {
    this.burst({ dur: 0.5, peak: 0.06, filterType: "bandpass", freq: 900, freqEnd: 2600, q: 3 });
  }

  uiTick() {
    this.burst({ dur: 0.018, peak: 0.05, filterType: "highpass", freq: 3200 });
  }

  uiOpen() {
    this.burst({ dur: 0.09, peak: 0.05, filterType: "bandpass", freq: 500, freqEnd: 1400, q: 1.5 });
  }

  uiClose() {
    this.burst({ dur: 0.09, peak: 0.05, filterType: "bandpass", freq: 1400, freqEnd: 400, q: 1.5 });
  }
}

export const audio = new AudioEngine();
