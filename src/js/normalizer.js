/**
 * Krillion Normalizer Engine
 * Handles answer string normalization, Levenshtein distance,
 * alias resolution, depluralization, and bounded typo tolerance.
 */

export const TIER_RANK = {
  plankton: 0,
  too_clever: 1,
  schooler: 2,
  rare: 3,
  deep_cut: 4,
  one_in_a_krillion: 5
};

export const IRREGULAR_PLURALS = {
  octopi: 'octopus',
  octopuses: 'octopus',
  cacti: 'cactus',
  fungi: 'fungus',
  geese: 'goose',
  mice: 'mouse',
  teeth: 'tooth',
  feet: 'foot'
};

/**
 * Normalizes user input:
 * - Trims whitespace and converts to lowercase
 * - NFKD Unicode decomposition with diacritics stripping
 * - Strips apostrophes (e.g. O'Higgins -> ohiggins)
 * - Converts hyphens/underscores to spaces
 * - Strips non-alphanumeric punctuation
 * - Strips leading English articles (the, a, an)
 * - Collapses consecutive whitespace
 *
 * @param {string} input - Raw user input
 * @returns {string} Normalized string
 */
export function normalizeAnswer(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])\+\+/gi, '$1 plus plus ')
    .replace(/([a-z0-9])\+/gi, '$1 plus ')
    .replace(/([a-z0-9])#/gi, '$1 sharp ')
    .replace(/['’`]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/^(de|het|een|the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates Damerau-Levenshtein distance between two strings,
 * supporting insertion, deletion, substitution, and transposition of adjacent characters.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;

  const al = a.length;
  const bl = b.length;
  const d = Array.from({ length: al + 1 }, () => new Int32Array(bl + 1));

  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost  // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[al][bl];
}

/**
 * Matches a raw input against question answer tiers and alias maps.
 *
 * Matching pipeline:
 * 1. Normalize input.
 * 2. Alias map lookup.
 * 3. Exact match across tiers.
 * 4. Depluralization fallback (s, es, irregulars).
 * 5. Bounded typo tolerance:
 *    - Length <= 4: exact only (distance 0)
 *    - Length 5-7: max distance 1
 *    - Length >= 8: max distance 2
 *
 * @param {string} rawInput
 * @param {Record<string, string[]>} questionTiers
 * @param {Record<string, string>} [aliases={}]
 * @returns {{ matched: boolean, canonical: string | null, tier: string | null, distance: number }}
 */
export function matchAnswer(rawInput, questionTiers = {}, aliases = {}) {
  const normalized = normalizeAnswer(rawInput);
  if (!normalized) {
    return { matched: false, canonical: null, tier: null, distance: Infinity };
  }

  // Pre-index tiers by normalized string for O(1) exact lookup
  const exactMap = new Map();
  const allEntries = [];

  for (const [tierKey, items] of Object.entries(questionTiers)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const normItem = normalizeAnswer(item);
      if (normItem) {
        if (!exactMap.has(normItem)) {
          exactMap.set(normItem, { canonical: item, tier: tierKey });
        }
        allEntries.push({ canonical: item, norm: normItem, tier: tierKey });
      }
    }
  }

  // 1. Alias lookup
  for (const [aliasKey, targetCanonical] of Object.entries(aliases)) {
    const normAlias = normalizeAnswer(aliasKey);
    if (normalized === normAlias) {
      // Find tier for targetCanonical
      const normTarget = normalizeAnswer(targetCanonical);
      const tierInfo = exactMap.get(normTarget);
      return {
        matched: true,
        canonical: tierInfo ? tierInfo.canonical : targetCanonical,
        tier: tierInfo ? tierInfo.tier : 'plankton',
        distance: 0
      };
    }
  }

  // 2. Exact match against question tiers
  if (exactMap.has(normalized)) {
    const entry = exactMap.get(normalized);
    return {
      matched: true,
      canonical: entry.canonical,
      tier: entry.tier,
      distance: 0
    };
  }

  // 3. Depluralization fallback
  const stems = [];
  if (IRREGULAR_PLURALS[normalized]) {
    stems.push(IRREGULAR_PLURALS[normalized]);
  }
  if (normalized.length > 3 && normalized.endsWith('s')) {
    if (normalized.endsWith('es') && normalized.length > 4) {
      stems.push(normalized.slice(0, -2));
    }
    stems.push(normalized.slice(0, -1));
  }

  for (const stem of stems) {
    // Check aliases for stem
    for (const [aliasKey, targetCanonical] of Object.entries(aliases)) {
      if (stem === normalizeAnswer(aliasKey)) {
        const normTarget = normalizeAnswer(targetCanonical);
        const tierInfo = exactMap.get(normTarget);
        return {
          matched: true,
          canonical: tierInfo ? tierInfo.canonical : targetCanonical,
          tier: tierInfo ? tierInfo.tier : 'plankton',
          distance: 0
        };
      }
    }
    // Check exact map for stem
    if (exactMap.has(stem)) {
      const entry = exactMap.get(stem);
      return {
        matched: true,
        canonical: entry.canonical,
        tier: entry.tier,
        distance: 0
      };
    }
  }

  // 4. Bounded Typo Tolerance
  // Length <= 4: exact only (distance 0)
  // Length 5-7: max distance 1
  // Length >= 8: max distance 2
  if (normalized.length <= 4) {
    return { matched: false, canonical: null, tier: null, distance: Infinity };
  }

  const candidates = [];

  // Check all entries in question tiers
  for (const entry of allEntries) {
    if (entry.norm.length <= 4) continue;
    const maxAllowedDist = entry.norm.length <= 7 ? 1 : 2;
    // Optimization: skip distance calculation if length difference exceeds maxAllowedDist
    if (Math.abs(normalized.length - entry.norm.length) > maxAllowedDist) {
      continue;
    }
    const dist = levenshteinDistance(normalized, entry.norm);
    if (dist <= maxAllowedDist) {
      const rank = TIER_RANK[entry.tier] ?? 99;
      candidates.push({
        canonical: entry.canonical,
        tier: entry.tier,
        distance: dist,
        rank
      });
    }
  }

  // Also check aliases for typo tolerance
  for (const [aliasKey, targetCanonical] of Object.entries(aliases)) {
    const normAlias = normalizeAnswer(aliasKey);
    if (normAlias.length <= 4) continue;
    const maxAllowedDist = normAlias.length <= 7 ? 1 : 2;
    if (Math.abs(normalized.length - normAlias.length) > maxAllowedDist) {
      continue;
    }
    const dist = levenshteinDistance(normalized, normAlias);
    if (dist <= maxAllowedDist) {
      const normTarget = normalizeAnswer(targetCanonical);
      const tierInfo = exactMap.get(normTarget);
      const tier = tierInfo ? tierInfo.tier : 'plankton';
      const rank = TIER_RANK[tier] ?? 99;
      candidates.push({
        canonical: tierInfo ? tierInfo.canonical : targetCanonical,
        tier,
        distance: dist,
        rank
      });
    }
  }

  if (candidates.length > 0) {
    // Sort by: 1) lowest distance first, 2) lower tier rank (integrity)
    candidates.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.rank - b.rank;
    });

    const best = candidates[0];
    return {
      matched: true,
      canonical: best.canonical,
      tier: best.tier,
      distance: best.distance
    };
  }

  return { matched: false, canonical: null, tier: null, distance: Infinity };
}
