import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionTimer } from '../src/js/timer.js';

test('QuestionTimer: default initialization and getRemainingSec', () => {
  const timer = new QuestionTimer({ durationSec: 25 });
  assert.equal(timer.getRemainingSec(), 25);
  assert.equal(timer.isRunning, false);
});

test('QuestionTimer: countdown ticks and expiration using mock timers', (t) => {
  t.mock.timers.enable();

  const ticks = [];
  let expired = false;

  const timer = new QuestionTimer({
    durationSec: 5,
    intervalMs: 1000,
    onTick: (sec) => ticks.push(sec),
    onExpire: () => {
      expired = true;
    }
  });

  timer.start();
  assert.equal(timer.isRunning, true);

  // Advance 1s -> 4s remaining
  t.mock.timers.tick(1000);
  assert.deepEqual(ticks, [4]);
  assert.equal(timer.getRemainingSec(), 4);
  assert.equal(expired, false);

  // Advance 1s -> 3s remaining
  t.mock.timers.tick(1000);
  assert.deepEqual(ticks, [4, 3]);
  assert.equal(timer.getRemainingSec(), 3);
  assert.equal(expired, false);

  // Advance 1s -> 2s remaining
  t.mock.timers.tick(1000);
  assert.deepEqual(ticks, [4, 3, 2]);
  assert.equal(timer.getRemainingSec(), 2);
  assert.equal(expired, false);

  // Advance 2s more -> reaches 0 and expires
  t.mock.timers.tick(1000);
  t.mock.timers.tick(1000);
  assert.deepEqual(ticks, [4, 3, 2, 1, 0]);
  assert.equal(timer.getRemainingSec(), 0);
  assert.equal(expired, true);
  assert.equal(timer.isRunning, false);

  t.mock.timers.reset();
});

test('QuestionTimer: 25-second full countdown', (t) => {
  t.mock.timers.enable();

  let expired = false;
  let finalRemaining = null;

  const timer = new QuestionTimer({
    durationSec: 25,
    intervalMs: 1000,
    onExpire: () => {
      expired = true;
      finalRemaining = timer.getRemainingSec();
    }
  });

  timer.start();
  t.mock.timers.tick(25000);

  assert.equal(expired, true);
  assert.equal(finalRemaining, 0);
  assert.equal(timer.isRunning, false);

  t.mock.timers.reset();
});

test('QuestionTimer: early stop stops ticking and cancels callbacks', (t) => {
  t.mock.timers.enable();

  const ticks = [];
  let expired = false;

  const timer = new QuestionTimer({
    durationSec: 10,
    intervalMs: 1000,
    onTick: (sec) => ticks.push(sec),
    onExpire: () => {
      expired = true;
    }
  });

  timer.start();
  t.mock.timers.tick(1000);
  t.mock.timers.tick(1000);
  t.mock.timers.tick(1000);
  assert.deepEqual(ticks, [9, 8, 7]);
  assert.equal(timer.getRemainingSec(), 7);

  // Stop early
  timer.stop();
  assert.equal(timer.isRunning, false);
  assert.equal(timer.getRemainingSec(), 7);

  // Advancing time should not trigger further ticks or expire
  t.mock.timers.tick(5000);
  assert.deepEqual(ticks, [9, 8, 7]);
  assert.equal(expired, false);

  t.mock.timers.reset();
});

test('QuestionTimer: reset restarts duration', (t) => {
  t.mock.timers.enable();

  const timer = new QuestionTimer({ durationSec: 25 });
  timer.start();
  t.mock.timers.tick(5000);
  assert.equal(timer.getRemainingSec(), 20);

  timer.reset(15);
  assert.equal(timer.isRunning, false);
  assert.equal(timer.getRemainingSec(), 15);

  t.mock.timers.reset();
});

test('QuestionTimer: clamps negative durationSec to 0', () => {
  const timer = new QuestionTimer({ durationSec: -10 });
  assert.equal(timer.getRemainingSec(), 0);
  assert.equal(timer.durationSec, 0);

  timer.reset(-5);
  assert.equal(timer.getRemainingSec(), 0);
  assert.equal(timer.durationSec, 0);
});
