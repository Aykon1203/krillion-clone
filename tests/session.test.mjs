import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager, SESSION_STATES } from '../src/js/session.js';
import { QUESTION_CATALOG } from '../src/data/questions.js';

// Mini catalog for deterministic testing
const testCatalog = [
  {
    id: 'q1',
    prompt: 'Question 1',
    category: 'Test Category',
    timeLimitSec: 25,
    tiers: {
      plankton: ['answer1-plankton'],
      one_in_a_krillion: ['answer1-krillion']
    }
  },
  {
    id: 'q2',
    prompt: 'Question 2',
    category: 'Test Category',
    timeLimitSec: 25,
    tiers: {
      rare: ['answer2-rare'],
      one_in_a_krillion: ['answer2-krillion']
    }
  },
  {
    id: 'q3',
    prompt: 'Question 3',
    category: 'Test Category',
    timeLimitSec: 25,
    tiers: {
      schooler: ['answer3-schooler'],
      one_in_a_krillion: ['answer3-krillion']
    }
  },
  {
    id: 'q4',
    prompt: 'Question 4',
    category: 'Test Category',
    timeLimitSec: 25,
    tiers: {
      too_clever: ['answer4-too-clever'],
      one_in_a_krillion: ['answer4-krillion']
    }
  },
  {
    id: 'q5',
    prompt: 'Question 5',
    category: 'Test Category',
    timeLimitSec: 25,
    tiers: {
      deep_cut: ['answer5-deep-cut'],
      one_in_a_krillion: ['answer5-krillion']
    }
  },
  {
    id: 'q6',
    prompt: 'Question 6',
    category: 'Test Category',
    timeLimitSec: 25,
    tiers: {
      one_in_a_krillion: ['answer6-krillion']
    }
  },
  {
    id: 'q7',
    prompt: 'Question 7',
    category: 'Test Category',
    timeLimitSec: 25,
    tiers: {
      one_in_a_krillion: ['answer7-krillion']
    }
  }
];

test('SessionManager: initialization and startSession', () => {
  const session = new SessionManager(testCatalog);
  assert.equal(session.state, SESSION_STATES.IDLE);

  const firstQ = session.startSession();
  assert.ok(firstQ);
  assert.equal(session.state, SESSION_STATES.ACTIVE);
  assert.equal(session.currentIndex, 0);
  assert.equal(session.totalPoints, 0);
  assert.equal(session.totalDepth, 0);
  assert.equal(session.questions.length, 7);
});

test('SessionManager: startSession with real QUESTION_CATALOG selects exactly 7 questions', () => {
  const session = new SessionManager(QUESTION_CATALOG);
  const firstQ = session.startSession();
  assert.ok(firstQ);
  assert.equal(session.questions.length, 7);

  // All 7 questions in this session must have unique IDs
  const ids = session.questions.map(q => q.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, 7);
});

test('SessionManager: invalid submission does NOT lock prompt or advance state', () => {
  const session = new SessionManager(testCatalog);
  session.startSession();
  assert.equal(session.state, SESSION_STATES.ACTIVE);

  const invalidRes = session.submitAnswer('completely bogus answer');
  assert.equal(invalidRes.valid, false);
  assert.equal(invalidRes.points, 0);
  assert.equal(invalidRes.depthMeters, 0);

  // Prompt remains ACTIVE, allowing user to retry
  assert.equal(session.state, SESSION_STATES.ACTIVE);
  assert.equal(session.totalPoints, 0);
  assert.equal(session.totalDepth, 0);
});

test('SessionManager: valid submission locks prompt and transitions to REVEAL', () => {
  const session = new SessionManager(testCatalog);
  session.startSession();

  const currentQ = session.getCurrentQuestion();
  const validAnswer = currentQ.tiers.one_in_a_krillion[0];

  const validRes = session.submitAnswer(validAnswer);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.tier, 'one_in_a_krillion');
  assert.equal(validRes.points, 100);
  assert.equal(validRes.depthMeters, 1000);

  // Prompt is now locked in REVEAL state
  assert.equal(session.state, SESSION_STATES.REVEAL);
  assert.equal(session.totalPoints, 100);
  assert.equal(session.totalDepth, 1000);

  // Subsequent submissions while locked are rejected
  const lockedRes = session.submitAnswer(validAnswer);
  assert.equal(lockedRes.valid, false);
});

test('SessionManager: handleTimeout awards 0 points and transitions to REVEAL', () => {
  const session = new SessionManager(testCatalog);
  session.startSession();

  const timeoutRes = session.handleTimeout();
  assert.equal(timeoutRes.timeout, true);
  assert.equal(timeoutRes.points, 0);
  assert.equal(timeoutRes.depthMeters, 0);

  assert.equal(session.state, SESSION_STATES.REVEAL);
  assert.equal(session.totalPoints, 0);
  assert.equal(session.totalDepth, 0);

  const history = session.history;
  assert.equal(history.length, 1);
  assert.equal(history[0].timeout, true);
  assert.equal(history[0].points, 0);
  assert.equal(history[0].depthMeters, 0);
  assert.ok(history[0].rarestReveal);
});

test('SessionManager: 7-question full session progression to COMPLETED', () => {
  const session = new SessionManager(testCatalog);
  session.startSession();

  for (let i = 0; i < 7; i++) {
    assert.equal(session.currentIndex, i);
    assert.equal(session.state, SESSION_STATES.ACTIVE);

    const q = session.getCurrentQuestion();
    const apexAnswer = q.tiers.one_in_a_krillion[0];

    const evalRes = session.submitAnswer(apexAnswer);
    assert.equal(evalRes.valid, true);
    assert.equal(session.state, SESSION_STATES.REVEAL);

    const next = session.nextQuestion();
    if (i < 6) {
      assert.ok(next);
      assert.equal(session.state, SESSION_STATES.ACTIVE);
    } else {
      // Completed after question 7
      assert.equal(next, null);
      assert.equal(session.state, SESSION_STATES.COMPLETED);
    }
  }

  // Final session check
  assert.equal(session.state, SESSION_STATES.COMPLETED);
  assert.equal(session.totalPoints, 700);
  assert.equal(session.totalDepth, 7000);

  const summary = session.getSummary();
  assert.equal(summary.isCompleted, true);
  assert.equal(summary.totalPoints, 700);
  assert.equal(summary.totalDepth, 7000);
  assert.equal(summary.zone.name, 'De Hadale Trog (Hadalpelagisch)');
  assert.equal(summary.diverTitle, 'Eén op een Krillion Legende');
  assert.equal(summary.rounds.length, 7);

  // Each round has rarest reveal
  for (const round of summary.rounds) {
    assert.ok(round.rarestReveal);
    assert.equal(round.points, 100);
    assert.equal(round.depthMeters, 1000);
  }
});
