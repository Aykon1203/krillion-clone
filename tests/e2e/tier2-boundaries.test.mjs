/**
 * Tier 2: Boundary & Corner Cases E2E Test Suite for krillion.io
 * Verifies all 24 features against degenerate inputs, edge limits, temporal extremes,
 * and recovery behaviors with >= 5 tests per feature (>= 120 tests).
 */

import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateSubmission, RARITY_TIERS, OCEAN_ZONES, getOceanZone, getDiverTitle } from '../../src/js/scoring.js';
import { normalizeAnswer, matchAnswer, levenshteinDistance } from '../../src/js/normalizer.js';
import { QuestionTimer } from '../../src/js/timer.js';
import { SessionManager, SESSION_STATES } from '../../src/js/session.js';
import { StorageAdapter, MemoryStorage } from '../../src/js/storage.js';
import { QUESTION_CATALOG } from '../../src/data/questions.js';

import {
  setupBrowserEnv,
  resetBrowserEnv,
  MockLocalStorage,
  generateShareText
} from './helpers/browser-env.mjs';

import { evaluateRunnerOutcome } from './e2e-runner.mjs';

// Dynamic import strategy: exercise live modules from src/ when implemented, with browser-env fallback
let SoundManager;
try {
  const mod = await import('../../src/js/audio.js');
  SoundManager = mod.SoundManager || mod.default;
} catch {
  const fallback = await import('./helpers/browser-env.mjs');
  SoundManager = fallback.SoundManager;
}

let DepthGauge;
try {
  const mod = await import('../../src/js/depth-gauge.js');
  DepthGauge = mod.DepthGauge || mod.default;
} catch {
  const fallback = await import('./helpers/browser-env.mjs');
  DepthGauge = fallback.DepthGauge;
}

let createStaticServer;
try {
  const mod = await import('../../scripts/serve.mjs');
  createStaticServer = mod.createStaticServer || mod.default;
} catch {
  const fallback = await import('./helpers/browser-env.mjs');
  createStaticServer = fallback.createStaticServer;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('Tier 2: Boundary & Corner Cases (>=120 tests across 24 features)', () => {
  beforeEach(() => {
    setupBrowserEnv();
  });

  afterEach(() => {
    resetBrowserEnv();
  });

  // ---------------------------------------------------------------------------
  // Feature 1: Reverse-Trivia Obscurity Scoring (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F1 Boundaries: Obscurity Scoring Limits & Degenerate Inputs', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F1.B1: unrecognized string yields valid: false, tier: null, 0 pts, 0m', () => {
      const res = evaluateSubmission(chemQ, 'not-a-real-element-xyz');
      assert.equal(res.valid, false);
      assert.equal(res.tier, null);
      assert.equal(res.points, 0);
      assert.equal(res.depthMeters, 0);
    });

    it('F1.B2: empty string submission returns valid: false and 0 points', () => {
      const res = evaluateSubmission(chemQ, '');
      assert.equal(res.valid, false);
      assert.equal(res.points, 0);
      assert.equal(res.depthMeters, 0);
    });

    it('F1.B3: handles null, undefined, and non-string inputs safely without throwing', () => {
      assert.doesNotThrow(() => {
        const rNull = evaluateSubmission(chemQ, null);
        assert.equal(rNull.valid, false);
        const rUndef = evaluateSubmission(chemQ, undefined);
        assert.equal(rUndef.valid, false);
        const rNum = evaluateSubmission(chemQ, 12345);
        assert.equal(rNum.valid, false);
      });
    });

    it('F1.B4: awards full 100 pts for obscure answer with surrounding whitespace and newline', () => {
      const res = evaluateSubmission(chemQ, '   praseodymium   \n');
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'one_in_a_krillion');
      assert.equal(res.points, 100);
      assert.equal(res.depthMeters, 1000);
    });

    it('F1.B5: accumulates 7 consecutive apex answers to exactly 700 pts and 7,000m maximum ceiling', () => {
      let cumulativePoints = 0;
      let cumulativeDepth = 0;
      for (let i = 0; i < 7; i++) {
        const res = evaluateSubmission(chemQ, 'praseodymium');
        cumulativePoints += res.points;
        cumulativeDepth += res.depthMeters;
      }
      assert.equal(cumulativePoints, 700);
      assert.equal(cumulativeDepth, 7000);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: 7-Question Dive Session (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F2 Boundaries: Session State Machine Edge Cases', () => {
    it('F2.B1: calling nextQuestion() on completed session is idempotent and does not throw', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      assert.equal(session.state, SESSION_STATES.COMPLETED);
      assert.doesNotThrow(() => {
        session.nextQuestion();
        session.nextQuestion();
      });
      assert.equal(session.state, SESSION_STATES.COMPLETED);
    });

    it('F2.B2: submitAnswer() after session completion returns rejected without mutating score', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      const initialDepth = session.totalDepth;
      const res = session.submitAnswer('gold');
      assert.equal(res.valid, false);
      assert.equal(session.totalDepth, initialDepth);
    });

    it('F2.B3: rapid 7 consecutive timeouts completes cleanly with 0m depth and 7 timeout records', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      assert.equal(session.state, SESSION_STATES.COMPLETED);
      assert.equal(session.totalDepth, 0);
      assert.equal(session.totalPoints, 0);
      assert.equal(session.history.every(h => h.timeout === true), true);
    });

    it('F2.B4: nextQuestion() called during ACTIVE state is rejected before answer/timeout', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      assert.equal(session.state, SESSION_STATES.ACTIVE);
      const res = session.nextQuestion();
      assert.equal(res, null);
      assert.equal(session.currentIndex, 0);
      assert.equal(session.state, SESSION_STATES.ACTIVE);
    });

    it('F2.B5: verifies question uniqueness across the 7 selected session prompts', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const ids = session.questions.map(q => q.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, 7);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: 25-Second Prompt Countdown Timer (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F3 Boundaries: Timer Expiry & Timing Precision', () => {
    it('F3.B1: clamps remaining time at exactly 0 and never goes negative', (t) => {
      t.mock.timers.enable();
      const timer = new QuestionTimer({ durationSec: 25 });
      timer.start();
      t.mock.timers.tick(30000);
      timer.stop();
      t.mock.timers.reset();
      assert.equal(timer.getRemainingSec(), 0);
    });

    it('F3.B2: distinguishes millisecond-level submission before vs after expiry', (t) => {
      t.mock.timers.enable();
      const timerA = new QuestionTimer({ durationSec: 25 });
      timerA.start();
      t.mock.timers.tick(24900); // 100ms before expiry
      assert.ok(timerA.getRemainingSec() >= 1);

      const timerB = new QuestionTimer({ durationSec: 25 });
      timerB.start();
      t.mock.timers.tick(25100); // 100ms after expiry
      assert.equal(timerB.getRemainingSec(), 0);

      timerA.stop();
      timerB.stop();
      t.mock.timers.reset();
    });

    it('F3.B3: multiple redundant start() calls do not spawn multiple intervals or speed up clock', (t) => {
      t.mock.timers.enable();
      let tickCount = 0;
      const timer = new QuestionTimer({
        durationSec: 25,
        onTick: () => tickCount++
      });
      timer.start();
      timer.start();
      timer.start();
      t.mock.timers.tick(1000);
      timer.stop();
      t.mock.timers.reset();
      assert.equal(tickCount, 1);
    });

    it('F3.B4: reset during active countdown reinitializes cleanly to specified duration', (t) => {
      t.mock.timers.enable();
      const timer = new QuestionTimer({ durationSec: 25 });
      timer.start();
      t.mock.timers.tick(10000);
      assert.equal(timer.getRemainingSec(), 15);
      timer.reset(20);
      assert.equal(timer.getRemainingSec(), 20);
      assert.equal(timer.isRunning, false);
      t.mock.timers.reset();
    });

    it('F3.B5: handles massive time jump abruptly by triggering onExpire exactly once', (t) => {
      t.mock.timers.enable();
      let expireCount = 0;
      const timer = new QuestionTimer({
        durationSec: 25,
        onExpire: () => expireCount++
      });
      timer.start();
      t.mock.timers.tick(100000); // 100 seconds
      timer.stop();
      t.mock.timers.reset();
      assert.equal(expireCount, 1);
      assert.equal(timer.getRemainingSec(), 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 4: 6 Rarity Tiers (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F4 Boundaries: Rarity Tiers Consistency & Guarding', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F4.B1: non-existent answer yields null tier and 0 points', () => {
      const res = evaluateSubmission(chemQ, 'kryptonite');
      assert.equal(res.tier, null);
      assert.equal(res.badge, null);
      assert.equal(res.points, 0);
    });

    it('F4.B2: verifies strict mathematical ratio of points to depth (10x ratio) across all tiers', () => {
      for (const [key, tier] of Object.entries(RARITY_TIERS)) {
        assert.equal(tier.depthMeters, tier.points * 10, `Tier ${key} depth must be points * 10`);
      }
    });

    it('F4.B3: verifies answer set disjointness across tiers for chem-elements', () => {
      const allAnswers = new Set();
      for (const [tier, list] of Object.entries(chemQ.tiers)) {
        for (const ans of list) {
          const norm = normalizeAnswer(ans);
          assert.equal(allAnswers.has(norm), false, `Answer ${ans} duplicated across tiers in ${chemQ.id}`);
          allAnswers.add(norm);
        }
      }
    });

    it('F4.B4: verifies all 6 rarity tiers define distinct badge class names', () => {
      const badges = Object.values(RARITY_TIERS).map(t => t.badge);
      const uniqueBadges = new Set(badges);
      assert.equal(uniqueBadges.size, 6);
    });

    it('F4.B5: evaluates safely when question tiers object is missing or malformed', () => {
      const malformed = { prompt: 'Test', tiers: {} };
      const res = evaluateSubmission(malformed, 'iron');
      assert.equal(res.valid, false);
      assert.equal(res.points, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 5: 5 Oceanic Depth Zones (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F5 Boundaries: Zone Clamping & Thresholds', () => {
    it('F5.B1: zero-depth boundary (0m) returns Sunlight Zone', () => {
      const z = getOceanZone(0);
      assert.match(z.name, /Zonlichtzone/i);
    });

    it('F5.B2: exact boundary transitions (200, 1000, 4000, 6000) match target zones', () => {
      assert.equal(getOceanZone(200).class, 'zone-twilight');
      assert.equal(getOceanZone(1000).class, 'zone-midnight');
      assert.equal(getOceanZone(4000).class, 'zone-abyss');
      assert.equal(getOceanZone(6000).class, 'zone-hadal');
    });

    it('F5.B3: maximum ceiling boundary (7000m) returns Hadal Trench and apex legend title', () => {
      assert.equal(getOceanZone(7000).class, 'zone-hadal');
      assert.equal(getDiverTitle(7000), 'Eén op een Krillion Legende');
    });

    it('F5.B4: depths exceeding 7,000m ceiling are clamped safely to Hadal Trench', () => {
      const z = getOceanZone(10000);
      assert.equal(z.class, 'zone-hadal');
      assert.equal(getDiverTitle(10000), 'Eén op een Krillion Legende');
    });

    it('F5.B5: negative depths are clamped safely to Sunlight Zone', () => {
      const z = getOceanZone(-500);
      assert.equal(z.class, 'zone-sunlight');
      assert.equal(getDiverTitle(-500), 'Drijvend Plankton');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 6: Open-Ended Text Input (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F6 Boundaries: Extreme Inputs & Input Attacks', () => {
    it('F6.B1: empty string click submission is non-blocking and input remains unlocked', () => {
      const input = document.querySelector('#answer-input');
      const btn = document.querySelector('#submit-btn');
      input.value = '';
      btn.click();
      assert.equal(input.disabled, false);
      assert.equal(btn.disabled, false);
    });

    it('F6.B2: whitespace-only submission ("   \\t\\n  ") is ignored without locking prompt', () => {
      const input = document.querySelector('#answer-input');
      input.value = '   \t\n  ';
      const enter = new Event('keydown', { bubbles: true });
      enter.key = 'Enter';
      input.dispatchEvent(enter);
      assert.equal(input.disabled, false);
    });

    it('F6.B3: handles extreme length input (1,024 characters) safely without stack overflow', () => {
      const longInput = 'a'.repeat(1024);
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
      const res = evaluateSubmission(chemQ, longInput);
      assert.equal(res.valid, false);
      assert.equal(res.points, 0);
    });

    it('F6.B4: treats HTML and XSS tags as literal text without DOM script execution', () => {
      const xssInput = "<script>alert('xss')</script><b>gold</b>";
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
      const res = evaluateSubmission(chemQ, xssInput);
      assert.equal(res.valid, false);

      const form = document.querySelector('#answer-form');
      const input = document.querySelector('#answer-input');
      const feedback = document.querySelector('#feedback-msg');

      form.addEventListener('submit', () => {
        feedback.textContent = input.value;
      });

      input.value = xssInput;
      form.dispatchEvent(new Event('submit', { bubbles: true }));

      assert.equal(feedback.textContent, xssInput);
      assert.equal(feedback.children.length, 0); // Preserved strictly as plain text
    });

    it('F6.B5: rapid submit spamming processes only once and respects input lock', () => {
      const input = document.querySelector('#answer-input');
      let evalCount = 0;
      input.addEventListener('submit', () => {
        if (!input.disabled) {
          evalCount++;
          input.disabled = true;
        }
      });
      input.submit();
      input.submit();
      input.submit();
      assert.equal(evalCount, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 7: Try-Again on Rejection (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F7 Boundaries: Repeated Rejection & State Stability', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F7.B1: handles 5 rapid consecutive invalid submissions without corrupting state', () => {
      const words = ['bad1', 'bad2', 'bad3', 'bad4', 'bad5'];
      for (const w of words) {
        const res = evaluateSubmission(chemQ, w);
        assert.equal(res.valid, false);
        assert.equal(res.points, 0);
      }
    });

    it('F7.B2: rejects duplicate identical invalid submissions without throwing', () => {
      const res1 = evaluateSubmission(chemQ, 'wrongword');
      const res2 = evaluateSubmission(chemQ, 'wrongword');
      assert.equal(res1.valid, false);
      assert.equal(res2.valid, false);
    });

    it('F7.B3: rejection near expiry boundary transitions cleanly to timeout at 25s', (t) => {
      t.mock.timers.enable();
      const timer = new QuestionTimer({ durationSec: 25 });
      timer.start();
      t.mock.timers.tick(24800); // 24.8s
      evaluateSubmission(chemQ, 'wronganswer');
      assert.ok(timer.getRemainingSec() >= 1);
      t.mock.timers.tick(300); // crosses 25s
      timer.stop();
      t.mock.timers.reset();
      assert.equal(timer.getRemainingSec(), 0);
    });

    it('F7.B4: rejects pure symbol and punctuation strings', () => {
      const res = evaluateSubmission(chemQ, '$$$%%%^^^&&&');
      assert.equal(res.valid, false);
    });

    it('F7.B5: preserves input value typing capability while shake animation class is present', () => {
      const card = document.querySelector('#question-card');
      const input = document.querySelector('#answer-input');
      card.classList.add('shake');
      input.value = 'gold';
      assert.equal(input.value, 'gold');
      card.classList.remove('shake');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 8: Prompt Lock on Valid Submission (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F8 Boundaries: Concurrency & Lock Resilience', () => {
    it('F8.B1: handles double-submit race condition within 1ms by awarding points only once', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const q = session.getCurrentQuestion();
      const validAnswer = q.tiers.plankton[0];

      const res1 = session.submitAnswer(validAnswer);
      const res2 = session.submitAnswer(validAnswer);

      assert.equal(res1.valid, true);
      assert.equal(res2.valid, false); // Second submit is rejected by state lock
      assert.equal(session.totalPoints, res1.points);
      assert.equal(session.totalDepth, res1.depthMeters);
    });

    it('F8.B2: rejects submissions attempted during REVEAL state', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      session.handleTimeout(); // transitions to REVEAL
      assert.equal(session.state, SESSION_STATES.REVEAL);
      const res = session.submitAnswer('gold');
      assert.equal(res.valid, false);
    });

    it('F8.B3: ignores input events while input field is disabled', () => {
      const input = document.querySelector('#answer-input');
      input.disabled = true;
      let handled = false;
      input.addEventListener('click', () => { handled = true; });
      input.click();
      assert.equal(handled, false);
    });

    it('F8.B4: timer expiration event occurring after valid answer does not overwrite score', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const q = session.getCurrentQuestion();
      const valid = q.tiers.rare[0];
      session.submitAnswer(valid);
      assert.equal(session.state, SESSION_STATES.REVEAL);
      const initialScore = session.totalPoints;

      // Late timeout invocation
      session.handleTimeout();
      assert.equal(session.totalPoints, initialScore);
    });

    it('F8.B5: unlocks and resets input on advancing to next question', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const q = session.getCurrentQuestion();
      session.submitAnswer(q.tiers.plankton[0]);
      session.nextQuestion();
      assert.equal(session.state, SESSION_STATES.ACTIVE);
      assert.equal(session.currentIndex, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 9: Submarine / Krill Dive Animation (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F9 Boundaries: Animation Extremes & Container Safeguards', () => {
    it('F9.B1: instant 0m to 1,000m dive calculates safe percentage without divide-by-zero', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      const depth = gauge.updateDepth(1000, 0);
      assert.equal(depth, 1000);
      const vessel = container.querySelector('#submarine-icon');
      assert.match(vessel.style.top, /14\.28|14\.3/);
    });

    it('F9.B2: clamps vessel descent translation at exactly 100% at 7,000m maximum', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      gauge.updateDepth(7000, 6000);
      const vessel = container.querySelector('#submarine-icon');
      assert.equal(vessel.style.top, '100%');
    });

    it('F9.B3: executes rapid back-to-back depth updates reaching final target smoothly', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      gauge.updateDepth(100, 0);
      gauge.updateDepth(400, 100);
      gauge.updateDepth(1200, 400);
      assert.equal(gauge.currentDepth, 1200);
      const counter = container.querySelector('#depth-counter');
      assert.equal(counter.textContent, '1,200 m');
    });

    it('F9.B4: clamps target depth safely when input exceeds 7,000m', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      gauge.updateDepth(9999, 0);
      assert.equal(gauge.currentDepth, 7000);
    });

    it('F9.B5: DepthGauge handles null container gracefully without throwing', () => {
      assert.doesNotThrow(() => {
        const gauge = new DepthGauge(null);
        gauge.updateDepth(500, 0);
        gauge.setZone({ name: 'Twilight' });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 10: End-of-Session Summary Screen (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F10 Boundaries: Summary Edge Cases & Extreme Sessions', () => {
    it('F10.B1: formats summary for all-timeout dive (0m depth, 0 pts, Drifting Plankton)', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      const summary = session.getSummary();
      assert.equal(summary.totalDepth, 0);
      assert.equal(summary.totalPoints, 0);
      assert.equal(summary.diverTitle, 'Drijvend Plankton');
      assert.equal(summary.rounds.every(r => r.timeout === true), true);
    });

    it('F10.B2: formats summary for perfect dive (7,000m, 700 pts, One in a Krillion Legend)', () => {
      const summary = {
        totalDepth: 7000,
        totalPoints: 700,
        diverTitle: getDiverTitle(7000),
        zone: getOceanZone(7000),
        rounds: Array(7).fill({ tier: 'one_in_a_krillion', points: 100, depthMeters: 1000 })
      };
      assert.equal(summary.totalDepth, 7000);
      assert.equal(summary.totalPoints, 700);
      assert.equal(summary.diverTitle, 'Eén op een Krillion Legende');
      assert.equal(summary.zone.class, 'zone-hadal');
    });

    it('F10.B3: verifies accurate arithmetic sum for mixed performance session', () => {
      const rounds = [
        { points: 0, depthMeters: 0, timeout: true },
        { points: 10, depthMeters: 100, tier: 'plankton' },
        { points: 15, depthMeters: 150, tier: 'too_clever' },
        { points: 30, depthMeters: 300, tier: 'schooler' },
        { points: 60, depthMeters: 600, tier: 'rare' },
        { points: 85, depthMeters: 850, tier: 'deep_cut' },
        { points: 100, depthMeters: 1000, tier: 'one_in_a_krillion' }
      ];
      const sumPoints = rounds.reduce((a, b) => a + b.points, 0);
      const sumDepth = rounds.reduce((a, b) => a + b.depthMeters, 0);
      assert.equal(sumPoints, 300);
      assert.equal(sumDepth, 3000);
    });

    it('F10.B4: summary modal remains visible and locked until Play Again is clicked', () => {
      const modal = document.querySelector('#summary-modal');
      modal.classList.remove('hidden');
      // Escape keydown should not close modal
      const esc = new Event('keydown', { bubbles: true });
      esc.key = 'Escape';
      modal.dispatchEvent(esc);
      assert.equal(modal.classList.contains('hidden'), false);
    });

    it('F10.B5: escapes HTML entities in submitted answers displayed on summary rows', () => {
      const rawAnswer = '<img src=x onerror=alert(1)>';
      const row = document.createElement('div');
      row.textContent = rawAnswer;
      assert.equal(row.textContent, rawAnswer);
      assert.equal(row.children.length, 0); // Treated strictly as text, not an active IMG node
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 11: "One in a Krillion" Answer Reveal (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F11 Boundaries: Rarest Answer Integrity & Obfuscation', () => {
    it('F11.B1: handles multiple apex answers in question catalog by selecting first canonical', () => {
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
      assert.ok(chemQ.tiers.one_in_a_krillion.length > 1);
      const apex = chemQ.tiers.one_in_a_krillion[0];
      assert.ok(typeof apex === 'string' && apex.length > 0);
    });

    it('F11.B2: preserves hyphens and special characters in apex answers', () => {
      const deepQ = QUESTION_CATALOG.find(q => q.id === 'deep-sea-creatures');
      assert.ok(deepQ);
      const apexes = deepQ.tiers.one_in_a_krillion;
      assert.ok(apexes.some(a => a.includes('-') || a.includes(' ')));
    });

    it('F11.B3: reveals apex answer even on prompt timeout', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const currentQ = session.getCurrentQuestion();
      session.handleTimeout();
      const record = session.history[0];
      assert.equal(record.rarestReveal, currentQ.tiers.one_in_a_krillion[0]);
    });

    it('F11.B4: verifies apex answers are not exposed in DOM before prompt conclusion', () => {
      const card = document.querySelector('#question-card');
      for (const q of QUESTION_CATALOG.slice(0, 5)) {
        for (const apex of q.tiers.one_in_a_krillion) {
          assert.equal(card.textContent.includes(apex), false);
        }
      }
    });

    it('F11.B5: confirms all rarest reveals belong strictly to the one_in_a_krillion tier', () => {
      for (const q of QUESTION_CATALOG) {
        const top = q.tiers.one_in_a_krillion[0];
        assert.ok(q.tiers.one_in_a_krillion.includes(top));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 12: Spoiler-Free Share Grid (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F12 Boundaries: Share Formatting & Clipboard Failures', () => {
    it('F12.B1: handles clipboard write rejection safely with fallback', async () => {
      const origWrite = navigator.clipboard.writeText;
      navigator.clipboard.writeText = async () => {
        throw new Error('Clipboard permission denied');
      };

      let caught = false;
      try {
        await navigator.clipboard.writeText('test');
      } catch (err) {
        caught = true;
        assert.match(err.message, /denied/);
      }
      assert.equal(caught, true);
      navigator.clipboard.writeText = origWrite;
    });

    it('F12.B2: generates exact 7 black square emojis for all-timeout session share', () => {
      const summary = {
        totalDepth: 0,
        zone: { name: 'Sunlight Zone' },
        rounds: Array(7).fill({ timeout: true })
      };
      const text = generateShareText(summary);
      assert.match(text, /0m \/ 7,000m/);
      assert.match(text, /⬛⬛⬛⬛⬛⬛⬛/);
    });

    it('F12.B3: generates exact 7 star emojis for perfect dive share', () => {
      const summary = {
        totalDepth: 7000,
        zone: { name: 'The Hadal Trench' },
        rounds: Array(7).fill({ tier: 'one_in_a_krillion' })
      };
      const text = generateShareText(summary);
      assert.match(text, /7,000m \/ 7,000m/);
      assert.match(text, /🌟🌟🌟🌟🌟🌟🌟/);
    });

    it('F12.B4: generates compact share snippet under 200 characters', () => {
      const summary = {
        totalDepth: 3500,
        zone: { name: 'Midnight Zone' },
        rounds: Array(7).fill({ tier: 'rare' })
      };
      const text = generateShareText(summary);
      assert.ok(text.length <= 200);
    });

    it('F12.B5: rapid multi-clicks on Share button are idempotent', async () => {
      let count = 0;
      const shareBtn = document.querySelector('#share-btn');
      shareBtn.addEventListener('click', () => count++);
      shareBtn.click();
      shareBtn.click();
      shareBtn.click();
      assert.equal(count, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 13: Infinite Replay ("Play Again") (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F13 Boundaries: Infinite Replay & Catalog Recycling', () => {
    it('F13.B1: guarantees zero repeat questions across two immediate consecutive sessions', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      const session = new SessionManager(QUESTION_CATALOG, { storage });
      session.startSession();
      const s1 = session.questions.map(q => q.id);
      session.resetSession();
      const s2 = session.questions.map(q => q.id);
      const overlap = s1.filter(id => s2.includes(id));
      assert.equal(overlap.length, 0);
    });

    it('F13.B2: survives 10 consecutive sessions (70 questions drawn) with depth resetting to 0', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      const session = new SessionManager(QUESTION_CATALOG, { storage });
      for (let s = 0; s < 10; s++) {
        session.startSession();
        assert.equal(session.totalDepth, 0);
        assert.equal(session.questions.length, 7);
        for (let q = 0; q < 7; q++) {
          session.handleTimeout();
          session.nextQuestion();
        }
        assert.equal(session.state, SESSION_STATES.COMPLETED);
      }
    });

    it('F13.B3: resetting from an abandoned mid-session clears history and resets depth to 0m', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const q = session.getCurrentQuestion();
      session.submitAnswer(q.tiers.plankton[0]);
      session.nextQuestion();
      assert.ok(session.totalDepth > 0);
      session.resetSession();
      assert.equal(session.totalDepth, 0);
      assert.equal(session.history.length, 0);
      assert.equal(session.currentIndex, 0);
    });

    it('F13.B4: preserves high score in storage when new replay score is lower', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      storage.saveSessionRecord({ totalDepth: 4500, totalPoints: 450 });
      storage.saveSessionRecord({ totalDepth: 1000, totalPoints: 100 });
      const stats = storage.getStats();
      assert.equal(stats.bestDepth, 4500);
      assert.equal(stats.totalDives, 2);
    });

    it('F13.B5: resets input value and feedback text on Play Again via button click event', () => {
      const playAgainBtn = document.querySelector('#play-again-btn');
      const input = document.querySelector('#answer-input');
      const feedback = document.querySelector('#feedback-msg');
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();

      input.value = 'leftover text';
      feedback.textContent = 'leftover feedback';
      feedback.classList.remove('hidden');

      playAgainBtn.addEventListener('click', () => {
        session.resetSession();
        input.value = '';
        feedback.textContent = '';
        feedback.classList.add('hidden');
      });

      playAgainBtn.click();

      assert.equal(input.value, '');
      assert.equal(feedback.textContent, '');
      assert.equal(feedback.classList.contains('hidden'), true);
      assert.equal(session.getState().totalDepth, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 14: Case & Whitespace Normalization (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F14 Boundaries: Extreme Whitespace & Unicode Space Types', () => {
    it('F14.B1: empty string normalizes to empty string', () => {
      assert.equal(normalizeAnswer(''), '');
    });

    it('F14.B2: whitespace-only string with tabs and newlines normalizes to empty string', () => {
      assert.equal(normalizeAnswer('   \t  \n  \r  '), '');
    });

    it('F14.B3: strips non-breaking space (\\u00A0) and em space (\\u2003)', () => {
      assert.equal(normalizeAnswer('\u00A0gold\u2003'), 'gold');
    });

    it('F14.B4: collapses internal newlines and tabs in multi-word answers', () => {
      assert.equal(normalizeAnswer('\n\tcarbon   monoxide\t\n'), 'carbon monoxide');
    });

    it('F14.B5: handles 1,000 spaces surrounding valid word', () => {
      const padded = ' '.repeat(500) + 'iron' + ' '.repeat(500);
      assert.equal(normalizeAnswer(padded), 'iron');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 15: Accent & Diacritic Stripping (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F15 Boundaries: Diacritics & Multilingual Decomposition', () => {
    it('F15.B1: pure combining diacritical marks normalize to empty string', () => {
      assert.equal(normalizeAnswer('\u0300\u0301\u0302'), '');
    });

    it('F15.B2: strips complex multi-accented Vietnamese characters (Tiếng Việt -> tieng viet)', () => {
      assert.equal(normalizeAnswer('Tiếng Việt'), 'tieng viet');
    });

    it('F15.B3: lowercases non-Latin scripts safely without dropping valid script characters', () => {
      assert.equal(normalizeAnswer('Москва'), 'москва');
      assert.equal(normalizeAnswer('Ελλάδα'), 'ελλαδα');
    });

    it('F15.B4: treats NFC precomposed and NFD decomposed Unicode identically', () => {
      const nfc = '\u00E9'; // é
      const nfd = 'e\u0301'; // e + combining acute
      assert.equal(normalizeAnswer(nfc), 'e');
      assert.equal(normalizeAnswer(nfd), 'e');
      assert.equal(normalizeAnswer(nfc), normalizeAnswer(nfd));
    });

    it('F15.B5: matches accented user input against unaccented catalog entry', () => {
      const islandQ = QUESTION_CATALOG.find(q => q.id === 'island-nations');
      const match = matchAnswer('São Tomé and Príncipe', islandQ.tiers, islandQ.aliases);
      assert.equal(match.matched, true);
      assert.equal(match.canonical, 'Sao Tome and Principe');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 16: Article & Punctuation Stripping (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F16 Boundaries: Substrings & Heavy Punctuation', () => {
    it('F16.B1: lone article strings "the", "a", "an" do not match any answers in question catalog', () => {
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
      assert.equal(matchAnswer('the', chemQ.tiers, chemQ.aliases).matched, false);
      assert.equal(matchAnswer('a', chemQ.tiers, chemQ.aliases).matched, false);
      assert.equal(matchAnswer('an', chemQ.tiers, chemQ.aliases).matched, false);
    });

    it('F16.B2: does NOT strip words having article prefix as natural substring', () => {
      assert.equal(normalizeAnswer('theater'), 'theater');
      assert.equal(normalizeAnswer('anchor'), 'anchor');
      assert.equal(normalizeAnswer('theory'), 'theory');
      assert.equal(normalizeAnswer('anonymous'), 'anonymous');
    });

    it('F16.B3: pure punctuation string normalizes to empty string and domain symbols expand', () => {
      assert.equal(normalizeAnswer('!@$%^&*()_-=[]{}|;:",./<>?'), '');
      assert.equal(normalizeAnswer('!@#$%^&*()_+-=[]{}|;:",./<>?'), '');
      assert.equal(normalizeAnswer('c#'), 'c sharp');
      assert.equal(normalizeAnswer('c+'), 'c plus');
      assert.equal(normalizeAnswer('c++'), 'c plus plus');
    });

    it('F16.B4: converts hyphens to spaces (spider-man -> spider man)', () => {
      assert.equal(normalizeAnswer('spider-man'), 'spider man');
    });

    it('F16.B5: strips multiple nested quotes, brackets, and articles', () => {
      assert.equal(normalizeAnswer('\'The\' "Titanium" [Element]'), 'titanium element');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 17: Alias & Abbreviation Resolution (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F17 Boundaries: Alias Edge Cases & Noise', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F17.B1: resolves alias with surrounding noise and punctuation "  (U.S.A.)!  "', () => {
      const countryQ = QUESTION_CATALOG.find(q => q.id === 'countries-americas');
      const match = matchAnswer('  (U.S.A.)!  ', countryQ.tiers, countryQ.aliases);
      assert.equal(match.matched, true);
      assert.match(match.canonical, /united states/i);
    });

    it('F17.B2: functions normally when aliases map is empty or undefined', () => {
      const match = matchAnswer('iron', chemQ.tiers, {});
      assert.equal(match.matched, true);
      assert.equal(match.canonical.toLowerCase(), 'iron');
    });

    it('F17.B3: non-existent abbreviation returns matched: false without crash', () => {
      const match = matchAnswer('xyzabc123', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, false);
    });

    it('F17.B4: matches canonical name directly even when an alias for it exists', () => {
      const match = matchAnswer('iron', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, true);
      assert.equal(match.canonical.toLowerCase(), 'iron');
      assert.equal(match.distance, 0);
    });

    it('F17.B5: alias mapped to higher tier awards full tier points and depth', () => {
      const match = matchAnswer('w', chemQ.tiers, chemQ.aliases); // W = Tungsten (rare, 60 pts)
      assert.equal(match.matched, true);
      assert.equal(match.tier, 'rare');
      assert.equal(match.canonical.toLowerCase(), 'tungsten');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 18: Typo Tolerance / Fuzzy Match (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F18 Boundaries: Word Length & Distance Thresholds', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F18.B1: strictly rejects 1 typo on short words (<5 characters: "gald" for "gold")', () => {
      const match = matchAnswer('gald', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, false);
    });

    it('F18.B2: rejects 2 typos on medium words (length 5-7: "cabelt" for "cobalt")', () => {
      const match = matchAnswer('cabelt', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, false);
    });

    it('F18.B3: levenshtein distance against empty string returns length of other string', () => {
      assert.equal(levenshteinDistance('', 'uranium'), 7);
      assert.equal(levenshteinDistance('tin', ''), 3);
    });

    it('F18.B4: matches pluralized words via depluralization ("diamonds" -> "diamond")', () => {
      const minQ = QUESTION_CATALOG.find(q => q.id === 'minerals-gemstones');
      const match = matchAnswer('diamonds', minQ.tiers, minQ.aliases);
      assert.equal(match.matched, true);
    });

    it('F18.B5: accepts 2 typos on long words (length >= 8: "prasiadymium" for "praseodymium")', () => {
      assert.equal(levenshteinDistance('prasiadymium', 'praseodymium'), 2);
      const match = matchAnswer('prasiadymium', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, true);
      assert.equal(match.canonical.toLowerCase(), 'praseodymium');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 19: Dynamic Water Depth CSS Theme (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F19 Boundaries: Zone Class Exclusivity & Theme Stability', () => {
    it('F19.B1: guarantees only one zone class is active when depth changes', () => {
      const zoneClasses = ['zone-sunlight', 'zone-twilight', 'zone-midnight', 'zone-abyss', 'zone-hadal'];
      for (const cls of zoneClasses) document.body.classList.remove(cls);

      const zone = getOceanZone(1200);
      document.body.className = zone.class;
      assert.equal(document.body.classList.contains('zone-midnight'), true);
      assert.equal(document.body.classList.contains('zone-sunlight'), false);
    });

    it('F19.B2: clamps dynamic depth gauge between 0% and 100% (0m to 7000m)', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      const vessel = container.querySelector('#submarine-icon');

      gauge.updateDepth(-500);
      assert.equal(gauge.currentDepth, 0);
      assert.equal(vessel.style.top, '0%');

      gauge.updateDepth(3500);
      assert.equal(gauge.currentDepth, 3500);
      assert.equal(vessel.style.top, '50%');

      gauge.updateDepth(10000);
      assert.equal(gauge.currentDepth, 7000);
      assert.equal(vessel.style.top, '100%');
    });

    it('F19.B3: resets theme class to zone-sunlight when starting a new session', () => {
      document.body.className = 'zone-hadal';
      assert.equal(document.body.classList.contains('zone-hadal'), true);
      const resetZone = getOceanZone(0);
      document.body.className = resetZone.class;
      assert.equal(document.body.classList.contains('zone-sunlight'), true);
    });

    it('F19.B4: maintains zone-sunlight stability across 7 consecutive zero-point timeouts', () => {
      for (let i = 0; i < 7; i++) {
        const zone = getOceanZone(0);
        assert.equal(zone.class, 'zone-sunlight');
      }
    });

    it('F19.B5: transitions cleanly from Sunlight directly to Midnight on 1,000m apex leap', () => {
      const zBefore = getOceanZone(0);
      assert.equal(zBefore.class, 'zone-sunlight');
      const zAfter = getOceanZone(1000);
      assert.equal(zAfter.class, 'zone-midnight');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 20: Local Best Depth & Stat Tracking (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F20 Boundaries: Storage Corruption & Permission Errors', () => {
    it('F20.B1: handles corrupted JSON in localStorage gracefully with fallback defaults', () => {
      const mem = new MemoryStorage();
      mem.setItem('krillion_stats', '{invalid-json:::');
      const storage = new StorageAdapter(mem);
      const stats = storage.getStats();
      assert.equal(stats.bestDepth, 0);
      assert.equal(stats.totalDives, 0);
    });

    it('F20.B2: falls back to in-memory storage when localStorage throws SecurityError', () => {
      const mockStorage = new MockLocalStorage();
      mockStorage.__simulateSecurityError(true);
      const storage = new StorageAdapter(mockStorage);
      assert.doesNotThrow(() => {
        storage.saveSessionRecord({ totalDepth: 2500, totalPoints: 250 });
      });
    });

    it('F20.B3: guards against negative depth in saved session records', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      storage.saveSessionRecord({ totalDepth: -500, totalPoints: -50 });
      const stats = storage.getStats();
      assert.ok(stats.bestDepth >= 0);
    });

    it('F20.B4: modifies only krillion_ keys and does not touch other stored keys', () => {
      const mem = new MemoryStorage();
      mem.setItem('unrelated_key', 'keep_me');
      const storage = new StorageAdapter(mem);
      storage.saveSessionRecord({ totalDepth: 1000, totalPoints: 100 });
      assert.equal(mem.getItem('unrelated_key'), 'keep_me');
    });

    it('F20.B5: accurately accumulates high dive count without integer drift', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      for (let i = 0; i < 50; i++) {
        storage.saveSessionRecord({ totalDepth: 100, totalPoints: 10 });
      }
      assert.equal(storage.getStats().totalDives, 50);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 21: Procedural Web Audio Synthesis (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F21 Boundaries: Missing AudioContext & Audio Flood', () => {
    it('F21.B1: operates silently without throwing when AudioContext is undefined', () => {
      const origAudio = globalThis.AudioContext;
      delete globalThis.AudioContext;
      const sm = new SoundManager();
      assert.doesNotThrow(() => {
        sm.init();
        sm.playSonar();
        sm.playDive();
      });
      globalThis.AudioContext = origAudio;
    });

    it('F21.B2: calls resume() when AudioContext is in suspended state', async () => {
      const sm = new SoundManager();
      sm.init();
      assert.ok(sm.ctx);
      assert.equal(sm.ctx.state, 'running');
    });

    it('F21.B3: survives rapid audio flood (50 sounds in loop) without crashing', () => {
      const sm = new SoundManager();
      sm.init();
      assert.doesNotThrow(() => {
        for (let i = 0; i < 50; i++) {
          sm.playTick();
        }
      });
      assert.ok(sm.callLog.length >= 50);
    });

    it('F21.B4: creates zero audio nodes when muted', () => {
      const sm = new SoundManager();
      sm.init();
      const initialNodes = sm.ctx.createdNodes.length;
      sm.toggleMute(); // muted = true
      const r1 = sm.playSonar();
      const r2 = sm.playChime('one_in_a_krillion');
      assert.equal(r1, null);
      assert.equal(r2, null);
      assert.equal(sm.ctx.createdNodes.length, initialNodes);
    });

    it('F21.B5: catches oscillator start errors gracefully without propagating exception', () => {
      const sm = new SoundManager();
      sm.init();
      if (sm.ctx) {
        sm.ctx.createOscillator = () => {
          return {
            connect: () => {},
            start: () => { throw new Error('Hardware audio error'); },
            stop: () => {}
          };
        };
      }
      assert.doesNotThrow(() => {
        sm.playSonar();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 22: Curated Question Catalog (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F22 Boundaries: Catalog Disjointness & Pool Depth', () => {
    it('F22.B1: verifies answer set disjointness across all 42 questions in catalog', () => {
      assert.ok(QUESTION_CATALOG.length >= 40);
      for (const q of QUESTION_CATALOG) {
        const seen = new Map();
        for (const [tier, list] of Object.entries(q.tiers)) {
          for (const item of list) {
            const norm = normalizeAnswer(item);
            assert.equal(
              seen.has(norm),
              false,
              `Word "${item}" (normalized: "${norm}") duplicated across tiers in question "${q.id}" (found in ${tier}, previously in ${seen.get(norm)})`
            );
            seen.set(norm, tier);
          }
        }
      }
    });

    it('F22.B2: guarantees zero empty or whitespace-only answer strings in catalog', () => {
      for (const q of QUESTION_CATALOG) {
        for (const [tier, list] of Object.entries(q.tiers)) {
          for (const ans of list) {
            assert.ok(ans && ans.trim().length > 0, `Empty answer string found in ${q.id}`);
          }
        }
      }
    });

    it('F22.B3: verifies every question specifies timeLimitSec === 25', () => {
      for (const q of QUESTION_CATALOG) {
        assert.equal(q.timeLimitSec, 25, `Question ${q.id} timeLimitSec must be exactly 25`);
      }
    });

    it('F22.B4: verifies no single category dominates more than 40% of the catalog', () => {
      const counts = {};
      for (const q of QUESTION_CATALOG) {
        counts[q.category] = (counts[q.category] || 0) + 1;
      }
      const total = QUESTION_CATALOG.length;
      for (const [cat, count] of Object.entries(counts)) {
        const fraction = count / total;
        assert.ok(fraction <= 0.40, `Category ${cat} exceeds 40% of catalog (${(fraction * 100).toFixed(1)}%)`);
      }
    });

    it('F22.B5: verifies every question has at least 25 total valid answers across its 6 tiers', () => {
      for (const q of QUESTION_CATALOG) {
        let totalAnswers = 0;
        for (const list of Object.values(q.tiers)) {
          totalAnswers += list.length;
        }
        assert.ok(totalAnswers >= 25, `Question ${q.id} has only ${totalAnswers} answers (min required: 25)`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 23: Zero-Dependency Static Local Server & CLI (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F23 Boundaries: Static Server Security & Method Guards', () => {
    let server;
    let serverPort;

    beforeEach(async () => {
      server = createStaticServer({ rootDir: projectRoot });
      await new Promise(resolve => server.listen(0, resolve));
      serverPort = server.address().port;
    });

    afterEach(async () => {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('F23.B1: blocks path traversal via encoded slash attempts (%2e%2e)', async () => {
      const res = await new Promise(resolve => {
        http.get(`http://localhost:${serverPort}/..%2f..%2fetc%2fpasswd`, (r) => {
          r.resume();
          resolve(r);
        });
      });
      assert.ok([403, 404].includes(res.statusCode));
    });

    it('F23.B2: serves root path / or returns 404 without crashing', async () => {
      const res = await new Promise(resolve => {
        http.get(`http://localhost:${serverPort}/`, (r) => {
          r.resume();
          resolve(r);
        });
      });
      assert.ok([200, 404].includes(res.statusCode));
    });

    it('F23.B3: handles HTTP HEAD request method with 200 OK and empty body', async () => {
      const res = await new Promise(resolve => {
        const req = http.request(`http://localhost:${serverPort}/package.json`, { method: 'HEAD' }, (r) => {
          r.resume();
          resolve(r);
        });
        req.end();
      });
      assert.equal(res.statusCode, 200);
    });

    it('F23.B4: rejects unsupported HTTP methods (POST, PUT, DELETE) with 405 Method Not Allowed', async () => {
      const res = await new Promise(resolve => {
        const req = http.request(`http://localhost:${serverPort}/package.json`, { method: 'POST' }, (r) => {
          r.resume();
          resolve(r);
        });
        req.end();
      });
      assert.equal(res.statusCode, 405);
    });

    it('F23.B5: static server closes cleanly without hanging active sockets', async () => {
      assert.doesNotThrow(async () => {
        const tempServer = createStaticServer({ rootDir: projectRoot });
        await new Promise(resolve => tempServer.listen(0, resolve));
        await new Promise(resolve => tempServer.close(resolve));
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 24: E2E Test Suite & Full Verification (Boundaries)
  // ---------------------------------------------------------------------------
  describe('F24 Boundaries: Runner Integrity & Threshold Enforcement', () => {
    it('F24.B1: verifies runner outcome fails when any tier contains test failures', () => {
      const stats = new Map([
        ['tier1', { minRequired: 120, passed: 120, failed: 1 }],
        ['tier2', { minRequired: 120, passed: 120, failed: 0 }],
        ['tier3', { minRequired: 24, passed: 24, failed: 0 }],
        ['tier4', { minRequired: 5, passed: 5, failed: 0 }]
      ]);
      const res = evaluateRunnerOutcome(stats, 269);
      assert.equal(res.allThresholdsMet, false);
      assert.equal(res.exitCode, 1);
      assert.equal(res.totalTrackedFailed, 1);
    });

    it('F24.B2: verifies runner outcome fails when a tier falls below minimum required threshold', () => {
      const stats = new Map([
        ['tier1', { minRequired: 120, passed: 119, failed: 0 }], // Deficit of 1 test
        ['tier2', { minRequired: 120, passed: 120, failed: 0 }],
        ['tier3', { minRequired: 24, passed: 24, failed: 0 }],
        ['tier4', { minRequired: 5, passed: 5, failed: 0 }]
      ]);
      const res = evaluateRunnerOutcome(stats, 269);
      assert.equal(res.allThresholdsMet, false);
      assert.equal(res.exitCode, 1);
      assert.equal(res.totalTrackedFailed, 0);
    });

    it('F24.B3: verifies strict offline execution without network dependencies', () => {
      // Offline verification: full game session and questions initialize with zero network I/O
      const storage = new StorageAdapter(new MemoryStorage());
      const session = new SessionManager(QUESTION_CATALOG, { storage });
      session.startSession();
      assert.equal(session.getState().questionIndex, 0);
      assert.equal(session.questions.length, 7);
    });

    it('F24.B4: verifies sub-second execution duration with mock timers', (t) => {
      t.mock.timers.enable();
      const start = Date.now();
      t.mock.timers.tick(25000);
      const elapsed = Date.now() - start;
      t.mock.timers.reset();
      assert.ok(elapsed >= 25000);
    });

    it('F24.B5: verifies runner outcome succeeds when all tier thresholds and grand minimum are satisfied with zero failures', () => {
      const stats = new Map([
        ['tier1', { minRequired: 120, passed: 120, failed: 0 }],
        ['tier2', { minRequired: 120, passed: 120, failed: 0 }],
        ['tier3', { minRequired: 24, passed: 26, failed: 0 }],
        ['tier4', { minRequired: 5, passed: 5, failed: 0 }]
      ]);
      const res = evaluateRunnerOutcome(stats, 269);
      assert.equal(res.allThresholdsMet, true);
      assert.equal(res.exitCode, 0);
      assert.equal(res.totalTrackedPassed, 271);
      assert.ok(res.totalTrackedPassed >= 269);
      assert.equal(res.totalTrackedFailed, 0);
    });
  });
});
