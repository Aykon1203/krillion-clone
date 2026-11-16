import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAnswer,
  levenshteinDistance,
  matchAnswer
} from '../src/js/normalizer.js';

test('normalizeAnswer: basic trimming and case-folding', () => {
  assert.equal(normalizeAnswer('  FRANCE  '), 'france');
  assert.equal(normalizeAnswer('Hydrogen'), 'hydrogen');
  assert.equal(normalizeAnswer('   '), '');
  assert.equal(normalizeAnswer(null), '');
  assert.equal(normalizeAnswer(undefined), '');
  assert.equal(normalizeAnswer(123), '');
});

test('normalizeAnswer: Unicode NFKD diacritics stripping', () => {
  assert.equal(normalizeAnswer('São Tomé and Príncipe'), 'sao tome and principe');
  assert.equal(normalizeAnswer("Côte d'Ivoire"), 'cote divoire');
  assert.equal(normalizeAnswer('Mötley Crüe'), 'motley crue');
  assert.equal(normalizeAnswer('curaçao'), 'curacao');
  assert.equal(normalizeAnswer('Zürich'), 'zurich');
});

test('normalizeAnswer: punctuation and apostrophe handling', () => {
  assert.equal(normalizeAnswer("O'Higgins"), 'ohiggins');
  assert.equal(normalizeAnswer("Saint-Louis"), 'saint louis');
  assert.equal(normalizeAnswer("U.S.A."), 'usa');
  assert.equal(normalizeAnswer("Spider-Man: No Way Home!"), 'spider man no way home');
  assert.equal(normalizeAnswer("Rock & Roll"), 'rock roll');
});

test('normalizeAnswer: leading English articles stripping', () => {
  assert.equal(normalizeAnswer('The Bahamas'), 'bahamas');
  assert.equal(normalizeAnswer('The United Kingdom'), 'united kingdom');
  assert.equal(normalizeAnswer('A Star Is Born'), 'star is born');
  assert.equal(normalizeAnswer('An American in Paris'), 'american in paris');
  // Article within word must NOT be stripped
  assert.equal(normalizeAnswer('Theater'), 'theater');
  assert.equal(normalizeAnswer('Theory of Relativity'), 'theory of relativity');
  assert.equal(normalizeAnswer('Anonymous'), 'anonymous');
});

test('normalizeAnswer: collapsing multiple whitespace', () => {
  assert.equal(normalizeAnswer('  Blue    Whale   '), 'blue whale');
  assert.equal(normalizeAnswer('the   great   barrier   reef'), 'great barrier reef');
});

test('levenshteinDistance: exact and basic operations', () => {
  assert.equal(levenshteinDistance('', ''), 0);
  assert.equal(levenshteinDistance('a', 'a'), 0);
  assert.equal(levenshteinDistance('cat', 'hat'), 1); // substitution
  assert.equal(levenshteinDistance('cat', 'cats'), 1); // insertion
  assert.equal(levenshteinDistance('cats', 'cat'), 1); // deletion
  assert.equal(levenshteinDistance('kitten', 'sitting'), 3);
});

test('levenshteinDistance: Damerau adjacent transposition', () => {
  // Transposition of adjacent characters costs 1
  assert.equal(levenshteinDistance('ca', 'ac'), 1);
  assert.equal(levenshteinDistance('liechtenstien', 'liechtenstein'), 1);
  assert.equal(levenshteinDistance('keyna', 'kenya'), 1);
});

test('matchAnswer: exact matches across tiers', () => {
  const tiers = {
    plankton: ['Iron', 'Oxygen'],
    too_clever: ['Hydrogen', 'Carbon'],
    schooler: ['Tin', 'Lead'],
    rare: ['Titanium', 'Bismuth'],
    deep_cut: ['Gallium', 'Astatine'],
    one_in_a_krillion: ['Praseodymium', 'Lutetium']
  };

  const res1 = matchAnswer('iron', tiers);
  assert.equal(res1.matched, true);
  assert.equal(res1.canonical, 'Iron');
  assert.equal(res1.tier, 'plankton');
  assert.equal(res1.distance, 0);

  const res2 = matchAnswer('  PRASEODYMIUM  ', tiers);
  assert.equal(res2.matched, true);
  assert.equal(res2.canonical, 'Praseodymium');
  assert.equal(res2.tier, 'one_in_a_krillion');
  assert.equal(res2.distance, 0);
});

test('matchAnswer: alias resolution', () => {
  const tiers = {
    plankton: ['United States', 'France'],
    deep_cut: ['Democratic Republic of the Congo']
  };
  const aliases = {
    usa: 'United States',
    us: 'United States',
    drc: 'Democratic Republic of the Congo'
  };

  const res1 = matchAnswer('U.S.A.', tiers, aliases);
  assert.equal(res1.matched, true);
  assert.equal(res1.canonical, 'United States');
  assert.equal(res1.tier, 'plankton');
  assert.equal(res1.distance, 0);

  const res2 = matchAnswer('DRC', tiers, aliases);
  assert.equal(res2.matched, true);
  assert.equal(res2.canonical, 'Democratic Republic of the Congo');
  assert.equal(res2.tier, 'deep_cut');
});

test('matchAnswer: depluralization fallback', () => {
  const tiers = {
    schooler: ['Blue Whale', 'Dolphin'],
    rare: ['Octopus', 'Fox']
  };

  const res1 = matchAnswer('dolphins', tiers);
  assert.equal(res1.matched, true);
  assert.equal(res1.canonical, 'Dolphin');
  assert.equal(res1.tier, 'schooler');

  const res2 = matchAnswer('foxes', tiers);
  assert.equal(res2.matched, true);
  assert.equal(res2.canonical, 'Fox');
  assert.equal(res2.tier, 'rare');

  const res3 = matchAnswer('octopi', tiers);
  assert.equal(res3.matched, true);
  assert.equal(res3.canonical, 'Octopus');
  assert.equal(res3.tier, 'rare');
});

test('matchAnswer: typo tolerance rules', () => {
  const tiers = {
    plankton: ['Iran', 'Iraq', 'Mali', 'Bali'],
    schooler: ['Kenya', 'France', 'Dolphin'],
    deep_cut: ['Liechtenstein', 'Praseodymium']
  };

  // Length <= 4: exact only! Typos are strictly rejected
  const resShort = matchAnswer('Irak', tiers); // dist 1 from Iraq, but length is 4
  assert.equal(resShort.matched, false);

  // Target length <= 4: 5-letter typo inputs rejected
  assert.equal(matchAnswer('irani', tiers).matched, false);
  assert.equal(matchAnswer('iraqi', tiers).matched, false);
  assert.equal(matchAnswer('irony', { plankton: ['Iron'] }).matched, false);
  assert.equal(matchAnswer('golde', { plankton: ['Gold'] }).matched, false);

  // Length 5-7: max distance 1 allowed
  const resMid = matchAnswer('keyna', tiers); // dist 1 from Kenya (length 5)
  assert.equal(resMid.matched, true);
  assert.equal(resMid.canonical, 'Kenya');
  assert.equal(resMid.distance, 1);

  // Length 5-7: distance 2 rejected (e.g. Uranium 7-char rejected with 8-char urannimm)
  const resMidFail = matchAnswer('franzee', tiers); // dist 2 from France
  assert.equal(resMidFail.matched, false);
  assert.equal(matchAnswer('urannimm', { rare: ['Uranium'] }).matched, false);

  // Length >= 8: max distance 2 allowed (e.g. Astatine 8-char accepted with 7-char astaten)
  const resLong = matchAnswer('praseodimium', tiers); // dist 1 from Praseodymium
  assert.equal(resLong.matched, true);
  assert.equal(resLong.canonical, 'Praseodymium');

  const resLong2 = matchAnswer('liechtenstien', tiers); // dist 1 (transposition)
  assert.equal(resLong2.matched, true);
  assert.equal(resLong2.canonical, 'Liechtenstein');

  const resAstatine = matchAnswer('astaten', { deep_cut: ['Astatine'] });
  assert.equal(resAstatine.matched, true);
  assert.equal(resAstatine.canonical, 'Astatine');
  assert.equal(resAstatine.distance, 2);
});

test('matchAnswer: tie-breaking prefers lower tier for integrity', () => {
  // If an input has same distance to words in different tiers, lower tier wins
  const tiers = {
    plankton: ['testing'],
    one_in_a_krillion: ['testong']
  };

  const res = matchAnswer('testung', tiers); // dist 1 to both testing and testong
  assert.equal(res.matched, true);
  assert.equal(res.tier, 'plankton');
  assert.equal(res.canonical, 'testing');
});

test('matchAnswer: programming language symbols C#, C++, and C evaluate distinctly', () => {
  const tiers = {
    plankton: ['C++', 'C'],
    schooler: ['C#'],
    rare: ['F#']
  };
  const aliases = {
    cpp: 'C++',
    csharp: 'C#'
  };

  const resC = matchAnswer('C', tiers, aliases);
  assert.equal(resC.matched, true);
  assert.equal(resC.canonical, 'C');
  assert.equal(resC.tier, 'plankton');

  const resCpp = matchAnswer('C++', tiers, aliases);
  assert.equal(resCpp.matched, true);
  assert.equal(resCpp.canonical, 'C++');
  assert.equal(resCpp.tier, 'plankton');

  const resCppAlias = matchAnswer('cpp', tiers, aliases);
  assert.equal(resCppAlias.matched, true);
  assert.equal(resCppAlias.canonical, 'C++');
  assert.equal(resCppAlias.tier, 'plankton');

  const resCSharp = matchAnswer('C#', tiers, aliases);
  assert.equal(resCSharp.matched, true);
  assert.equal(resCSharp.canonical, 'C#');
  assert.equal(resCSharp.tier, 'schooler');

  const resCSharpAlias = matchAnswer('csharp', tiers, aliases);
  assert.equal(resCSharpAlias.matched, true);
  assert.equal(resCSharpAlias.canonical, 'C#');
  assert.equal(resCSharpAlias.tier, 'schooler');

  const resFSharp = matchAnswer('f#', tiers, aliases);
  assert.equal(resFSharp.matched, true);
  assert.equal(resFSharp.canonical, 'F#');
  assert.equal(resFSharp.tier, 'rare');
});
