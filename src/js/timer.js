/**
 * Krillion Question Timer
 * Manages 25-second active countdowns per prompt using timestamp-delta tracking
 * to eliminate timer drift.
 */

export class QuestionTimer {
  /**
   * @param {object} [options={}]
   * @param {number} [options.durationSec=25] - Duration of countdown in seconds
   * @param {number} [options.intervalMs=1000] - Interval between ticks in milliseconds
   * @param {(remainingSec: number) => void} [options.onTick] - Called on each interval tick
   * @param {() => void} [options.onExpire] - Called when remaining time reaches 0
   */
  constructor({ durationSec = 25, intervalMs = 1000, onTick = null, onExpire = null } = {}) {
    this.durationSec = Math.max(0, durationSec);
    this.intervalMs = intervalMs;
    this.onTick = onTick;
    this.onExpire = onExpire;

    this.remainingSec = this.durationSec;
    this.startTime = null;
    this.endTime = null;
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Starts the countdown timer.
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    this.endTime = this.startTime + (this.remainingSec * 1000);

    this.intervalId = setInterval(() => {
      this._tick();
    }, this.intervalMs);
  }

  /**
   * Internal tick handler.
   * @private
   */
  _tick() {
    const now = Date.now();
    const remainingMs = Math.max(0, this.endTime - now);
    this.remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

    if (typeof this.onTick === 'function') {
      this.onTick(this.remainingSec);
    }

    if (remainingMs <= 0) {
      this.stop();
      if (typeof this.onExpire === 'function') {
        this.onExpire();
      }
    }
  }

  /**
   * Stops the countdown timer and cancels active interval.
   */
  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.isRunning && this.endTime) {
      const remainingMs = Math.max(0, this.endTime - Date.now());
      this.remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    }
    this.isRunning = false;
  }

  /**
   * Resets the timer with optional new duration.
   * @param {number} [durationSec]
   */
  reset(durationSec = this.durationSec) {
    this.stop();
    this.durationSec = Math.max(0, durationSec);
    this.remainingSec = this.durationSec;
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Returns current remaining seconds.
   * @returns {number}
   */
  getRemainingSec() {
    if (this.isRunning && this.endTime) {
      const remainingMs = Math.max(0, this.endTime - Date.now());
      return Math.max(0, Math.ceil(remainingMs / 1000));
    }
    return this.remainingSec;
  }
}
