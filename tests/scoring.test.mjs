import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RARITY_TIERS,
  OCEAN_ZONES,
  evaluateSubmission,
  getOceanZone,
  getDiverTitle
} from '../src/js/scoring.js';

const mockQuestion = {
  id: 'chem-elements',
  prompt: 'Name a chemical element',
  category: 'Science & Nature',
  timeLimitSec: 25,
  tiers: {
    plankton: ['Iron', 'Oxygen'],
    too_clever: ['Hydrogen', 'Carbon'],
    schooler: ['Tin', 'Lead'],
    rare: ['Titanium', 'Bismuth'],
    deep_cut: ['Gallium', 'Astatine'],
    one_in_a_krillion: ['Praseodymium', 'Lutetium']
  },
  aliases: {
    fe: 'Iron',
    pb: 'Lead',
    au: 'Gold'
  }
};

test('RARITY_TIERS: configuration and point-to-depth formula (P * 10)', () => {
  assert.equal(RARITY_TIERS.plankton.points, 10);
  assert.equal(RARITY_TIERS.plankton.depthMeters, 100);

  assert.equal(RARITY_TIERS.too_clever.points, 15);
  assert.equal(RARITY_TIERS.too_clever.depthMeters, 150);

  assert.equal(RARITY_TIERS.schooler.points, 30);
  assert.equal(RARITY_TIERS.schooler.depthMeters, 300);

  assert.equal(RARITY_TIERS.rare.points, 60);
  assert.equal(RARITY_TIERS.rare.depthMeters, 600);

  assert.equal(RARITY_TIERS.deep_cut.points, 85);
  assert.equal(RARITY_TIERS.deep_cut.depthMeters, 850);

  assert.equal(RARITY_TIERS.one_in_a_krillion.points, 100);
  assert.equal(RARITY_TIERS.one_in_a_krillion.depthMeters, 1000);

  // Formula check for all tiers: depthMeters === points * 10
  for (const tier of Object.values(RARITY_TIERS)) {
    assert.equal(tier.depthMeters, tier.points * 10);
  }
});

test('evaluateSubmission: evaluates all 6 tiers properly', () => {
  const tests = [
    { input: 'iron', expectedTier: 'plankton', pts: 10, depth: 100 },
    { input: 'hydrogen', expectedTier: 'too_clever', pts: 15, depth: 150 },
    { input: 'tin', expectedTier: 'schooler', pts: 30, depth: 300 },
    { input: 'titanium', expectedTier: 'rare', pts: 60, depth: 600 },
    { input: 'gallium', expectedTier: 'deep_cut', pts: 85, depth: 850 },
    { input: 'praseodymium', expectedTier: 'one_in_a_krillion', pts: 100, depth: 1000 }
  ];

  for (const t of tests) {
    const res = evaluateSubmission(mockQuestion, t.input);
    assert.equal(res.valid, true);
    assert.equal(res.tier, t.expectedTier);
    assert.equal(res.points, t.pts);
    assert.equal(res.depthMeters, t.depth);
    assert.equal(res.badge, `tier-${t.expectedTier.replace(/_/g, '-')}`);
  }
});

test('evaluateSubmission: alias matching', () => {
  const res = evaluateSubmission(mockQuestion, 'fe');
  assert.equal(res.valid, true);
  assert.equal(res.canonical, 'Iron');
  assert.equal(res.tier, 'plankton');
  assert.equal(res.points, 10);
  assert.equal(res.depthMeters, 100);
});

test('evaluateSubmission: invalid input returns 0 pts and 0m depth', () => {
  const invalidInputs = ['', 'banana', 'xyz123', '   '];
  for (const input of invalidInputs) {
    const res = evaluateSubmission(mockQuestion, input);
    assert.equal(res.valid, false);
    assert.equal(res.points, 0);
    assert.equal(res.depthMeters, 0);
    assert.equal(res.badge, null);
  }
});

test('OCEAN_ZONES: boundaries and progression', () => {
  assert.equal(OCEAN_ZONES.length, 5);

  assert.equal(getOceanZone(0).name, 'Zonlichtzone (Epipelagisch)');
  assert.equal(getOceanZone(199).name, 'Zonlichtzone (Epipelagisch)');

  assert.equal(getOceanZone(200).name, 'Schemerzone (Mesopelagisch)');
  assert.equal(getOceanZone(999).name, 'Schemerzone (Mesopelagisch)');

  assert.equal(getOceanZone(1000).name, 'Middernachtzone (Bathypelagisch)');
  assert.equal(getOceanZone(3999).name, 'Middernachtzone (Bathypelagisch)');

  assert.equal(getOceanZone(4000).name, 'De Afgrond (Abyssopelagisch)');
  assert.equal(getOceanZone(5999).name, 'De Afgrond (Abyssopelagisch)');

  assert.equal(getOceanZone(6000).name, 'De Hadale Trog (Hadalpelagisch)');
  assert.equal(getOceanZone(7000).name, 'De Hadale Trog (Hadalpelagisch)');
  assert.equal(getOceanZone(8500).name, 'De Hadale Trog (Hadalpelagisch)');
});

test('getDiverTitle: rank progression according to depth milestones', () => {
  assert.equal(getDiverTitle(0), 'Drijvend Plankton');
  assert.equal(getDiverTitle(150), 'Drijvend Plankton');

  assert.equal(getDiverTitle(200), 'Snorkelende Krill');
  assert.equal(getDiverTitle(900), 'Snorkelende Krill');

  assert.equal(getDiverTitle(1000), 'Onderzeebootverkenner');
  assert.equal(getDiverTitle(2400), 'Onderzeebootverkenner');

  assert.equal(getDiverTitle(2500), 'Bathysfeer-navigator');
  assert.equal(getDiverTitle(3800), 'Bathysfeer-navigator');

  assert.equal(getDiverTitle(4000), 'Afgronduitdager');
  assert.equal(getDiverTitle(5200), 'Afgronduitdager');

  assert.equal(getDiverTitle(5500), 'Trogveroveraar');
  assert.equal(getDiverTitle(6400), 'Trogveroveraar');

  assert.equal(getDiverTitle(6500), 'Eén op een Krillion Legende');
  assert.equal(getDiverTitle(7000), 'Eén op een Krillion Legende');
});
