/**
 * Tier 4: Real-World Scenarios E2E Test Suite for krillion.io
 * Simulates 5 complete end-to-end player sessions (S01 - S05).
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

describe('Tier 4: Real-World Application Scenarios (5 complete gameplay sessions)', () => {
  beforeEach(() => {
    setupBrowserEnv();
  });

  afterEach(() => {
    resetBrowserEnv();
  });

  // ---------------------------------------------------------------------------
  // S01: The Apex Diver (7,000m Hadal Trench Legend Dive)
  // ---------------------------------------------------------------------------
  it('S01: The Apex Diver (7,000m Hadal Trench Legend Dive)', () => {
    const sm = new SoundManager();
    sm.init();
    const container = document.querySelector('#depth-gauge');
    const gauge = new DepthGauge(container);
    const storage = new StorageAdapter(new MemoryStorage());

    // Use catalog entries with verified apex tier answers
    const apexCatalog = QUESTION_CATALOG.filter(q =>
      q.tiers.one_in_a_krillion.some(a => matchAnswer(a, q.tiers, q.aliases).tier === 'one_in_a_krillion')
    );

    const session = new SessionManager(apexCatalog, { storage });
    session.startSession();

    // 7 questions, each answered with designated "one_in_a_krillion" apex answer
    for (let round = 0; round < 7; round++) {
      const q = session.getCurrentQuestion();
      const apexAns = q.tiers.one_in_a_krillion.find(a =>
        matchAnswer(a, q.tiers, q.aliases).tier === 'one_in_a_krillion'
      );

      const res = session.submitAnswer(apexAns);
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'one_in_a_krillion');
      assert.equal(res.points, 100);
      assert.equal(res.depthMeters, 1000);

      gauge.updateDepth(session.totalDepth, session.totalDepth - 1000);
      sm.playChime('one_in_a_krillion');
      sm.playDive();

      session.nextQuestion();
    }

    assert.equal(session.state, SESSION_STATES.COMPLETED);
    assert.equal(session.totalPoints, 700);
    assert.equal(session.totalDepth, 7000);

    const summary = session.getSummary();
    assert.equal(summary.isCompleted, true);
    assert.equal(summary.totalDepth, 7000);
    assert.equal(summary.totalPoints, 700);
    assert.equal(summary.zone.class, 'zone-hadal');
    assert.equal(summary.diverTitle, 'Eén op een Krillion Legende');
    assert.equal(summary.rounds.every(r => r.tier === 'one_in_a_krillion'), true);

    // Verify share grid
    const shareText = generateShareText(summary);
    assert.match(shareText, /7,000m \/ 7,000m/);
    assert.match(shareText, /🌟🌟🌟🌟🌟🌟🌟/);

    // Verify victory fanfare
    sm.playFanfare();
    assert.ok(sm.callLog.some(e => e.type === 'fanfare'));

    // Verify persistence
    const savedStats = storage.getStats();
    assert.equal(savedStats.bestDepth, 7000);
    assert.equal(savedStats.totalDives, 1);
  });

  // ---------------------------------------------------------------------------
  // S02: The Casual Surface Swimmer (Timeouts, Retries & Plankton)
  // ---------------------------------------------------------------------------
  it('S02: The Casual Surface Swimmer (Timeouts, Retries & Plankton)', () => {
    const sm = new SoundManager();
    sm.init();
    const container = document.querySelector('#depth-gauge');
    const gauge = new DepthGauge(container);
    const storage = new StorageAdapter(new MemoryStorage());

    const session = new SessionManager(QUESTION_CATALOG, { storage });
    session.startSession();

    // Round 1: Invalid retry, then Plankton (+10 pts / +100m)
    assert.equal(session.submitAnswer('cat').valid, false);
    sm.playReject();
    assert.equal(session.submitAnswer('dog').valid, false);
    const q1 = session.getCurrentQuestion();
    session.submitAnswer(q1.tiers.plankton[0]);
    session.nextQuestion();
    gauge.updateDepth(session.totalDepth, 0);

    // Round 2: Timeout (0 pts / 0m)
    session.handleTimeout();
    session.nextQuestion();

    // Round 3: Wrong input retry, then Schooler (+30 pts / +300m)
    assert.equal(session.submitAnswer('oxygen').valid, false);
    const q3 = session.getCurrentQuestion();
    session.submitAnswer(q3.tiers.schooler[0]);
    session.nextQuestion();
    gauge.updateDepth(session.totalDepth, 100);

    // Round 4: Timeout (0 pts / 0m)
    session.handleTimeout();
    session.nextQuestion();

    // Round 5: Too Clever (+15 pts / +150m)
    const q5 = session.getCurrentQuestion();
    session.submitAnswer(q5.tiers.too_clever[0]);
    session.nextQuestion();
    gauge.updateDepth(session.totalDepth, 400);

    // Round 6: Timeout (0 pts / 0m)
    session.handleTimeout();
    session.nextQuestion();

    // Round 7: Plankton (+10 pts / +100m)
    const q7 = session.getCurrentQuestion();
    session.submitAnswer(q7.tiers.plankton[0]);
    session.nextQuestion();
    gauge.updateDepth(session.totalDepth, 550);

    assert.equal(session.state, SESSION_STATES.COMPLETED);
    assert.equal(session.totalPoints, 65);
    assert.equal(session.totalDepth, 650);

    const summary = session.getSummary();
    assert.equal(summary.zone.class, 'zone-twilight');
    assert.equal(summary.diverTitle, 'Snorkelende Krill');

    // Verify 3 timeouts and 4 correct answers
    const timeouts = summary.rounds.filter(r => r.timeout);
    assert.equal(timeouts.length, 3);
    const correct = summary.rounds.filter(r => !r.timeout);
    assert.equal(correct.length, 4);

    // All rounds must provide rarest reveal for educational value
    assert.equal(summary.rounds.every(r => typeof r.rarestReveal === 'string'), true);

    // Verify share grid has 3 black squares
    const shareText = generateShareText(summary);
    assert.match(shareText, /650m \/ 7,000m/);
    assert.equal((shareText.match(/⬛/g) || []).length, 3);
  });

  // ---------------------------------------------------------------------------
  // S03: The Deep Cut Comeback Dive (Catastrophic Start -> Abyss Finish)
  // ---------------------------------------------------------------------------
  it('S03: The Deep Cut Comeback Dive (Catastrophic Start -> Abyss Finish)', () => {
    const container = document.querySelector('#depth-gauge');
    const gauge = new DepthGauge(container);
    const storage = new StorageAdapter(new MemoryStorage());

    const session = new SessionManager(QUESTION_CATALOG, { storage });
    session.startSession();

    // Prompts 1 & 2: Timeouts (0m)
    session.handleTimeout();
    session.nextQuestion();
    session.handleTimeout();
    session.nextQuestion();
    assert.equal(session.totalDepth, 0);
    assert.equal(getOceanZone(session.totalDepth).class, 'zone-sunlight');

    // Prompts 3 through 7: 5 consecutive Deep Cut answers (5 x 850m = 4,250m)
    for (let i = 2; i < 7; i++) {
      const q = session.getCurrentQuestion();
      const deepAns = q.tiers.deep_cut[0];
      const res = session.submitAnswer(deepAns);
      assert.equal(res.valid, true);
      assert.equal(res.tier, 'deep_cut');
      assert.equal(res.points, 85);
      session.nextQuestion();
      gauge.updateDepth(session.totalDepth, session.totalDepth - 850);
    }

    assert.equal(session.state, SESSION_STATES.COMPLETED);
    assert.equal(session.totalPoints, 425);
    assert.equal(session.totalDepth, 4250);

    const summary = session.getSummary();
    assert.equal(summary.zone.class, 'zone-abyss');
    assert.equal(summary.diverTitle, 'Afgronduitdager');

    // Verify rapid zone progression in second half
    assert.equal(getOceanZone(850).class, 'zone-twilight');
    assert.equal(getOceanZone(1700).class, 'zone-midnight');
    assert.equal(getOceanZone(4250).class, 'zone-abyss');

    const shareText = generateShareText(summary);
    assert.match(shareText, /4,250m \/ 7,000m/);
    assert.match(shareText, /⬛⬛🟨🟨🟨🟨🟨/);
  });

  // ---------------------------------------------------------------------------
  // S04: The Slang, Typo & Alias Stress-Test Diver
  // ---------------------------------------------------------------------------
  it('S04: The Slang, Typo & Alias Stress-Test Diver', () => {
    const qAfrica = QUESTION_CATALOG.find(q => q.id === 'countries-africa');
    const qChem = QUESTION_CATALOG.find(q => q.id === 'chem-elements');
    const qEurope = QUESTION_CATALOG.find(q => q.id === 'countries-europe');
    const qIsland = QUESTION_CATALOG.find(q => q.id === 'island-nations');
    const qAmericas = QUESTION_CATALOG.find(q => q.id === 'countries-americas');

    // Test 7 realistic messy mobile submissions
    // 1. Alias with spaces and dots
    const m1 = matchAnswer('   d.r.c.   ', qAfrica.tiers, qAfrica.aliases);
    assert.equal(m1.matched, true);

    // 2. Chemical symbol uppercase
    const m2 = matchAnswer('AU', qChem.tiers, qChem.aliases);
    assert.equal(m2.matched, true);
    assert.equal(m2.canonical.toLowerCase(), 'gold');

    // 3. Leading article and exclamation mark
    const m3 = matchAnswer('the netherlands!', qEurope.tiers, qEurope.aliases);
    assert.equal(m3.matched, true);

    // 4. Missing diacritics
    const m4 = matchAnswer('sao tome and principe', qIsland.tiers, qIsland.aliases);
    assert.equal(m4.matched, true);

    // 5. Single substitution typo on >=5 char word
    const m5 = matchAnswer('titaniun', qChem.tiers, qChem.aliases);
    assert.equal(m5.matched, true);
    assert.equal(m5.canonical.toLowerCase(), 'titanium');

    // 6. Typo on country name
    const m6 = matchAnswer('Madagaskar', qAfrica.tiers, qAfrica.aliases);
    assert.equal(m6.matched, true);

    // 7. Typo on apex word
    const m7 = matchAnswer('praseodynium', qChem.tiers, qChem.aliases);
    assert.equal(m7.matched, true);
    assert.equal(m7.tier, 'one_in_a_krillion');

    // Ensure zero false rejections across the entire messy input pipeline
    assert.ok(m1.matched && m2.matched && m3.matched && m4.matched && m5.matched && m6.matched && m7.matched);
  });

  // ---------------------------------------------------------------------------
  // S05: The Triple Marathon Replay Session (3 Back-to-Back 7-Question Dives)
  // ---------------------------------------------------------------------------
  it('S05: The Triple Marathon Replay Session (3 Back-to-Back 7-Question Dives)', () => {
    const storage = new StorageAdapter(new MemoryStorage());
    const session = new SessionManager(QUESTION_CATALOG, { storage });

    // === Session 1 ===
    session.startSession();
    assert.equal(session.questions.length, 7);
    const session1Ids = session.questions.map(q => q.id);

    // Answer with schooler tier (30 pts, 300m per question)
    for (let i = 0; i < 7; i++) {
      const q = session.getCurrentQuestion();
      session.submitAnswer(q.tiers.schooler[0]);
      session.nextQuestion();
    }
    assert.equal(session.state, SESSION_STATES.COMPLETED);
    assert.equal(session.totalDepth, 2100);
    assert.equal(session.totalPoints, 210);

    const stats1 = storage.getStats();
    assert.equal(stats1.totalDives, 1);
    assert.equal(stats1.bestDepth, 2100);

    // === Session 2 (Play Again) ===
    session.resetSession();
    assert.equal(session.totalDepth, 0); // Reset verified
    assert.equal(session.totalPoints, 0);
    assert.equal(session.currentIndex, 0);
    assert.equal(session.questions.length, 7);
    const session2Ids = session.questions.map(q => q.id);

    // Deduplication check: S1 and S2 must be completely disjoint
    const overlap12 = session1Ids.filter(id => session2Ids.includes(id));
    assert.equal(overlap12.length, 0, 'Session 2 must not repeat questions from Session 1');

    // Answer with deep_cut tier (85 pts, 850m per question = 5950m)
    for (let i = 0; i < 7; i++) {
      const q = session.getCurrentQuestion();
      session.submitAnswer(q.tiers.deep_cut[0]);
      session.nextQuestion();
    }
    assert.equal(session.state, SESSION_STATES.COMPLETED);
    assert.equal(session.totalDepth, 5950);

    const stats2 = storage.getStats();
    assert.equal(stats2.totalDives, 2);
    assert.equal(stats2.bestDepth, 5950); // Updated to new personal best

    // === Session 3 (Play Again) ===
    session.resetSession();
    assert.equal(session.totalDepth, 0); // Reset verified
    const session3Ids = session.questions.map(q => q.id);

    // Deduplication check: S3 must not repeat S2
    const overlap23 = session2Ids.filter(id => session3Ids.includes(id));
    assert.equal(overlap23.length, 0, 'Session 3 must not repeat questions from Session 2');

    // Answer with plankton tier (10 pts, 100m per question = 700m)
    for (let i = 0; i < 7; i++) {
      const q = session.getCurrentQuestion();
      session.submitAnswer(q.tiers.plankton[0]);
      session.nextQuestion();
    }
    assert.equal(session.state, SESSION_STATES.COMPLETED);
    assert.equal(session.totalDepth, 700);

    // Final marathon stat accumulation assertions
    const finalStats = storage.getStats();
    assert.equal(finalStats.totalDives, 3);
    assert.equal(finalStats.bestDepth, 5950); // High score preserved
    assert.equal(finalStats.totalPoints, 210 + 595 + 70); // 875 pts
  });
});
