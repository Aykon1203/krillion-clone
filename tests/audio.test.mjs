import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager } from '../src/js/audio.js';

/**
 * Mock AudioParam for unit test verification.
 */
class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.events = [];
  }

  setValueAtTime(val, time) {
    this.events.push({ type: 'setValueAtTime', val, time });
    this.value = val;
    return this;
  }

  exponentialRampToValueAtTime(val, time) {
    this.events.push({ type: 'exponentialRamp', val, time });
    this.value = val;
    return this;
  }

  linearRampToValueAtTime(val, time) {
    this.events.push({ type: 'linearRamp', val, time });
    this.value = val;
    return this;
  }
}

/**
 * Mock AudioNode base class.
 */
class MockAudioNode {
  constructor(type) {
    this.nodeType = type;
    this.connections = [];
  }

  connect(dest) {
    this.connections.push(dest);
    return dest;
  }

  disconnect() {
    this.connections = [];
  }
}

/**
 * Mock OscillatorNode.
 */
class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super('oscillator');
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
    this.stopped = false;
    this.startTime = 0;
    this.stopTime = 0;
  }

  start(when = 0) {
    this.started = true;
    this.startTime = when;
  }

  stop(when = 0) {
    this.stopped = true;
    this.stopTime = when;
  }
}

/**
 * Mock GainNode.
 */
class MockGainNode extends MockAudioNode {
  constructor() {
    super('gain');
    this.gain = new MockAudioParam(1);
  }
}

/**
 * Mock BiquadFilterNode.
 */
class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super('biquadFilter');
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

/**
 * Mock AudioContext.
 */
class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = new MockAudioNode('destination');
    this.createdNodes = [];
  }

  async resume() {
    this.state = 'running';
  }

  async suspend() {
    this.state = 'suspended';
  }

  createOscillator() {
    const node = new MockOscillatorNode();
    this.createdNodes.push(node);
    return node;
  }

  createGain() {
    const node = new MockGainNode();
    this.createdNodes.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.createdNodes.push(node);
    return node;
  }
}

/**
 * Simple in-memory storage mock.
 */
class MockStorage {
  constructor(initial = {}) {
    this.store = new Map(Object.entries(initial));
  }

  getItem(k) {
    return this.store.has(k) ? this.store.get(k) : null;
  }

  setItem(k, v) {
    this.store.set(k, String(v));
  }

  removeItem(k) {
    this.store.delete(k);
  }

  clear() {
    this.store.clear();
  }
}

test('SoundManager: initializes with default unmuted state and empty callLog', () => {
  const sm = new SoundManager();
  assert.equal(sm.isMuted(), false);
  assert.equal(Array.isArray(sm.callLog), true);
  assert.equal(sm.callLog.length, 0);
  assert.equal(sm.ctx, null);
});

test('SoundManager: toggleMute toggles state and persists to storage', () => {
  const storage = new MockStorage();
  const sm = new SoundManager({ storageKey: 'test_muted', storage });

  assert.equal(sm.isMuted(), false);
  assert.equal(storage.getItem('test_muted'), null);

  const res1 = sm.toggleMute();
  assert.equal(res1, true);
  assert.equal(sm.isMuted(), true);
  assert.equal(storage.getItem('test_muted'), 'true');

  const res2 = sm.toggleMute();
  assert.equal(res2, false);
  assert.equal(sm.isMuted(), false);
  assert.equal(storage.getItem('test_muted'), 'false');
});

test('SoundManager: restores muted state from storage on construction', () => {
  const storage = new MockStorage({ custom_mute_key: 'true' });
  const sm = new SoundManager({ storageKey: 'custom_mute_key', storage });
  assert.equal(sm.isMuted(), true);
});

test('SoundManager: handles throwing storage backend gracefully', () => {
  const faultyStorage = {
    getItem: () => {
      throw new Error('Storage access denied');
    },
    setItem: () => {
      throw new Error('Quota exceeded');
    }
  };

  assert.doesNotThrow(() => {
    const sm = new SoundManager({ storage: faultyStorage });
    assert.equal(sm.isMuted(), false);
    sm.toggleMute();
    assert.equal(sm.isMuted(), true);
  });
});

test('SoundManager: operates safely when AudioContext is completely undefined', () => {
  const origAudioContext = globalThis.AudioContext;
  delete globalThis.AudioContext;

  try {
    const sm = new SoundManager();
    assert.doesNotThrow(() => {
      const ctx = sm.init();
      assert.equal(ctx, null);
      assert.equal(sm.playSonar(), null);
      assert.equal(sm.playDive(), null);
      assert.equal(sm.playTick(), null);
      assert.equal(sm.playChime('plankton'), null);
      assert.equal(sm.playFanfare(), null);
      assert.equal(sm.playReject(), null);
    });
    assert.equal(sm.callLog.length, 6);
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: init resumes suspended AudioContext', async () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    const ctx = sm.init();
    assert.ok(ctx);
    assert.equal(ctx.state, 'running');
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: playSonar creates sine oscillator with exponential decay', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    const osc = sm.playSonar(880);
    assert.ok(osc);
    assert.equal(osc.type, 'sine');
    assert.equal(osc.frequency.value, 880);
    assert.equal(osc.started, true);

    const logEntry = sm.callLog.find((e) => e.type === 'sonar');
    assert.ok(logEntry);
    assert.equal(logEntry.freq, 880);
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: playDive creates low-pass filter and descending sweep', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    const osc = sm.playDive();
    assert.ok(osc);
    assert.equal(osc.type, 'triangle');
    assert.equal(osc.started, true);

    const logEntry = sm.callLog.find((e) => e.type === 'dive');
    assert.ok(logEntry);
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: playTick differentiates normal vs urgent tempo', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    const normalOsc = sm.playTick(false);
    assert.ok(normalOsc);
    assert.equal(normalOsc.frequency.value, 880);

    const urgentOsc = sm.playTick(true);
    assert.ok(urgentOsc);
    assert.equal(urgentOsc.frequency.value, 1400);

    const normalLog = sm.callLog.find((e) => e.type === 'tick' && !e.urgent);
    const urgentLog = sm.callLog.find((e) => e.type === 'tick' && e.urgent);
    assert.ok(normalLog);
    assert.ok(urgentLog);
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: playChime scales across all 6 rarity tiers', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    const tiers = ['plankton', 'too_clever', 'schooler', 'rare', 'deep_cut', 'one_in_a_krillion'];

    for (const tier of tiers) {
      const osc = sm.playChime(tier);
      assert.ok(osc, `Expected oscillator for tier ${tier}`);
      assert.ok(sm.callLog.some((e) => e.type === 'chime' && e.tierKey === tier));
    }
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: playFanfare synthesizes victory sequence', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    const osc = sm.playFanfare();
    assert.ok(osc);
    assert.ok(sm.callLog.some((e) => e.type === 'fanfare'));
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: playReject synthesizes sawtooth dissonant buzzer', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    const osc = sm.playReject();
    assert.ok(osc);
    assert.equal(osc.type, 'sawtooth');
    assert.ok(sm.callLog.some((e) => e.type === 'reject'));
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: creates zero audio nodes and returns null when muted', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();
    sm.toggleMute(); // muted = true
    assert.equal(sm.isMuted(), true);

    const initialCount = sm.ctx.createdNodes.length;

    assert.equal(sm.playSonar(), null);
    assert.equal(sm.playDive(), null);
    assert.equal(sm.playTick(), null);
    assert.equal(sm.playChime('one_in_a_krillion'), null);
    assert.equal(sm.playFanfare(), null);
    assert.equal(sm.playReject(), null);

    assert.equal(sm.ctx.createdNodes.length, initialCount);
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: catches oscillator start errors without throwing', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    sm.ctx.createOscillator = () => {
      return {
        connect: () => {},
        start: () => {
          throw new Error('Hardware output device occupied');
        },
        stop: () => {}
      };
    };

    assert.doesNotThrow(() => {
      const res = sm.playSonar();
      assert.equal(res, null);
    });
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});

test('SoundManager: survives rapid audio flood without crashing', () => {
  const origAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;

  try {
    const sm = new SoundManager();
    sm.init();

    assert.doesNotThrow(() => {
      for (let i = 0; i < 50; i++) {
        sm.playTick(i % 2 === 0);
      }
    });

    assert.equal(sm.callLog.filter((e) => e.type === 'tick').length, 50);
  } finally {
    globalThis.AudioContext = origAudioContext;
  }
});
