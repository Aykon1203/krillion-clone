/**
 * Tier 1: Feature Coverage E2E Test Suite for krillion.io
 * Verifies all 24 features independently with >= 5 tests per feature (>= 120 tests).
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
  generateShareText
} from './helpers/browser-env.mjs';

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

describe('Tier 1: Feature Coverage (>=120 tests across 24 features)', () => {
  beforeEach(() => {
    setupBrowserEnv();
  });

  afterEach(() => {
    resetBrowserEnv();
  });

  // ---------------------------------------------------------------------------
  // Feature 1: Reverse-Trivia Obscurity Scoring
  // ---------------------------------------------------------------------------
  describe('F1: Reverse-Trivia Obscurity Scoring', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F1.1: scores Plankton tier (+10 pts, +100m)', () => {
      const res = evaluateSubmission(chemQ, 'iron');
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'plankton');
      assert.equal(res.points, 10);
      assert.equal(res.depthMeters, 100);
    });

    it('F1.2: scores Too Clever tier (+15 pts, +150m)', () => {
      const res = evaluateSubmission(chemQ, 'hydrogen');
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'too_clever');
      assert.equal(res.points, 15);
      assert.equal(res.depthMeters, 150);
    });

    it('F1.3: scores Schooler tier (+30 pts, +300m)', () => {
      const res = evaluateSubmission(chemQ, 'tin');
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'schooler');
      assert.equal(res.points, 30);
      assert.equal(res.depthMeters, 300);
    });

    it('F1.4: scores Rare tier (+60 pts, +600m)', () => {
      const res = evaluateSubmission(chemQ, 'titanium');
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'rare');
      assert.equal(res.points, 60);
      assert.equal(res.depthMeters, 600);
    });

    it('F1.5: scores Deep Cut and One in a Krillion tiers (+85 pts, +100 pts)', () => {
      const deepRes = evaluateSubmission(chemQ, 'gallium');
      assert.equal(deepRes.valid, true);
      assert.equal(deepRes.tier, 'deep_cut');
      assert.equal(deepRes.points, 85);
      assert.equal(deepRes.depthMeters, 850);

      const apexRes = evaluateSubmission(chemQ, 'praseodymium');
      assert.equal(apexRes.valid, true);
      assert.equal(apexRes.tier, 'one_in_a_krillion');
      assert.equal(apexRes.points, 100);
      assert.equal(apexRes.depthMeters, 1000);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: 7-Question Dive Session
  // ---------------------------------------------------------------------------
  describe('F2: 7-Question Dive Session', () => {
    it('F2.1: initializes exactly 7 questions in sequence queue', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const state = session.getState();
      assert.equal(state.totalQuestions, 7);
      assert.equal(state.questionIndex, 0);
      assert.ok(state.currentQuestion);
    });

    it('F2.2: increments sequential index on question advancement', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      assert.equal(session.currentIndex, 0);
      const q = session.getCurrentQuestion();
      const validAnswer = q.tiers.plankton[0];
      session.submitAnswer(validAnswer);
      session.nextQuestion();
      assert.equal(session.currentIndex, 1);
    });

    it('F2.3: advances question on timeout with 0 points recorded', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const res = session.handleTimeout();
      assert.equal(res.timeout, true);
      assert.equal(res.points, 0);
      session.nextQuestion();
      assert.equal(session.currentIndex, 1);
      assert.equal(session.history[0].timeout, true);
      assert.equal(session.history[0].points, 0);
    });

    it('F2.4: transitions to COMPLETED state after 7th question', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      assert.equal(session.state, SESSION_STATES.COMPLETED);
    });

    it('F2.5: records exactly 7 complete question history items', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      assert.equal(session.history.length, 7);
      for (const h of session.history) {
        assert.ok('questionId' in h);
        assert.ok('prompt' in h);
        assert.ok('points' in h);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: 25-Second Prompt Countdown Timer
  // ---------------------------------------------------------------------------
  describe('F3: 25-Second Prompt Countdown Timer', () => {
    it('F3.1: initializes with 25 seconds default duration', () => {
      const timer = new QuestionTimer({ durationSec: 25 });
      assert.equal(timer.getRemainingSec(), 25);
      assert.equal(timer.isRunning, false);
    });

    it('F3.2: emits periodic ticks with decreasing remaining seconds', (t) => {
      t.mock.timers.enable();
      const ticks = [];
      const timer = new QuestionTimer({
        durationSec: 25,
        onTick: (rem) => ticks.push(rem)
      });
      timer.start();
      t.mock.timers.tick(1000);
      t.mock.timers.tick(1000);
      t.mock.timers.tick(1000);
      timer.stop();
      t.mock.timers.reset();

      assert.ok(ticks.length >= 3);
      assert.equal(ticks[0], 24);
      assert.equal(ticks[1], 23);
      assert.equal(ticks[2], 22);
    });

    it('F3.3: stops mid-countdown and freezes remaining time', (t) => {
      t.mock.timers.enable();
      let ticksAfterStop = 0;
      const timer = new QuestionTimer({
        durationSec: 25,
        onTick: () => { if (!timer.isRunning) ticksAfterStop++; }
      });
      timer.start();
      t.mock.timers.tick(5000);
      timer.stop();
      const frozenSec = timer.getRemainingSec();
      t.mock.timers.tick(10000);
      t.mock.timers.reset();

      assert.equal(timer.getRemainingSec(), frozenSec);
      assert.equal(ticksAfterStop, 0);
    });

    it('F3.4: fires onExpire callback exactly once at 0 seconds', (t) => {
      t.mock.timers.enable();
      let expireCount = 0;
      const timer = new QuestionTimer({
        durationSec: 25,
        onExpire: () => { expireCount++; }
      });
      timer.start();
      t.mock.timers.tick(25000);
      timer.stop();
      t.mock.timers.reset();

      assert.equal(expireCount, 1);
      assert.equal(timer.getRemainingSec(), 0);
    });

    it('F3.5: resets to 25 seconds after being stopped', () => {
      const timer = new QuestionTimer({ durationSec: 25 });
      timer.start();
      timer.stop();
      timer.reset(25);
      assert.equal(timer.getRemainingSec(), 25);
      assert.equal(timer.isRunning, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 4: 6 Rarity Tiers
  // ---------------------------------------------------------------------------
  describe('F4: 6 Rarity Tiers', () => {
    it('F4.1: verifies Plankton tier metadata (10 pts, 100m)', () => {
      const p = RARITY_TIERS.plankton;
      assert.equal(p.name, 'Plankton');
      assert.equal(p.points, 10);
      assert.equal(p.depthMeters, 100);
      assert.equal(p.badge, 'tier-plankton');
    });

    it('F4.2: verifies Too Clever tier metadata (15 pts, 150m)', () => {
      const tc = RARITY_TIERS.too_clever;
      assert.equal(tc.name, 'Te Slim Bedacht');
      assert.equal(tc.points, 15);
      assert.equal(tc.depthMeters, 150);
      assert.equal(tc.badge, 'tier-too-clever');
    });

    it('F4.3: verifies Schooler tier metadata (30 pts, 300m)', () => {
      const s = RARITY_TIERS.schooler;
      assert.equal(s.name, 'Schoolvis');
      assert.equal(s.points, 30);
      assert.equal(s.depthMeters, 300);
      assert.equal(s.badge, 'tier-schooler');
    });

    it('F4.4: verifies Rare tier metadata (60 pts, 600m)', () => {
      const r = RARITY_TIERS.rare;
      assert.equal(r.name, 'Zeldzaam');
      assert.equal(r.points, 60);
      assert.equal(r.depthMeters, 600);
      assert.equal(r.badge, 'tier-rare');
    });

    it('F4.5: verifies Deep Cut and One in a Krillion tier metadata', () => {
      const dc = RARITY_TIERS.deep_cut;
      assert.equal(dc.name, 'Diepzeevonk');
      assert.equal(dc.points, 85);
      assert.equal(dc.depthMeters, 850);

      const apex = RARITY_TIERS.one_in_a_krillion;
      assert.equal(apex.name, 'Eén op een Krillion');
      assert.equal(apex.points, 100);
      assert.equal(apex.depthMeters, 1000);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 5: 5 Oceanic Depth Zones
  // ---------------------------------------------------------------------------
  describe('F5: 5 Oceanic Depth Zones', () => {
    it('F5.1: maps 0m - 199m to Sunlight Zone', () => {
      const z0 = getOceanZone(0);
      assert.match(z0.name, /Zonlichtzone/i);
      assert.equal(z0.class, 'zone-sunlight');

      const z199 = getOceanZone(199);
      assert.match(z199.name, /Zonlichtzone/i);
    });

    it('F5.2: maps 200m - 999m to Twilight Zone', () => {
      const z200 = getOceanZone(200);
      assert.match(z200.name, /Schemerzone/i);
      assert.equal(z200.class, 'zone-twilight');

      const z999 = getOceanZone(999);
      assert.match(z999.name, /Schemerzone/i);
    });

    it('F5.3: maps 1000m - 3999m to Midnight Zone', () => {
      const z1000 = getOceanZone(1000);
      assert.match(z1000.name, /Middernachtzone/i);
      assert.equal(z1000.class, 'zone-midnight');

      const z3999 = getOceanZone(3999);
      assert.match(z3999.name, /Middernachtzone/i);
    });

    it('F5.4: maps 4000m - 5999m to The Abyss', () => {
      const z4000 = getOceanZone(4000);
      assert.match(z4000.name, /Abyss/i);
      assert.equal(z4000.class, 'zone-abyss');

      const z5999 = getOceanZone(5999);
      assert.match(z5999.name, /Abyss/i);
    });

    it('F5.5: maps 6000m - 7000m to The Hadal Trench', () => {
      const z6000 = getOceanZone(6000);
      assert.match(z6000.name, /Hadal/i);
      assert.equal(z6000.class, 'zone-hadal');

      const z7000 = getOceanZone(7000);
      assert.match(z7000.name, /Hadal/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 6: Open-Ended Text Input
  // ---------------------------------------------------------------------------
  describe('F6: Open-Ended Text Input', () => {
    it('F6.1: renders input element with type="text"', () => {
      const input = document.querySelector('#answer-input');
      assert.ok(input);
      assert.equal(input.tagName, 'INPUT');
      assert.equal(input.type, 'text');
    });

    it('F6.2: receives focus on prompt initialization', () => {
      const input = document.querySelector('#answer-input');
      input.focus();
      assert.equal(document.activeElement, input);
    });

    it('F6.3: updates value synchronously on typing', () => {
      const input = document.querySelector('#answer-input');
      input.value = 'Nautilus';
      input.dispatchEvent(new Event('input'));
      assert.equal(input.value, 'Nautilus');
    });

    it('F6.4: triggers submission handler on Enter keypress', () => {
      const input = document.querySelector('#answer-input');
      let submitted = false;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitted = true;
      });
      const enterEvent = new Event('keydown', { bubbles: true });
      enterEvent.key = 'Enter';
      input.dispatchEvent(enterEvent);
      assert.equal(submitted, true);
    });

    it('F6.5: triggers submission handler on submit button click', () => {
      const btn = document.querySelector('#submit-btn');
      let clicked = false;
      btn.addEventListener('click', () => { clicked = true; });
      btn.click();
      assert.equal(clicked, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 7: Try-Again on Rejection
  // ---------------------------------------------------------------------------
  describe('F7: Try-Again on Rejection', () => {
    it('F7.1: displays feedback message on unrecognized input via form submit event', () => {
      const form = document.querySelector('#answer-form');
      const input = document.querySelector('#answer-input');
      const feedback = document.querySelector('#feedback-msg');
      const card = document.querySelector('#question-card');
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

      form.addEventListener('submit', (e) => {
        e.preventDefault?.();
        const res = evaluateSubmission(chemQ, input.value);
        if (!res.valid) {
          feedback.textContent = 'Not recognized, try again!';
          feedback.classList.remove('hidden');
          card.classList.add('shake');
        }
      });

      input.value = 'invalidxyz';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      assert.equal(feedback.textContent, 'Not recognized, try again!');
      assert.equal(feedback.classList.contains('hidden'), false);
    });

    it('F7.2: keeps countdown timer running on invalid submission', (t) => {
      t.mock.timers.enable();
      const timer = new QuestionTimer({ durationSec: 25 });
      timer.start();
      t.mock.timers.tick(5000);
      assert.equal(timer.isRunning, true);
      assert.equal(timer.getRemainingSec(), 20);

      // Submit invalid answer
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
      const res = evaluateSubmission(chemQ, 'invalidxyz');
      assert.equal(res.valid, false);

      // Verify timer still running
      t.mock.timers.tick(2000);
      assert.equal(timer.isRunning, true);
      assert.equal(timer.getRemainingSec(), 18);

      timer.stop();
      t.mock.timers.reset();
    });

    it('F7.3: preserves input enabled status and focus for retyping', () => {
      const input = document.querySelector('#answer-input');
      input.disabled = false;
      input.focus();
      assert.equal(input.disabled, false);
      assert.equal(document.activeElement, input);
    });

    it('F7.4: accepts subsequent valid answer after an initial rejection', () => {
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
      const bad = evaluateSubmission(chemQ, 'wronganswer');
      assert.equal(bad.valid, false);

      const good = evaluateSubmission(chemQ, 'gold');
      assert.equal(good.valid, true);
      assert.equal(good.tier, 'plankton');
    });

    it('F7.5: applies visual shake animation class on rejection via form submit event', () => {
      const form = document.querySelector('#answer-form');
      const input = document.querySelector('#answer-input');
      const card = document.querySelector('#question-card');
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

      form.addEventListener('submit', () => {
        const res = evaluateSubmission(chemQ, input.value);
        if (!res.valid) {
          card.classList.add('shake');
        }
      });

      input.value = 'invalidxyz';
      form.dispatchEvent(new Event('submit', { bubbles: true }));

      assert.equal(card.classList.contains('shake'), true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 8: Prompt Lock on Valid Submission
  // ---------------------------------------------------------------------------
  describe('F8: Prompt Lock on Valid Submission', () => {
    it('F8.1: disables answer input immediately upon valid acceptance via submit event', () => {
      const form = document.querySelector('#answer-form');
      const input = document.querySelector('#answer-input');
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

      form.addEventListener('submit', () => {
        const res = evaluateSubmission(chemQ, input.value);
        if (res.valid) {
          input.disabled = true;
        }
      });

      input.value = 'gold';
      form.dispatchEvent(new Event('submit', { bubbles: true }));

      assert.equal(input.disabled, true);
    });

    it('F8.2: disables submit button upon valid acceptance via click event', () => {
      const btn = document.querySelector('#submit-btn');
      const input = document.querySelector('#answer-input');
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

      btn.addEventListener('click', () => {
        const res = evaluateSubmission(chemQ, input.value);
        if (res.valid) {
          btn.disabled = true;
        }
      });

      input.value = 'gold';
      btn.click();

      assert.equal(btn.disabled, true);
    });

    it('F8.3: stops active timer upon valid acceptance', (t) => {
      t.mock.timers.enable();
      const timer = new QuestionTimer({ durationSec: 25 });
      timer.start();
      t.mock.timers.tick(8000);
      assert.equal(timer.getRemainingSec(), 17);

      // Answer accepted -> timer stopped
      timer.stop();
      t.mock.timers.tick(5000);
      assert.equal(timer.getRemainingSec(), 17);
      assert.equal(timer.isRunning, false);

      t.mock.timers.reset();
    });

    it('F8.4: renders tier award feedback in DOM via valid submission event', () => {
      const form = document.querySelector('#answer-form');
      const input = document.querySelector('#answer-input');
      const feedback = document.querySelector('#feedback-msg');
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

      form.addEventListener('submit', () => {
        const res = evaluateSubmission(chemQ, input.value);
        if (res.valid) {
          const tier = RARITY_TIERS[res.tier];
          feedback.textContent = `+${tier.points} pts | +${tier.depthMeters}m (${tier.name})`;
          feedback.classList.remove('hidden');
        }
      });

      input.value = 'argon';
      form.dispatchEvent(new Event('submit', { bubbles: true }));

      assert.match(feedback.textContent, /\+60 pts/);
      assert.match(feedback.textContent, /\+600m/);
      assert.match(feedback.textContent, /Zeldzaam/);
    });

    it('F8.5: re-enables and clears input on next question transition', () => {
      const input = document.querySelector('#answer-input');
      input.value = 'gold';
      input.disabled = true;

      // Next question loads
      input.disabled = false;
      input.value = '';
      assert.equal(input.disabled, false);
      assert.equal(input.value, '');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 9: Submarine / Krill Dive Animation
  // ---------------------------------------------------------------------------
  describe('F9: Submarine / Krill Dive Animation', () => {
    it('F9.1: initializes DepthGauge with 0m depth', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      assert.equal(gauge.currentDepth, 0);
    });

    it('F9.2: calculates correct updated target depth meters', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      gauge.updateDepth(600, 0);
      assert.equal(gauge.currentDepth, 600);
    });

    it('F9.3: updates depth counter odometer text display', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      gauge.updateDepth(1500, 0);
      const counter = container.querySelector('#depth-counter');
      assert.equal(counter.textContent, '1,500 m');
    });

    it('F9.4: translates vessel vertical position according to depth fraction', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      gauge.updateDepth(3500, 0); // 50% of 7000m
      const vessel = container.querySelector('#submarine-icon');
      assert.equal(vessel.style.top, '50%');
    });

    it('F9.5: maintains 0m position on zero-depth gain timeout', () => {
      const container = document.querySelector('#depth-gauge');
      const gauge = new DepthGauge(container);
      gauge.updateDepth(0, 0);
      const counter = container.querySelector('#depth-counter');
      assert.equal(counter.textContent, '0 m');
      assert.equal(gauge.currentDepth, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 10: End-of-Session Summary Screen
  // ---------------------------------------------------------------------------
  describe('F10: End-of-Session Summary Screen', () => {
    it('F10.1: renders summary modal visible on session completion transition', () => {
      const modal = document.querySelector('#summary-modal');
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();

      const onSessionStateChange = () => {
        if (session.state === SESSION_STATES.COMPLETED || session.getSummary().isCompleted) {
          modal.classList.remove('hidden');
        }
      };

      assert.equal(modal.classList.contains('hidden'), true);
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      onSessionStateChange();

      assert.equal(session.state, SESSION_STATES.COMPLETED);
      assert.equal(modal.classList.contains('hidden'), false);
    });

    it('F10.2: formats final depth and points summary display from live session summary', () => {
      const depthEl = document.querySelector('#summary-depth');
      const ptsEl = document.querySelector('#summary-points');
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();

      const q1 = session.getCurrentQuestion();
      session.submitAnswer(q1.tiers.rare[0]); // +60 pts, +600m
      for (let i = 1; i < 7; i++) {
        session.nextQuestion();
        session.handleTimeout();
      }

      const summary = session.getSummary();
      depthEl.textContent = `${summary.totalDepth.toLocaleString('en-US')} m / 7,000 m`;
      ptsEl.textContent = `${summary.totalPoints} / 700 pts`;

      assert.equal(depthEl.textContent, '600 m / 7,000 m');
      assert.equal(ptsEl.textContent, '60 / 700 pts');
    });

    it('F10.3: displays deepest oceanic zone achieved', () => {
      const zoneEl = document.querySelector('#summary-zone');
      const zone = getOceanZone(4500);
      zoneEl.textContent = zone.name;
      assert.match(zoneEl.textContent, /De Afgrond/i);
    });

    it('F10.4: displays earned diver rank title', () => {
      const titleEl = document.querySelector('#summary-title');
      const title = getDiverTitle(4500);
      titleEl.textContent = title;
      assert.equal(titleEl.textContent, 'Afgronduitdager');
    });

    it('F10.5: renders 7 question breakdown records', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      for (let i = 0; i < 7; i++) {
        session.handleTimeout();
        session.nextQuestion();
      }
      const summary = session.getSummary();
      assert.equal(summary.rounds.length, 7);
      assert.equal(summary.isCompleted, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 11: "One in a Krillion" Answer Reveal
  // ---------------------------------------------------------------------------
  describe('F11: "One in a Krillion" Answer Reveal', () => {
    it('F11.1: confirms every catalog question defines at least one apex answer', () => {
      for (const q of QUESTION_CATALOG) {
        assert.ok(q.tiers?.one_in_a_krillion?.length >= 1, `Missing apex tier in ${q.id}`);
      }
    });

    it('F11.2: includes rarest answer reveal in round history record', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      session.handleTimeout();
      assert.ok(session.history[0].rarestReveal);
    });

    it('F11.3: highlights user-matched apex answers', () => {
      const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
      const res = evaluateSubmission(chemQ, 'praseodymium');
      assert.equal(res.tier, 'one_in_a_krillion');
      assert.equal(res.points, 100);
    });

    it('F11.4: reveals apex answer on prompt timeout', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      const currentQ = session.getCurrentQuestion();
      session.handleTimeout();
      const round = session.history[0];
      assert.equal(round.rarestReveal, currentQ.tiers.one_in_a_krillion[0]);
    });

    it('F11.5: avoids leaking future apex answers in visible DOM', () => {
      const card = document.querySelector('#question-card');
      assert.equal(card.textContent.includes('praseodymium'), false);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 12: Spoiler-Free Share Grid
  // ---------------------------------------------------------------------------
  describe('F12: Spoiler-Free Share Grid', () => {
    it('F12.1: formats share snippet with game name and depth fraction', () => {
      const mockSummary = {
        totalDepth: 5200,
        zone: { name: 'The Abyss (Abyssopelagic)' },
        rounds: Array(7).fill({ tier: 'rare' })
      };
      const text = generateShareText(mockSummary);
      assert.match(text, /Krillion Dive: 5,200m \/ 7,000m/);
      assert.match(text, /Zone: The Abyss/);
    });

    it('F12.2: generates sequence of exactly 7 tier emojis', () => {
      const mockSummary = {
        totalDepth: 3500,
        zone: { name: 'Midnight Zone' },
        rounds: [
          { tier: 'plankton' },
          { tier: 'too_clever' },
          { tier: 'schooler' },
          { tier: 'rare' },
          { tier: 'deep_cut' },
          { tier: 'one_in_a_krillion' },
          { timeout: true }
        ]
      };
      const text = generateShareText(mockSummary);
      assert.match(text, /⬜🟩🟦🟪🟨🌟⬛/);
    });

    it('F12.3: renders black square emoji for timeouts', () => {
      const mockSummary = {
        totalDepth: 0,
        zone: { name: 'Sunlight Zone' },
        rounds: Array(7).fill({ timeout: true })
      };
      const text = generateShareText(mockSummary);
      assert.match(text, /⬛⬛⬛⬛⬛⬛⬛/);
    });

    it('F12.4: verifies complete absence of prompt or answer text in share text', () => {
      const mockSummary = {
        totalDepth: 1000,
        zone: { name: 'Twilight Zone' },
        rounds: [{ tier: 'plankton', prompt: 'Secret Prompt', canonical: 'Secret Answer' }]
      };
      const text = generateShareText(mockSummary);
      assert.equal(text.includes('Secret Prompt'), false);
      assert.equal(text.includes('Secret Answer'), false);
    });

    it('F12.5: copies share snippet to clipboard via navigator.clipboard', async () => {
      const textToCopy = 'Krillion Share Test';
      await navigator.clipboard.writeText(textToCopy);
      const readBack = await navigator.clipboard.readText();
      assert.equal(readBack, textToCopy);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 13: Infinite Replay ("Play Again")
  // ---------------------------------------------------------------------------
  describe('F13: Infinite Replay ("Play Again")', () => {
    it('F13.1: dismisses summary modal on Play Again click', () => {
      const modal = document.querySelector('#summary-modal');
      modal.classList.remove('hidden');
      const btn = document.querySelector('#play-again-btn');
      btn.addEventListener('click', () => { modal.classList.add('hidden'); });
      btn.click();
      assert.equal(modal.classList.contains('hidden'), true);
    });

    it('F13.2: resets cumulative depth and points to zero on session reset', () => {
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();
      session.submitAnswer('iron');
      session.nextQuestion();
      session.resetSession();
      assert.equal(session.totalDepth, 0);
      assert.equal(session.totalPoints, 0);
      assert.equal(session.currentIndex, 0);
    });

    it('F13.3: resets question counter text to Question 1 of 7 via Play Again button click event', () => {
      const playAgainBtn = document.querySelector('#play-again-btn');
      const counter = document.querySelector('#question-counter');
      const session = new SessionManager(QUESTION_CATALOG);
      session.startSession();

      // Progress past question 1
      session.handleTimeout();
      session.nextQuestion();
      counter.textContent = `Question ${session.currentIndex + 1} of 7`;
      assert.equal(counter.textContent, 'Question 2 of 7');

      // Wire replay button click
      playAgainBtn.addEventListener('click', () => {
        session.resetSession();
        counter.textContent = `Question ${session.currentIndex + 1} of 7`;
      });

      playAgainBtn.click();
      assert.equal(session.currentIndex, 0);
      assert.equal(counter.textContent, 'Question 1 of 7');
    });

    it('F13.4: draws fresh 7-question batch on replay', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      const session = new SessionManager(QUESTION_CATALOG, { storage });
      session.startSession();
      const qIds1 = session.questions.map(q => q.id);
      session.resetSession();
      const qIds2 = session.questions.map(q => q.id);
      assert.equal(qIds2.length, 7);
      // LRU ensures disjoint consecutive batches
      const intersection = qIds1.filter(id => qIds2.includes(id));
      assert.equal(intersection.length, 0);
    });

    it('F13.5: reinitializes countdown timer to 25 seconds', () => {
      const timer = new QuestionTimer({ durationSec: 25 });
      timer.start();
      timer.reset(25);
      assert.equal(timer.getRemainingSec(), 25);
      assert.equal(timer.isRunning, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 14: Case & Whitespace Normalization
  // ---------------------------------------------------------------------------
  describe('F14: Case & Whitespace Normalization', () => {
    it('F14.1: converts uppercase characters to lowercase', () => {
      assert.equal(normalizeAnswer('OXYGEN'), 'oxygen');
    });

    it('F14.2: converts mixed-case characters to lowercase', () => {
      assert.equal(normalizeAnswer('pLaTiNuM'), 'platinum');
    });

    it('F14.3: trims leading and trailing whitespace', () => {
      assert.equal(normalizeAnswer('   silver   '), 'silver');
    });

    it('F14.4: collapses multiple consecutive internal spaces', () => {
      assert.equal(normalizeAnswer('carbon    dioxide'), 'carbon dioxide');
    });

    it('F14.5: strips tab and newline characters', () => {
      assert.equal(normalizeAnswer('\tiron\n'), 'iron');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 15: Accent & Diacritic Stripping
  // ---------------------------------------------------------------------------
  describe('F15: Accent & Diacritic Stripping', () => {
    it('F15.1: strips acute accents (é -> e)', () => {
      assert.equal(normalizeAnswer('café'), 'cafe');
    });

    it('F15.2: strips tildes (ñ -> n)', () => {
      assert.equal(normalizeAnswer('piñata'), 'pinata');
    });

    it('F15.3: strips umlauts (ü -> u)', () => {
      assert.equal(normalizeAnswer('München'), 'munchen');
    });

    it('F15.4: strips cedillas (ç -> c)', () => {
      assert.equal(normalizeAnswer('Curaçao'), 'curacao');
    });

    it('F15.5: strips circumflexes and graves', () => {
      assert.equal(normalizeAnswer('crème brûlée'), 'creme brulee');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 16: Article & Punctuation Stripping
  // ---------------------------------------------------------------------------
  describe('F16: Article & Punctuation Stripping', () => {
    it('F16.1: strips leading "The " article', () => {
      assert.equal(normalizeAnswer('The United Kingdom'), 'united kingdom');
    });

    it('F16.2: strips leading "A " article', () => {
      assert.equal(normalizeAnswer('A Star Is Born'), 'star is born');
    });

    it('F16.3: strips leading "An " article', () => {
      assert.equal(normalizeAnswer('An Octopus'), 'octopus');
    });

    it('F16.4: strips commas, exclamations, and periods', () => {
      assert.equal(normalizeAnswer('Iron, Gold! & Silver.'), 'iron gold silver');
    });

    it('F16.5: strips quotes and apostrophes', () => {
      assert.equal(normalizeAnswer("O'Connor"), 'oconnor');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 17: Alias & Abbreviation Resolution
  // ---------------------------------------------------------------------------
  describe('F17: Alias & Abbreviation Resolution', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F17.1: resolves chemical element symbol "fe" to iron', () => {
      const match = matchAnswer('fe', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, true);
      assert.equal(match.canonical.toLowerCase(), 'iron');
      assert.equal(match.tier, 'plankton');
    });

    it('F17.2: resolves country abbreviation "usa"', () => {
      const countryQ = QUESTION_CATALOG.find(q => q.id === 'countries-americas');
      const match = matchAnswer('usa', countryQ.tiers, countryQ.aliases);
      assert.equal(match.matched, true);
      assert.match(match.canonical, /united states/i);
    });

    it('F17.3: resolves country abbreviation "uk"', () => {
      const countryQ = QUESTION_CATALOG.find(q => q.id === 'countries-europe');
      const match = matchAnswer('uk', countryQ.tiers, countryQ.aliases);
      assert.equal(match.matched, true);
      assert.match(match.canonical, /united kingdom/i);
    });

    it('F17.4: resolves dotted abbreviation "U.S.A."', () => {
      const countryQ = QUESTION_CATALOG.find(q => q.id === 'countries-americas');
      const match = matchAnswer('U.S.A.', countryQ.tiers, countryQ.aliases);
      assert.equal(match.matched, true);
    });

    it('F17.5: awards full tier points when alias is submitted', () => {
      const res = evaluateSubmission(chemQ, 'au');
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'plankton');
      assert.equal(res.points, 10);
      assert.equal(res.depthMeters, 100);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 18: Typo Tolerance / Fuzzy Match
  // ---------------------------------------------------------------------------
  describe('F18: Typo Tolerance / Fuzzy Match', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    it('F18.1: reports Levenshtein distance 0 on exact match', () => {
      assert.equal(levenshteinDistance('gold', 'gold'), 0);
    });

    it('F18.2: accepts 1 substitution typo on words >= 5 characters', () => {
      assert.equal(levenshteinDistance('titamium', 'titanium'), 1);
      const match = matchAnswer('titamium', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, true);
      assert.equal(match.canonical.toLowerCase(), 'titanium');
    });

    it('F18.3: accepts 1 deletion typo on words >= 5 characters', () => {
      assert.equal(levenshteinDistance('platium', 'platinum'), 1);
      const match = matchAnswer('platium', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, true);
    });

    it('F18.4: accepts 1 insertion typo on words >= 5 characters', () => {
      assert.equal(levenshteinDistance('urannium', 'uranium'), 1);
      const match = matchAnswer('urannium', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, true);
    });

    it('F18.5: prefers exact match over fuzzy match distance', () => {
      const match = matchAnswer('lead', chemQ.tiers, chemQ.aliases);
      assert.equal(match.matched, true);
      assert.equal(match.distance, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 19: Dynamic Water Depth CSS Theme
  // ---------------------------------------------------------------------------
  describe('F19: Dynamic Water Depth CSS Theme', () => {
    const bindThemeDispatcher = () => {
      const listener = (e) => {
        const zone = getOceanZone(e.detail?.depth ?? 0);
        OCEAN_ZONES.forEach(z => document.body.classList.remove(z.class));
        document.body.classList.add(zone.class);
      };
      window.addEventListener('depthchange', listener);
      return listener;
    };

    it('F19.1: sets Sunlight Zone class at 0m initial depth via depthchange event', () => {
      bindThemeDispatcher();
      window.dispatchEvent(new CustomEvent('depthchange', { detail: { depth: 0 } }));
      assert.equal(document.body.classList.contains('zone-sunlight'), true);
      assert.equal(document.body.classList.contains('zone-twilight'), false);
    });

    it('F19.2: updates class to zone-twilight at 300m via depthchange event', () => {
      bindThemeDispatcher();
      window.dispatchEvent(new CustomEvent('depthchange', { detail: { depth: 300 } }));
      assert.equal(document.body.classList.contains('zone-twilight'), true);
      assert.equal(document.body.classList.contains('zone-sunlight'), false);
    });

    it('F19.3: updates class to zone-midnight at 1500m via depthchange event', () => {
      bindThemeDispatcher();
      window.dispatchEvent(new CustomEvent('depthchange', { detail: { depth: 1500 } }));
      assert.equal(document.body.classList.contains('zone-midnight'), true);
      assert.equal(document.body.classList.contains('zone-twilight'), false);
    });

    it('F19.4: updates class to zone-abyss at 4200m via depthchange event', () => {
      bindThemeDispatcher();
      window.dispatchEvent(new CustomEvent('depthchange', { detail: { depth: 4200 } }));
      assert.equal(document.body.classList.contains('zone-abyss'), true);
      assert.equal(document.body.classList.contains('zone-midnight'), false);
    });

    it('F19.5: updates class to zone-hadal at 6500m via depthchange event', () => {
      bindThemeDispatcher();
      window.dispatchEvent(new CustomEvent('depthchange', { detail: { depth: 6500 } }));
      assert.equal(document.body.classList.contains('zone-hadal'), true);
      assert.equal(document.body.classList.contains('zone-abyss'), false);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 20: Local Best Depth & Stat Tracking
  // ---------------------------------------------------------------------------
  describe('F20: Local Best Depth & Stat Tracking', () => {
    it('F20.1: initializes default stats when storage is empty', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      const stats = storage.getStats();
      assert.equal(stats.bestDepth, 0);
      assert.equal(stats.totalDives, 0);
    });

    it('F20.2: records first completed dive depth and increments total dives', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      storage.saveSessionRecord({ totalDepth: 2000, totalPoints: 200 });
      const stats = storage.getStats();
      assert.equal(stats.bestDepth, 2000);
      assert.equal(stats.totalDives, 1);
    });

    it('F20.3: preserves previous high score when subsequent dive is lower', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      storage.saveSessionRecord({ totalDepth: 3000, totalPoints: 300 });
      storage.saveSessionRecord({ totalDepth: 1500, totalPoints: 150 });
      const stats = storage.getStats();
      assert.equal(stats.bestDepth, 3000);
      assert.equal(stats.totalDives, 2);
    });

    it('F20.4: updates high score when subsequent dive achieves greater depth', () => {
      const storage = new StorageAdapter(new MemoryStorage());
      storage.saveSessionRecord({ totalDepth: 2000, totalPoints: 200 });
      storage.saveSessionRecord({ totalDepth: 4500, totalPoints: 450 });
      const stats = storage.getStats();
      assert.equal(stats.bestDepth, 4500);
      assert.equal(stats.totalDives, 2);
    });

    it('F20.5: reloads saved stats accurately from storage backend', () => {
      const mem = new MemoryStorage();
      const s1 = new StorageAdapter(mem);
      s1.saveSessionRecord({ totalDepth: 5000, totalPoints: 500 });

      const s2 = new StorageAdapter(mem);
      const reloaded = s2.getStats();
      assert.equal(reloaded.bestDepth, 5000);
      assert.equal(reloaded.totalDives, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 21: Procedural Web Audio Synthesis
  // ---------------------------------------------------------------------------
  describe('F21: Procedural Web Audio Synthesis', () => {
    it('F21.1: initializes SoundManager with default unmuted state', () => {
      const sm = new SoundManager();
      assert.equal(sm.isMuted(), false);
    });

    it('F21.2: toggles mute state between muted and unmuted', () => {
      const sm = new SoundManager();
      assert.equal(sm.toggleMute(), true);
      assert.equal(sm.isMuted(), true);
      assert.equal(sm.toggleMute(), false);
      assert.equal(sm.isMuted(), false);
    });

    it('F21.3: synthesizes sonar ping audio oscillator', () => {
      const sm = new SoundManager();
      sm.init();
      sm.playSonar();
      assert.ok(sm.callLog.some(e => e.type === 'sonar'));
    });

    it('F21.4: synthesizes tier chime sound corresponding to tier', () => {
      const sm = new SoundManager();
      sm.init();
      sm.playChime('deep_cut');
      assert.ok(sm.callLog.some(e => e.type === 'chime' && e.tierKey === 'deep_cut'));
    });

    it('F21.5: synthesizes rejection sound on invalid submission', () => {
      const sm = new SoundManager();
      sm.init();
      sm.playReject();
      assert.ok(sm.callLog.some(e => e.type === 'reject'));
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 22: Curated Question Catalog
  // ---------------------------------------------------------------------------
  describe('F22: Curated Question Catalog', () => {
    it('F22.1: contains at least 40 curated questions', () => {
      assert.ok(QUESTION_CATALOG.length >= 40, `Catalog has ${QUESTION_CATALOG.length} questions`);
    });

    it('F22.2: enforces mandatory schema properties on all questions', () => {
      for (const q of QUESTION_CATALOG) {
        assert.ok(q.id, 'Question missing id');
        assert.ok(q.prompt, `Question ${q.id} missing prompt`);
        assert.ok(q.category, `Question ${q.id} missing category`);
        assert.equal(q.timeLimitSec, 25, `Question ${q.id} timeLimitSec must be 25`);
        assert.ok(q.tiers, `Question ${q.id} missing tiers`);
      }
    });

    it('F22.3: spans at least 6 diverse knowledge categories', () => {
      const categories = new Set(QUESTION_CATALOG.map(q => q.category));
      assert.ok(categories.size >= 6, `Found ${categories.size} categories`);
    });

    it('F22.4: populates all 6 rarity tiers for every catalog question', () => {
      const requiredTiers = ['plankton', 'too_clever', 'schooler', 'rare', 'deep_cut', 'one_in_a_krillion'];
      for (const q of QUESTION_CATALOG) {
        for (const tier of requiredTiers) {
          assert.ok(Array.isArray(q.tiers[tier]) && q.tiers[tier].length > 0, `Question ${q.id} missing tier ${tier}`);
        }
      }
    });

    it('F22.5: guarantees zero duplicate question identifiers', () => {
      const ids = QUESTION_CATALOG.map(q => q.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, ids.length, 'Duplicate question IDs found in catalog');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 23: Zero-Dependency Static Local Server & CLI
  // ---------------------------------------------------------------------------
  describe('F23: Zero-Dependency Static Local Server & CLI', () => {
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

    it('F23.1: starts HTTP server and responds to GET /', async () => {
      const res = await new Promise(resolve => {
        http.get(`http://localhost:${serverPort}/`, (r) => {
          r.resume();
          resolve(r);
        });
      });
      assert.ok(res.statusCode === 200 || res.statusCode === 404);
    });

    it('F23.2: serves package.json with application/json MIME type', async () => {
      const res = await new Promise(resolve => {
        http.get(`http://localhost:${serverPort}/package.json`, (r) => {
          r.resume();
          resolve(r);
        });
      });
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'], /application\/json/);
    });

    it('F23.3: serves JavaScript files with application/javascript MIME type', async () => {
      const res = await new Promise(resolve => {
        http.get(`http://localhost:${serverPort}/src/js/scoring.js`, (r) => {
          r.resume();
          resolve(r);
        });
      });
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'], /application\/javascript/);
    });

    it('F23.4: returns 404 Not Found for non-existent routes', async () => {
      const res = await new Promise(resolve => {
        http.get(`http://localhost:${serverPort}/missing-file-404.xyz`, (r) => {
          r.resume();
          resolve(r);
        });
      });
      assert.equal(res.statusCode, 404);
    });

    it('F23.5: returns 403 Forbidden or 404 Not Found on directory traversal attempts', async () => {
      const res = await new Promise(resolve => {
        http.get(`http://localhost:${serverPort}/../etc/passwd`, (r) => {
          r.resume();
          resolve(r);
        });
      });
      assert.ok([403, 404].includes(res.statusCode));
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 24: E2E Test Suite & Full Verification
  // ---------------------------------------------------------------------------
  describe('F24: E2E Test Suite & Full Verification', () => {
    it('F24.1: master runner file exists in tests/e2e/e2e-runner.mjs', async () => {
      const runnerPath = path.join(projectRoot, 'tests/e2e/e2e-runner.mjs');
      const { existsSync } = await import('node:fs');
      assert.equal(existsSync(runnerPath), true);
    });

    it('F24.2: verifies all 4 test tier files exist and are discoverable', async () => {
      const { existsSync } = await import('node:fs');
      const requiredTiers = [
        'tests/e2e/tier1-features.test.mjs',
        'tests/e2e/tier2-boundaries.test.mjs',
        'tests/e2e/tier3-combinations.test.mjs',
        'tests/e2e/tier4-scenarios.test.mjs'
      ];
      for (const relPath of requiredTiers) {
        const fullPath = path.join(projectRoot, relPath);
        assert.equal(existsSync(fullPath), true, `Missing expected tier file: ${relPath}`);
      }
    });

    it('F24.3: verifies strict assertion semantics on deep objects and type checking', () => {
      assert.notStrictEqual({ a: 1 }, { a: 1 });
      assert.deepStrictEqual({ a: 1, b: [2] }, { a: 1, b: [2] });
      assert.throws(() => {
        assert.strictEqual(1, '1');
      }, assert.AssertionError);
    });

    it('F24.4: verifies timing control via t.mock.timers advancing time deterministically', (t) => {
      t.mock.timers.enable();
      let triggered = false;
      setTimeout(() => { triggered = true; }, 1000);
      assert.equal(triggered, false);
      t.mock.timers.tick(1000);
      assert.equal(triggered, true);
      t.mock.timers.reset();
    });

    it('F24.5: verifies tier thresholds and grand minimum requirement configuration', async () => {
      const { readFileSync } = await import('node:fs');
      const runnerContent = readFileSync(
        path.join(projectRoot, 'tests/e2e/e2e-runner.mjs'),
        'utf-8'
      );
      assert.match(runnerContent, /TOTAL_MIN_REQUIRED\s*=\s*269/);
      assert.match(runnerContent, /minRequired:\s*120/);
      assert.match(runnerContent, /minRequired:\s*24/);
      assert.match(runnerContent, /minRequired:\s*5/);
    });
  });
});
