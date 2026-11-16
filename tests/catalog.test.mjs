import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_CATALOG } from '../src/data/questions.js';
import { evaluateSubmission } from '../src/js/scoring.js';
import { matchAnswer } from '../src/js/normalizer.js';

test('Catalog integrity: QUESTION_CATALOG has at least 60 questions', () => {
  assert.equal(QUESTION_CATALOG.length, 60);
});

test('Catalog integrity: zero duplicate answers across tiers within any question', () => {
  for (const q of QUESTION_CATALOG) {
    const seen = new Map();
    for (const [tier, answers] of Object.entries(q.tiers)) {
      for (const ans of answers) {
        const normalizedAns = ans.trim().toLowerCase();
        assert.equal(
          seen.has(normalizedAns),
          false,
          `Question [${q.id}] has duplicate answer "${ans}" in both ${seen.get(normalizedAns)} and ${tier}`
        );
        seen.set(normalizedAns, tier);
      }
    }
  }
});

test('Catalog integrity: every declared answer in every question evaluates to its declared tier', () => {
  for (const q of QUESTION_CATALOG) {
    for (const [declaredTier, answers] of Object.entries(q.tiers)) {
      for (const ans of answers) {
        const result = evaluateSubmission(q, ans);
        assert.equal(
          result.valid,
          true,
          `Question [${q.id}] answer "${ans}" failed validation`
        );
        assert.equal(
          result.tier,
          declaredTier,
          `Question [${q.id}] answer "${ans}" evaluated to tier "${result.tier}", expected declared tier "${declaredTier}"`
        );
      }
    }
  }
});

test('Catalog integrity: every question apex reveal answer evaluates to one_in_a_krillion', () => {
  for (const q of QUESTION_CATALOG) {
    assert.ok(
      Array.isArray(q.tiers.one_in_a_krillion) && q.tiers.one_in_a_krillion.length > 0,
      `Question [${q.id}] missing one_in_a_krillion tier items`
    );
    const apex = q.tiers.one_in_a_krillion[0];
    const result = evaluateSubmission(q, apex);
    assert.equal(
      result.valid,
      true,
      `Question [${q.id}] apex reveal "${apex}" must be valid`
    );
    assert.equal(
      result.tier,
      'one_in_a_krillion',
      `Question [${q.id}] apex reveal "${apex}" evaluated to "${result.tier}", expected "one_in_a_krillion"`
    );
    assert.equal(
      result.points,
      100,
      `Question [${q.id}] apex reveal "${apex}" must award 100 points`
    );
    assert.equal(
      result.depthMeters,
      1000,
      `Question [${q.id}] apex reveal "${apex}" must reach 1000m depth`
    );
  }
});

test('Typo tolerance boundary: short words (<= 4 chars) require exact match only', () => {
  const tiers = {
    plankton: ['Iron', 'Gold', 'Iran', 'Iraq']
  };

  // Distance 1 inputs on <= 4 char words must NOT match
  assert.equal(matchAnswer('irony', tiers).matched, false);
  assert.equal(matchAnswer('golde', tiers).matched, false);
  assert.equal(matchAnswer('irani', tiers).matched, false);
  assert.equal(matchAnswer('iraqi', tiers).matched, false);

  // Exact match must still succeed
  assert.equal(matchAnswer('Iron', tiers).matched, true);
  assert.equal(matchAnswer('iron', tiers).matched, true);
  assert.equal(matchAnswer('Gold', tiers).matched, true);
  assert.equal(matchAnswer('Iran', tiers).matched, true);
  assert.equal(matchAnswer('Iraq', tiers).matched, true);
});

test('Typo tolerance boundary: 7-character target words reject distance 2 while 8-character target words accept distance 2', () => {
  const chemQuestion = QUESTION_CATALOG.find((q) => q.id === 'chem-elements');
  assert.ok(chemQuestion, 'chem-elements question must exist');

  // Uranium is 7 characters (norm: "uranium"). Input "urannimm" has distance 2: MUST BE REJECTED.
  const resUranium = evaluateSubmission(chemQuestion, 'urannimm');
  assert.equal(
    resUranium.valid,
    false,
    'Distance 2 input "urannimm" on 7-character target word "Uranium" must be rejected'
  );

  // Astatine is 8 characters (norm: "astatine"). Input "astaten" has distance 2: MUST BE ACCEPTED.
  const resAstatine = evaluateSubmission(chemQuestion, 'astaten');
  assert.equal(
    resAstatine.valid,
    true,
    'Distance 2 input "astaten" on 8-character target word "Astatine" must be accepted'
  );
  assert.equal(
    resAstatine.canonical,
    'Astatine',
    'Canonical match for "astaten" must be "Astatine"'
  );
  assert.equal(
    resAstatine.tier,
    'deep_cut',
    'Tier for "Astatine" must be "deep_cut"'
  );
});

test('Catalog regression: programming language symbols C#, C++, and C evaluate distinctly', () => {
  const progQuestion = QUESTION_CATALOG.find((q) => q.id === 'prog-languages');
  assert.ok(progQuestion, 'prog-languages question must exist');

  // C evaluates to plankton
  const resC = evaluateSubmission(progQuestion, 'C');
  assert.equal(resC.valid, true);
  assert.equal(resC.canonical, 'C');
  assert.equal(resC.tier, 'plankton');

  // C++ evaluates to plankton
  const resCpp = evaluateSubmission(progQuestion, 'C++');
  assert.equal(resCpp.valid, true);
  assert.equal(resCpp.canonical, 'C++');
  assert.equal(resCpp.tier, 'plankton');

  // cpp alias evaluates to C++ (plankton)
  const resCppAlias = evaluateSubmission(progQuestion, 'cpp');
  assert.equal(resCppAlias.valid, true);
  assert.equal(resCppAlias.canonical, 'C++');
  assert.equal(resCppAlias.tier, 'plankton');

  // C# evaluates to schooler
  const resCSharp = evaluateSubmission(progQuestion, 'C#');
  assert.equal(resCSharp.valid, true);
  assert.equal(resCSharp.canonical, 'C#');
  assert.equal(resCSharp.tier, 'schooler');

  // csharp alias evaluates to C# (schooler)
  const resCSharpAlias = evaluateSubmission(progQuestion, 'csharp');
  assert.equal(resCSharpAlias.valid, true);
  assert.equal(resCSharpAlias.canonical, 'C#');
  assert.equal(resCSharpAlias.tier, 'schooler');

  // c sharp evaluates to C# (schooler)
  const resCSharpSpace = evaluateSubmission(progQuestion, 'c sharp');
  assert.equal(resCSharpSpace.valid, true);
  assert.equal(resCSharpSpace.canonical, 'C#');
  assert.equal(resCSharpSpace.tier, 'schooler');
});
