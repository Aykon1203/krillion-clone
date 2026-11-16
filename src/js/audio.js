/**
 * Krillion Procedural Web Audio Engine
 * Pure synthesized submarine audio (sonar, descent swoosh, timer urgency, tier chimes, fanfare, rejection).
 * Requires zero external audio assets (no MP3/WAV files).
 */

const TIER_FREQUENCIES = {
  plankton: [523.25],
  too_clever: [523.25, 587.33],
  schooler: [523.25, 659.25, 783.99],
  rare: [523.25, 659.25, 783.99, 880.0],
  deep_cut: [523.25, 659.25, 783.99, 880.0, 1046.5],
  one_in_a_krillion: [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
};

export class SoundManager {
  /**
   * @param {object} [options]
   * @param {string} [options.storageKey='krillion_sound_muted']
   * @param {Storage|object|null} [options.storage=globalThis.localStorage]
   */
  constructor({
    storageKey = 'krillion_sound_muted',
    storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null)
  } = {}) {
    this.storageKey = storageKey;
    this.storage = storage;
    this.ctx = null;
    this.callLog = [];

    let initialMuted = false;
    try {
      if (this.storage && typeof this.storage.getItem === 'function') {
        const stored = this.storage.getItem(this.storageKey);
        if (stored !== null) {
          initialMuted = stored === 'true' || stored === '1';
        }
      }
    } catch {
      // Storage access error fallback
    }
    this.muted = initialMuted;
  }

  /**
   * Initializes or resumes the AudioContext on user interaction.
   * @returns {AudioContext|null}
   */
  init() {
    if (typeof globalThis !== 'undefined') {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AudioContextClass) {
        try {
          if (!this.ctx) {
            this.ctx = new AudioContextClass();
          }
          if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
            const promise = this.ctx.resume();
            if (promise && typeof promise.catch === 'function') {
              promise.catch(() => {});
            }
          }
        } catch {
          // AudioContext blocked or unavailable
        }
      }
    }
    return this.ctx;
  }

  /**
   * Returns current mute status.
   * @returns {boolean}
   */
  isMuted() {
    return Boolean(this.muted);
  }

  /**
   * Toggles mute state and persists to storage.
   * @returns {boolean} New mute state
   */
  toggleMute() {
    this.muted = !this.muted;
    try {
      if (this.storage && typeof this.storage.setItem === 'function') {
        this.storage.setItem(this.storageKey, String(this.muted));
      }
    } catch {
      // Storage error fallback
    }
    return this.muted;
  }

  /**
   * Internal helper to prepare audio context before playback.
   * @private
   * @returns {boolean} Whether audio can be played
   */
  _ensureContext() {
    if (!this.ctx) {
      this.init();
    }
    return Boolean(this.ctx);
  }

  /**
   * Plays a submarine sonar ping (pure sine wave + exponential gain decay).
   * @param {number} [freq=880]
   * @returns {OscillatorNode|null}
   */
  playSonar(freq = 880) {
    this.callLog.push({ type: 'sonar', freq });
    if (this.muted || !this._ensureContext()) return null;

    try {
      const now = this.ctx.currentTime || 0;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      if (osc.frequency && typeof osc.frequency.setValueAtTime === 'function') {
        osc.frequency.setValueAtTime(freq, now);
      }

      if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(0.35, now);
        if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        }
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);

      return osc;
    } catch {
      return null;
    }
  }

  /**
   * Plays diving descent swoosh (downward frequency sweep / low-pass filter).
   * @returns {OscillatorNode|null}
   */
  playDive() {
    this.callLog.push({ type: 'dive', freq: 220 });
    if (this.muted || !this._ensureContext()) return null;

    try {
      const now = this.ctx.currentTime || 0;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      if (osc.frequency && typeof osc.frequency.setValueAtTime === 'function') {
        osc.frequency.setValueAtTime(260, now);
        if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
          osc.frequency.exponentialRampToValueAtTime(55, now + 0.8);
        }
      }

      let lastNode = osc;
      if (typeof this.ctx.createBiquadFilter === 'function') {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        if (filter.frequency && typeof filter.frequency.setValueAtTime === 'function') {
          filter.frequency.setValueAtTime(800, now);
          if (typeof filter.frequency.exponentialRampToValueAtTime === 'function') {
            filter.frequency.exponentialRampToValueAtTime(100, now + 0.8);
          }
        }
        osc.connect(filter);
        lastNode = filter;
      }

      if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(0.4, now);
        if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        }
      }

      lastNode.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.8);

      return osc;
    } catch {
      return null;
    }
  }

  /**
   * Plays timer countdown tick blip. Higher pitch when <= 5s.
   * @param {boolean} [urgent=false]
   * @returns {OscillatorNode|null}
   */
  playTick(urgent = false) {
    const freq = urgent ? 1400 : 880;
    this.callLog.push({ type: 'tick', urgent, freq });
    if (this.muted || !this._ensureContext()) return null;

    try {
      const now = this.ctx.currentTime || 0;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      if (osc.frequency && typeof osc.frequency.setValueAtTime === 'function') {
        osc.frequency.setValueAtTime(freq, now);
      }

      const duration = urgent ? 0.05 : 0.04;
      if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(urgent ? 0.35 : 0.2, now);
        if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
          gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        }
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);

      return osc;
    } catch {
      return null;
    }
  }

  /**
   * Plays valid answer chime arpeggiated chord scaling with rarity tier.
   * @param {string} [tierKey='plankton']
   * @returns {OscillatorNode|null}
   */
  playChime(tierKey = 'plankton') {
    const notes = TIER_FREQUENCIES[tierKey] || TIER_FREQUENCIES.plankton;
    this.callLog.push({ type: 'chime', tierKey, freq: notes[0] });
    if (this.muted || !this._ensureContext()) return null;

    try {
      const now = this.ctx.currentTime || 0;
      let primaryOsc = null;

      notes.forEach((freq, idx) => {
        const noteStart = now + idx * 0.05;
        const noteDuration = 0.45;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        if (!primaryOsc) primaryOsc = osc;

        osc.type = 'sine';
        if (osc.frequency && typeof osc.frequency.setValueAtTime === 'function') {
          osc.frequency.setValueAtTime(freq, noteStart);
        }

        if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
          gain.gain.setValueAtTime(0.25, noteStart);
          if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);
          }
        }

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + noteDuration);
      });

      return primaryOsc;
    } catch {
      return null;
    }
  }

  /**
   * Plays Hadal victory fanfare.
   * @returns {OscillatorNode|null}
   */
  playFanfare() {
    this.callLog.push({ type: 'fanfare', freq: 1046.5 });
    if (this.muted || !this._ensureContext()) return null;

    try {
      const now = this.ctx.currentTime || 0;
      const fanfareNotes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      let primaryOsc = null;

      fanfareNotes.forEach((freq, idx) => {
        const noteStart = now + idx * 0.12;
        const isApex = idx === fanfareNotes.length - 1;
        const duration = isApex ? 1.4 : 0.4;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        if (!primaryOsc) primaryOsc = osc;

        osc.type = isApex ? 'sine' : 'triangle';
        if (osc.frequency && typeof osc.frequency.setValueAtTime === 'function') {
          osc.frequency.setValueAtTime(freq, noteStart);
        }

        if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
          gain.gain.setValueAtTime(0.3, noteStart);
          if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
          }
        }

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + duration);
      });

      return primaryOsc;
    } catch {
      return null;
    }
  }

  /**
   * Plays rejection buzzer (sawtooth / dissonant low tone).
   * @returns {OscillatorNode|null}
   */
  playReject() {
    this.callLog.push({ type: 'reject', freq: 140 });
    if (this.muted || !this._ensureContext()) return null;

    try {
      const now = this.ctx.currentTime || 0;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      if (osc.frequency && typeof osc.frequency.setValueAtTime === 'function') {
        osc.frequency.setValueAtTime(140, now);
      }

      if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(0.3, now);
        if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        }
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);

      return osc;
    } catch {
      return null;
    }
  }
}
