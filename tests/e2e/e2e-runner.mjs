/**
 * Master E2E Test Runner for krillion.io
 * Aggregates and verifies Tiers 1-4 using Node.js v24 native test runner.
 * Command: node tests/e2e/e2e-runner.mjs
 */

import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TIERS = [
  { tier: 1, name: 'Tier 1: Feature Coverage', file: path.join(__dirname, 'tier1-features.test.mjs'), minRequired: 120 },
  { tier: 2, name: 'Tier 2: Boundary & Corner Cases', file: path.join(__dirname, 'tier2-boundaries.test.mjs'), minRequired: 120 },
  { tier: 3, name: 'Tier 3: Cross-Feature Combinations', file: path.join(__dirname, 'tier3-combinations.test.mjs'), minRequired: 24 },
  { tier: 4, name: 'Tier 4: Real-World Scenarios', file: path.join(__dirname, 'tier4-scenarios.test.mjs'), minRequired: 5 }
];

export const TOTAL_MIN_REQUIRED = 269;

/**
 * Pure evaluation function for runner thresholds and exit status.
 *
 * @param {Map} tierStatsMap
 * @param {number} totalMinRequired
 * @returns {{ allThresholdsMet: boolean, totalTrackedPassed: number, totalTrackedFailed: number, exitCode: number }}
 */
export function evaluateRunnerOutcome(tierStatsMap, totalMinRequired = TOTAL_MIN_REQUIRED) {
  let allThresholdsMet = true;
  let totalTrackedPassed = 0;
  let totalTrackedFailed = 0;

  for (const stat of tierStatsMap.values()) {
    const thresholdMet = stat.passed >= stat.minRequired && stat.failed === 0;
    if (!thresholdMet) allThresholdsMet = false;
    totalTrackedPassed += stat.passed;
    totalTrackedFailed += stat.failed;
  }

  const grandThresholdMet = totalTrackedPassed >= totalMinRequired && totalTrackedFailed === 0;
  if (!grandThresholdMet) allThresholdsMet = false;

  return {
    allThresholdsMet,
    totalTrackedPassed,
    totalTrackedFailed,
    exitCode: allThresholdsMet ? 0 : 1
  };
}

export function runMasterSuite() {
  const tierStats = new Map();
  for (const t of TIERS) {
    tierStats.set(t.file, { ...t, passed: 0, failed: 0, total: 0 });
  }

  console.log('========================================================================');
  console.log('              KRILLION.IO DUAL-TRACK E2E TEST HARNESS                   ');
  console.log('  Executing Tiers 1-4 sequentially via Node.js v24 native test runner   ');
  console.log('========================================================================\n');

  const runnerStream = run({
    files: TIERS.map(t => t.file),
    concurrency: 1 // Strictly sequential to guarantee zero DOM/timer state leakage
  });

  // Only count leaf tests; exclude suites and do not count skipped/todo tests as passed
  runnerStream.on('test:pass', (d) => {
    if (d.file && tierStats.has(d.file) && d.details?.type === 'test' && !d.skip && !d.todo) {
      const s = tierStats.get(d.file);
      s.passed++;
      s.total++;
    }
  });

  // Only count leaf test failures to prevent suite nesting double-counting
  runnerStream.on('test:fail', (d) => {
    if (d.file && tierStats.has(d.file) && d.details?.type === 'test') {
      const s = tierStats.get(d.file);
      s.failed++;
      s.total++;
    }
  });

  // Stream standard spec output
  runnerStream.compose(new spec()).pipe(process.stdout);

  runnerStream.on('test:summary', (s) => {
    if (s.file) return; // Process only the final top-level aggregation

    console.log('\n========================================================================');
    console.log('              KRILLION.IO E2E TEST EXECUTION SUMMARY                    ');
    console.log('========================================================================');

    const outcome = evaluateRunnerOutcome(tierStats, TOTAL_MIN_REQUIRED);

    for (const stat of tierStats.values()) {
      const thresholdMet = stat.passed >= stat.minRequired && stat.failed === 0;
      const statusTag = thresholdMet ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${statusTag}  ${stat.name.padEnd(38)} Passed: ${String(stat.passed).padStart(3)} / Min: ${String(stat.minRequired).padStart(3)} | Failed: ${String(stat.failed).padStart(2)}`);
    }

    console.log('------------------------------------------------------------------------');
    console.log(`  Total Tests Executed : ${outcome.totalTrackedPassed + outcome.totalTrackedFailed}`);
    console.log(`  Total Passed         : ${outcome.totalTrackedPassed} (Required: >= ${TOTAL_MIN_REQUIRED})`);
    console.log(`  Total Failed         : ${outcome.totalTrackedFailed}`);
    console.log(`  Suites Completed     : ${s.counts.suites || TIERS.length}`);
    console.log(`  Overall Duration     : ${(s.duration_ms).toFixed(2)}ms`);
    console.log('========================================================================');

    if (!outcome.allThresholdsMet || s.counts.failed > 0 || (s.counts.skipped && s.counts.skipped > 0)) {
      console.error('\n❌ E2E SUITE FAILED: Detected test failures or unmet coverage thresholds.\n');
      process.exitCode = 1;
    } else {
      console.log('\n✅ 100% E2E PASS RATE: All 4 tiers satisfied all coverage and integrity requirements.\n');
      process.exitCode = 0;
    }
  });

  return runnerStream;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMasterSuite();
}
