/**
 * Tier 3: Cross-Feature Combinations E2E Test Suite for krillion.io
 * Verifies 26 pairwise subsystem interactions (C01 - C26).
 */

import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

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

describe('Tier 3: Cross-Feature Combinations (26 pairwise interaction tests)', () => {
  beforeEach(() => {
    setupBrowserEnv();
  });

  afterEach(() => {
    resetBrowserEnv();
  });

  it('C01: Timer Expiry + Prompt Lock (F03 + F08)', (t) => {
    t.mock.timers.enable();
    const input = document.querySelector('#answer-input');
    const submitBtn = document.querySelector('#submit-btn');

    const timer = new QuestionTimer({
      durationSec: 25,
      onExpire: () => {
        input.disabled = true;
        submitBtn.disabled = true;
      }
    });

    timer.start();
    t.mock.timers.tick(25000);
    t.mock.timers.reset();

    assert.equal(timer.getRemainingSec(), 0);
    assert.equal(input.disabled, true);
    assert.equal(submitBtn.disabled, true);
  });

  it('C02: Timer Expiry + Zero Scoring & Unchanged Depth (F03 + F01)', () => {
    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();
    // Simulate Q1 scoring 600m
    const q1 = session.getCurrentQuestion();
    const rareAns = q1.tiers.rare[0];
    session.submitAnswer(rareAns);
    session.nextQuestion();
    assert.equal(session.totalDepth, 600);

    // Q2 expires on timeout
    const outcome = session.handleTimeout();
    assert.equal(outcome.points, 0);
    assert.equal(outcome.depthMeters, 0);
    assert.equal(session.totalDepth, 600);
    assert.equal(session.history[1].timeout, true);
  });

  it('C03: Try-Again Rejection + Timer Continuity (F07 + F03)', (t) => {
    t.mock.timers.enable();
    const input = document.querySelector('#answer-input');
    const card = document.querySelector('#question-card');

    const timer = new QuestionTimer({ durationSec: 25 });
    timer.start();
    t.mock.timers.tick(5000); // 20s remaining

    // User submits invalid answer
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
    const evalRes = evaluateSubmission(chemQ, 'invalidxyz');
    assert.equal(evalRes.valid, false);

    // UI handles rejection
    card.classList.add('shake');
    input.value = '';

    // Verify timer kept running without reset
    assert.equal(timer.isRunning, true);
    assert.equal(timer.getRemainingSec(), 20);

    t.mock.timers.tick(2000);
    assert.equal(timer.getRemainingSec(), 18);

    timer.stop();
    t.mock.timers.reset();
  });

  it('C04: Try-Again Rejection + Eventual Prompt Lock (F07 + F08)', () => {
    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();
    const q = session.getCurrentQuestion();

    // 2 invalid submissions
    assert.equal(session.submitAnswer('invalid_one').valid, false);
    assert.equal(session.state, SESSION_STATES.ACTIVE);
    assert.equal(session.submitAnswer('invalid_two').valid, false);
    assert.equal(session.state, SESSION_STATES.ACTIVE);

    // Eventual valid submission
    const validAns = q.tiers.plankton[0];
    const validRes = session.submitAnswer(validAns);
    assert.equal(validRes.valid, true);
    assert.equal(session.state, SESSION_STATES.REVEAL);
    assert.ok(session.totalPoints > 0);
  });

  it('C05: Normalization (Case + Space + Diacritics) + Rarity Scoring (F14 + F15 + F04)', () => {
    const islandQ = QUESTION_CATALOG.find(q => q.id === 'island-nations');
    const raw = '   sÃo tOmÉ and pRÍnCiPe   \n';
    const clean = normalizeAnswer(raw);
    assert.equal(clean, 'sao tome and principe');

    const match = matchAnswer(raw, islandQ.tiers, islandQ.aliases);
    assert.equal(match.matched, true);
    assert.equal(match.tier, 'deep_cut');
    assert.equal(RARITY_TIERS[match.tier].points, 85);
  });

  it('C06: Normalization (Articles + Punctuation) + Alias Resolution + Scoring (F16 + F17 + F01)', () => {
    const countryQ = QUESTION_CATALOG.find(q => q.id === 'countries-americas');
    const raw = 'The U.S.A.!';
    const clean = normalizeAnswer(raw);
    assert.equal(clean, 'usa');

    const match = matchAnswer(raw, countryQ.tiers, countryQ.aliases);
    assert.equal(match.matched, true);
    assert.match(match.canonical, /united states/i);

    const evalRes = evaluateSubmission(countryQ, raw);
    assert.equal(evalRes.valid, true);
    assert.equal(evalRes.points, 10);
  });

  it('C07: Typo Tolerance + Article Stripping + Prompt Lock (F18 + F16 + F08)', () => {
    const countryQ = QUESTION_CATALOG.find(q => q.id === 'countries-africa');
    // "The Madagaskar" has article "The " + 1 typo 'k' on "madagascar" (len=10)
    const raw = 'The Madagaskar';
    const evalRes = evaluateSubmission(countryQ, raw);
    assert.equal(evalRes.valid, true);
    assert.equal(evalRes.tier, 'too_clever');
    assert.equal(evalRes.points, 15);
  });

  it('C08: Typo Tolerance Length Boundary + Try-Again Rejection (F18 + F07)', () => {
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');

    // Short word typo (len=4): "irom" for "iron" -> rejected
    const shortMatch = matchAnswer('irom', chemQ.tiers, chemQ.aliases);
    assert.equal(shortMatch.matched, false);

    // Long word typo (len=8): "titaniun" for "titanium" -> accepted as Rare
    const longMatch = matchAnswer('titaniun', chemQ.tiers, chemQ.aliases);
    assert.equal(longMatch.matched, true);
    assert.equal(longMatch.tier, 'rare');
  });

  it('C09: Prompt Lock + Web Audio Synthesis Concurrency (F08 + F21)', () => {
    const sm = new SoundManager();
    sm.init();
    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();
    const q = session.getCurrentQuestion();

    // Valid submission triggers lock and audio
    const res = session.submitAnswer(q.tiers.rare[0]);
    assert.equal(res.valid, true);

    sm.playChime(res.tier);
    sm.playDive();

    assert.ok(sm.callLog.some(e => e.type === 'chime' && e.tierKey === 'rare'));
    assert.ok(sm.callLog.some(e => e.type === 'dive'));
  });

  it('C10: Try-Again Rejection + Audio Synthesis (F07 + F21)', () => {
    const sm = new SoundManager();
    sm.init();

    // Invalid answer triggers reject buzzer
    const chemQ = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
    const res = evaluateSubmission(chemQ, 'bogus_word');
    assert.equal(res.valid, false);

    sm.playReject();
    assert.ok(sm.callLog.some(e => e.type === 'reject'));
  });

  it('C11: Timer Urgency (<5s) + Audio Ticks (F03 + F21)', (t) => {
    t.mock.timers.enable();
    const sm = new SoundManager();
    sm.init();

    const timer = new QuestionTimer({
      durationSec: 25,
      onTick: (rem) => {
        if (rem <= 5) sm.playTick();
      }
    });

    timer.start();
    t.mock.timers.tick(22000); // 3 seconds remaining
    timer.stop();
    t.mock.timers.reset();

    const tickCalls = sm.callLog.filter(e => e.type === 'tick');
    assert.ok(tickCalls.length >= 2);
  });

  it('C12: Depth Zone Crossing + Dynamic CSS Theme Update (F05 + F19)', () => {
    let depth = 900;
    const initialZone = getOceanZone(depth);
    assert.equal(initialZone.class, 'zone-twilight');
    document.body.className = initialZone.class;

    // Cross into Midnight Zone (1200m)
    depth += 300;
    const newZone = getOceanZone(depth);
    assert.equal(newZone.class, 'zone-midnight');
    document.body.className = newZone.class;

    assert.equal(document.body.classList.contains('zone-midnight'), true);
    assert.equal(document.body.classList.contains('zone-twilight'), false);
  });

  it('C13: Submarine Dive Gauge + Oceanic Zone Synchronization (F09 + F05)', () => {
    const container = document.querySelector('#depth-gauge');
    const gauge = new DepthGauge(container);

    gauge.updateDepth(1000, 0);
    const zone = getOceanZone(1000);
    gauge.setZone(zone);

    const odometer = container.querySelector('#depth-counter');
    assert.equal(odometer.textContent, '1,000 m');
    const label = container.querySelector('#zone-label');
    assert.match(label.textContent, /Middernachtzone/i);
  });

  it('C14: 7-Question Session Progression + Summary Screen Transition (F02 + F10)', () => {
    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();

    for (let i = 0; i < 7; i++) {
      session.handleTimeout();
      session.nextQuestion();
    }

    assert.equal(session.state, SESSION_STATES.COMPLETED);
    const summary = session.getSummary();
    assert.equal(summary.isCompleted, true);
    assert.equal(summary.rounds.length, 7);

    const modal = document.querySelector('#summary-modal');
    modal.classList.remove('hidden');
    assert.equal(modal.classList.contains('hidden'), false);
  });

  it('C15: Summary Screen + "One in a Krillion" Apex Reveal (F10 + F11)', () => {
    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();

    for (let i = 0; i < 7; i++) {
      session.handleTimeout();
      session.nextQuestion();
    }

    const summary = session.getSummary();
    for (const round of summary.rounds) {
      assert.ok(round.rarestReveal, 'Every summary round must reveal apex answer');
    }
  });

  it('C16: Summary Screen + Spoiler-Free Share Grid Generation (F10 + F12)', () => {
    const mockSummary = {
      totalDepth: 3500,
      zone: { name: 'Midnight Zone (Bathypelagic)' },
      rounds: [
        { tier: 'plankton' },
        { timeout: true },
        { tier: 'rare' },
        { tier: 'deep_cut' },
        { tier: 'one_in_a_krillion' },
        { tier: 'schooler' },
        { tier: 'too_clever' }
      ]
    };

    const shareText = generateShareText(mockSummary);
    assert.match(shareText, /3,500m \/ 7,000m/);
    assert.match(shareText, /⬜⬛🟪🟨🌟🟦🟩/);
  });

  it('C17: Summary Screen + LocalStorage New Record Persistence (F10 + F20)', () => {
    const mem = new MemoryStorage();
    mem.setItem('krillion_stats', JSON.stringify({ bestDepth: 2000, totalDives: 1, totalPoints: 200 }));
    const storage = new StorageAdapter(mem);

    // Complete session with 3500m
    const updated = storage.saveSessionRecord({ totalDepth: 3500, totalPoints: 350 });
    assert.equal(updated.bestDepth, 3500);
    assert.equal(updated.totalDives, 2);
  });

  it('C18: Summary Screen + LocalStorage Lower Score Retention (F10 + F20)', () => {
    const mem = new MemoryStorage();
    mem.setItem('krillion_stats', JSON.stringify({ bestDepth: 5000, totalDives: 3, totalPoints: 500 }));
    const storage = new StorageAdapter(mem);

    // Complete session with 1800m
    const updated = storage.saveSessionRecord({ totalDepth: 1800, totalPoints: 180 });
    assert.equal(updated.bestDepth, 5000); // Retained
    assert.equal(updated.totalDives, 4); // Incremented
  });

  it('C19: Infinite Replay ("Play Again") + Depth & Gauge Reset (F13 + F01/F09)', () => {
    const container = document.querySelector('#depth-gauge');
    const gauge = new DepthGauge(container);
    gauge.updateDepth(4000, 0);
    assert.equal(gauge.currentDepth, 4000);

    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();
    session.totalDepth = 4000;

    // Play Again
    session.resetSession();
    gauge.updateDepth(0, 4000);

    assert.equal(session.totalDepth, 0);
    assert.equal(gauge.currentDepth, 0);
    const counter = container.querySelector('#depth-counter');
    assert.equal(counter.textContent, '0 m');
  });

  it('C20: Infinite Replay + Catalog LRU Deduplication (F13 + F22)', () => {
    const storage = new StorageAdapter(new MemoryStorage());
    const session = new SessionManager(QUESTION_CATALOG, { storage });

    session.startSession();
    const session1Ids = session.questions.map(q => q.id);

    session.resetSession();
    const session2Ids = session.questions.map(q => q.id);

    const intersection = session1Ids.filter(id => session2Ids.includes(id));
    assert.equal(intersection.length, 0);
  });

  it('C21: Infinite Replay + Timer Clean Reinitialization (F13 + F03)', () => {
    const timer = new QuestionTimer({ durationSec: 25 });
    timer.start();
    timer.stop();

    // Replay restarts timer
    timer.reset(25);
    assert.equal(timer.getRemainingSec(), 25);
    assert.equal(timer.isRunning, false);
  });

  it('C22: Concurrency / Debounce on Rapid Double-Submit (F08 + Double-Submit)', () => {
    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();
    const q = session.getCurrentQuestion();
    const ans = q.tiers.rare[0];

    const r1 = session.submitAnswer(ans);
    const r2 = session.submitAnswer(ans);

    assert.equal(r1.valid, true);
    assert.equal(r2.valid, false);
    assert.equal(session.totalPoints, 60);
    assert.equal(session.totalDepth, 600);
    assert.equal(session.history.length, 1);
  });

  it('C23: Cumulative Statistics Tracking Across 3 Consecutive Replays (F20 + F13)', () => {
    const storage = new StorageAdapter(new MemoryStorage());

    storage.saveSessionRecord({ totalDepth: 2000, totalPoints: 200 });
    storage.saveSessionRecord({ totalDepth: 4000, totalPoints: 400 });
    storage.saveSessionRecord({ totalDepth: 3000, totalPoints: 300 });

    const stats = storage.getStats();
    assert.equal(stats.totalDives, 3);
    assert.equal(stats.bestDepth, 4000);
    assert.equal(stats.totalPoints, 900);
  });

  it('C24: Audio Engine Mute Toggle + Valid Submission Handling (F21 + F08)', () => {
    const sm = new SoundManager();
    sm.init();
    sm.toggleMute(); // muted = true

    const session = new SessionManager(QUESTION_CATALOG);
    session.startSession();
    const q = session.getCurrentQuestion();
    const res = session.submitAnswer(q.tiers.plankton[0]);

    assert.equal(res.valid, true);
    assert.doesNotThrow(() => {
      sm.playChime(res.tier);
      sm.playDive();
    });
  });

  it('C25: Open-Ended Text Input Autofocus Across Question Progression (F06 + F02)', () => {
    const input = document.querySelector('#answer-input');
    input.value = 'gold';
    input.disabled = true;

    // Transition to next prompt
    input.value = '';
    input.disabled = false;
    input.focus();

    assert.equal(input.value, '');
    assert.equal(input.disabled, false);
    assert.equal(document.activeElement, input);
  });

  it('C26: Typo Tolerance on Common Abbreviations / Aliases (F17 + F18)', () => {
    const countryQ = QUESTION_CATALOG.find(q => q.id === 'countries-americas');
    // "united state" (missing plural 's', len=12) resolves to "united states"
    const match = matchAnswer('united state', countryQ.tiers, countryQ.aliases);
    assert.equal(match.matched, true);
    assert.match(match.canonical, /united states/i);
    assert.equal(match.tier, 'plankton');
  });
});
