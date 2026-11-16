/**
 * Krillion Scoring Engine
 * Defines rarity tiers, depth calculation, oceanic zones, and diver rank titles.
 */

import { matchAnswer } from './normalizer.js';

export const RARITY_TIERS = {
  plankton: { name: 'Plankton', points: 10, depthMeters: 100, badge: 'tier-plankton' },
  too_clever: { name: 'Te Slim Bedacht', points: 15, depthMeters: 150, badge: 'tier-too-clever' },
  schooler: { name: 'Schoolvis', points: 30, depthMeters: 300, badge: 'tier-schooler' },
  rare: { name: 'Zeldzaam', points: 60, depthMeters: 600, badge: 'tier-rare' },
  deep_cut: { name: 'Diepzeevonk', points: 85, depthMeters: 850, badge: 'tier-deep-cut' },
  one_in_a_krillion: { name: 'Eén op een Krillion', points: 100, depthMeters: 1000, badge: 'tier-one-in-a-krillion' }
};

export const OCEAN_ZONES = [
  { name: 'Zonlichtzone (Epipelagisch)', minDepth: 0, maxDepth: 200, class: 'zone-sunlight' },
  { name: 'Schemerzone (Mesopelagisch)', minDepth: 200, maxDepth: 1000, class: 'zone-twilight' },
  { name: 'Middernachtzone (Bathypelagisch)', minDepth: 1000, maxDepth: 4000, class: 'zone-midnight' },
  { name: 'De Afgrond (Abyssopelagisch)', minDepth: 4000, maxDepth: 6000, class: 'zone-abyss' },
  { name: 'De Hadale Trog (Hadalpelagisch)', minDepth: 6000, maxDepth: 7000, class: 'zone-hadal' }
];

export const DIVER_TITLES = [
  { minDepth: 0, title: 'Drijvend Plankton' },
  { minDepth: 200, title: 'Snorkelende Krill' },
  { minDepth: 1000, title: 'Onderzeebootverkenner' },
  { minDepth: 2500, title: 'Bathysfeer-navigator' },
  { minDepth: 4000, title: 'Afgronduitdager' },
  { minDepth: 5500, title: 'Trogveroveraar' },
  { minDepth: 6500, title: 'Eén op een Krillion Legende' }
];

/**
 * Evaluates a user submission against a question's tiers and aliases.
 *
 * @param {object} question - Question definition
 * @param {string} rawInput - Raw text typed by user
 * @returns {{
 *   valid: boolean,
 *   canonical: string | null,
 *   tier: string | null,
 *   points: number,
 *   depthMeters: number,
 *   badge: string | null,
 *   distance: number
 * }}
 */
export function evaluateSubmission(question, rawInput) {
  if (!question || !question.tiers) {
    return {
      valid: false,
      canonical: null,
      tier: null,
      points: 0,
      depthMeters: 0,
      badge: null,
      distance: Infinity
    };
  }

  const match = matchAnswer(rawInput, question.tiers, question.aliases || {});

  if (!match.matched || !match.tier || !RARITY_TIERS[match.tier]) {
    return {
      valid: false,
      canonical: null,
      tier: null,
      points: 0,
      depthMeters: 0,
      badge: null,
      distance: match.distance
    };
  }

  const tierConfig = RARITY_TIERS[match.tier];

  return {
    valid: true,
    canonical: match.canonical,
    tier: match.tier,
    points: tierConfig.points,
    depthMeters: tierConfig.depthMeters,
    badge: tierConfig.badge,
    distance: match.distance
  };
}

/**
 * Returns the matching ocean zone object based on cumulative depth in meters.
 *
 * @param {number} depthMeters
 * @returns {object} Ocean zone object
 */
export function getOceanZone(depthMeters) {
  const depth = Math.max(0, depthMeters || 0);

  if (depth < 200) return OCEAN_ZONES[0];
  if (depth < 1000) return OCEAN_ZONES[1];
  if (depth < 4000) return OCEAN_ZONES[2];
  if (depth < 6000) return OCEAN_ZONES[3];
  return OCEAN_ZONES[4]; // Hadal Trench (6000m - 7000m+)
}

/**
 * Returns diver rank title based on cumulative depth in meters.
 *
 * @param {number} depthMeters
 * @returns {string} Diver title
 */
export function getDiverTitle(depthMeters) {
  const depth = Math.max(0, depthMeters || 0);

  // Traverse descending from highest rank
  for (let i = DIVER_TITLES.length - 1; i >= 0; i--) {
    if (depth >= DIVER_TITLES[i].minDepth) {
      return DIVER_TITLES[i].title;
    }
  }

  return DIVER_TITLES[0].title;
}
