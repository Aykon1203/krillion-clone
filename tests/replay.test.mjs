import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager, SESSION_STATES } from '../src/js/session.js';
import { StorageAdapter, MemoryStorage } from '../src/js/storage.js';
import { QUESTION_CATALOG } from '../src/data/questions.js';

test('SessionManager: resetSession resets state and picks fresh questions', () => {
  const session = new SessionManager(QUESTION_CATALOG);
  session.startSession();

  // Complete one question
  const currentQ = session.getCurrentQuestion();
  const validAns = currentQ.tiers.plankton[0];
  session.submitAnswer(validAns);
  assert.equal(session.state, SESSION_STATES.REVEAL);
  assert.equal(session.totalPoints > 0, true);
  assert.equal(session.totalDepth > 0, true);

  // Call resetSession
  const newQ = session.resetSession();
  assert.ok(newQ);
  assert.equal(session.state, SESSION_STATES.ACTIVE);
  assert.equal(session.currentIndex, 0);
  assert.equal(session.totalPoints, 0);
  assert.equal(session.totalDepth, 0);
  assert.equal(session.history.length, 0);
  assert.equal(session.questions.length, 7);
});

test('SessionManager: LRU shuffle bag deduplication across multiple consecutive sessions', () => {
  // QUESTION_CATALOG has 42 questions.
  // 4 sessions = 4 * 7 = 28 questions.
  // All 28 selected questions across the 4 sessions must be unique!
  const memoryStore = new MemoryStorage();
  const storage = new StorageAdapter(memoryStore);
  const session = new SessionManager(QUESTION_CATALOG, { storage });

  const seenIds = new Set();
  const sessionCount = 4;

  for (let s = 0; s < sessionCount; s++) {
    session.startSession('endless');
    const questions = session.questions;
    assert.equal(questions.length, 7);

    for (const q of questions) {
      assert.equal(seenIds.has(q.id), false, `Question "${q.id}" repeated within 4 consecutive sessions!`);
      seenIds.add(q.id);
    }
  }

  assert.equal(seenIds.size, 28, 'Expected exactly 28 unique questions across 4 sessions');
});

test('StorageAdapter: tracks total dives, best depth, and cumulative points across sessions', () => {
  const memoryStore = new MemoryStorage();
  const storage = new StorageAdapter(memoryStore);

  const initialStats = storage.getStats();
  assert.equal(initialStats.totalDives, 0);
  assert.equal(initialStats.bestDepth, 0);
  assert.equal(initialStats.totalPoints, 0);

  // Session 1: 3500m depth, 350 points
  storage.saveSessionRecord({
    totalDepth: 3500,
    totalPoints: 350,
    diverTitle: 'Bathysphere Navigator'
  });

  const stats1 = storage.getStats();
  assert.equal(stats1.totalDives, 1);
  assert.equal(stats1.bestDepth, 3500);
  assert.equal(stats1.totalPoints, 350);

  // Session 2: lower depth 2000m, 200 points -> best depth stays 3500m
  storage.saveSessionRecord({
    totalDepth: 2000,
    totalPoints: 200,
    diverTitle: 'Submarine Scout'
  });

  const stats2 = storage.getStats();
  assert.equal(stats2.totalDives, 2);
  assert.equal(stats2.bestDepth, 3500);
  assert.equal(stats2.totalPoints, 550);

  // Session 3: higher depth 6500m -> best depth updates to 6500m
  storage.saveSessionRecord({
    totalDepth: 6500,
    totalPoints: 650,
    diverTitle: 'One in a Krillion Legend'
  });

  const stats3 = storage.getStats();
  assert.equal(stats3.totalDives, 3);
  assert.equal(stats3.bestDepth, 6500);
  assert.equal(stats3.totalPoints, 1200);
  assert.equal(stats3.history.length, 3);
});

test('StorageAdapter: settings persistence', () => {
  const memoryStore = new MemoryStorage();
  const storage = new StorageAdapter(memoryStore);

  const defaultSettings = storage.getSettings();
  assert.equal(defaultSettings.soundEnabled, true);

  storage.saveSettings({ soundEnabled: false, highContrast: true });
  const updatedSettings = storage.getSettings();
  assert.equal(updatedSettings.soundEnabled, false);
  assert.equal(updatedSettings.highContrast, true);
});

test('StorageAdapter: fallback when localStorage throws or is unavailable', () => {
  // Faulty storage backend throwing error
  const faultyStorage = {
    getItem() { throw new Error('QuotaExceeded'); },
    setItem() { throw new Error('QuotaExceeded'); },
    removeItem() {}
  };

  const adapter = new StorageAdapter(faultyStorage);
  // Should not throw, returns default
  const stats = adapter.getStats();
  assert.equal(stats.totalDives, 0);

  const settings = adapter.getSettings();
  assert.equal(settings.soundEnabled, true);

  const updated = adapter.saveSessionRecord({ totalDepth: 500 });
  assert.equal(updated.totalDives, 1);
});
