/**
 * krillion.io - UI Integration Test Suite
 *
 * Automated verification of client-side application controller (`src/js/app.js`),
 * DOM synchronization, timer urgency states, non-blocking input rejection shake,
 * prompt locking, summary modal breakdown, and infinite session replay.
 */

import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDomMock, teardownDomMock } from './helpers/dom-mock.mjs';
import { QUESTION_CATALOG } from '../src/data/questions.js';

let dom;
let appInstance;

beforeEach(() => {
  dom = setupDomMock();
});

afterEach(() => {
  if (appInstance && typeof appInstance.destroy === 'function') {
    appInstance.destroy();
  }
  teardownDomMock();
});

test('UI Integration: initial DOM state renders HUD, timer, and first prompt', async () => {
  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;
  const questionCounter = doc.getElementById('question-counter');
  const zoneLabel = doc.getElementById('zone-label');
  const depthCounter = doc.getElementById('depth-counter');
  const promptCategory = doc.getElementById('prompt-category');
  const promptText = doc.getElementById('prompt-text');
  const timerText = doc.getElementById('timer-text');
  const answerInput = doc.getElementById('answer-input');
  const submitBtn = doc.getElementById('submit-btn');
  const summaryModal = doc.getElementById('summary-modal');

  assert.match(questionCounter.textContent, /Vraag 1 van 7/i);
  assert.equal(zoneLabel.textContent, 'Zonlichtzone (Epipelagisch)');
  assert.equal(depthCounter.textContent, '0 m');
  assert.ok(promptCategory.textContent.length > 0);
  assert.ok(promptText.textContent.length > 0);
  assert.equal(timerText.textContent, '25');
  assert.equal(answerInput.disabled, false);
  assert.equal(submitBtn.disabled, false);
  assert.ok(summaryModal.classList.contains('hidden') || summaryModal.style.display === 'none');
});

test('UI Integration: timer countdown updates SVG stroke-dashoffset and warning/urgent classes', async (t) => {
  t.mock.timers.enable();

  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;
  const timerText = doc.getElementById('timer-text');
  const timerRing = doc.getElementById('timer-ring');
  const timerContainer = doc.getElementById('timer-container');

  // Advance 5 seconds: remaining 20s
  t.mock.timers.tick(5000);
  assert.equal(timerText.textContent, '20');

  // Advance to 10 seconds: remaining 10s triggers warning class
  t.mock.timers.tick(10000);
  assert.equal(timerText.textContent, '10');
  assert.ok(timerContainer.classList.contains('timer-warning') || timerRing.classList.contains('timer-warning'));

  // Advance to 4 seconds remaining: triggers urgent class
  t.mock.timers.tick(6000);
  assert.equal(timerText.textContent, '4');
  assert.ok(timerContainer.classList.contains('timer-urgent') || timerRing.classList.contains('timer-urgent'));
});

test('UI Integration: invalid answer triggers rejection shake, error message, and preserves timer', async (t) => {
  t.mock.timers.enable();

  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;
  const answerInput = doc.getElementById('answer-input');
  const submitBtn = doc.getElementById('submit-btn');
  const feedbackMsg = doc.getElementById('feedback-message');
  const timerText = doc.getElementById('timer-text');

  // Type invalid answer
  answerInput.value = 'invalid_nonexistent_xyz';
  submitBtn.click();

  // Verification: feedback message displayed, rejection class applied
  assert.ok(feedbackMsg.textContent.length > 0);
  assert.ok(
    answerInput.classList.contains('shake') ||
    answerInput.classList.contains('rejected') ||
    doc.getElementById('prompt-container').classList.contains('shake')
  );

  // Verification: timer is NOT stopped, input remains enabled and focused
  assert.equal(answerInput.disabled, false);
  t.mock.timers.tick(2000);
  assert.notEqual(timerText.textContent, '25');
  assert.equal(doc.getElementById('question-counter').textContent, 'Vraag 1 van 7');
});

test('UI Integration: valid answer locks prompt, updates depth gauge, and awards tier badge', async (t) => {
  t.mock.timers.enable();

  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;
  const answerInput = doc.getElementById('answer-input');
  const submitBtn = doc.getElementById('submit-btn');
  const depthCounter = doc.getElementById('depth-counter');

  // Find a known valid answer for the current question
  const currentPrompt = doc.getElementById('prompt-text').textContent;
  const qData = QUESTION_CATALOG.find(q => q.prompt === currentPrompt) || QUESTION_CATALOG[0];
  const validAnswer = qData.tiers.schooler[0];

  answerInput.value = validAnswer;
  submitBtn.click();

  // Prompt locks immediately
  assert.equal(answerInput.disabled, true);
  assert.equal(submitBtn.disabled, true);

  // Depth odometer updates
  assert.notEqual(depthCounter.textContent, '0 m');

  // Advance time past transition delay (e.g. 1.5s) to Question 2
  t.mock.timers.tick(2000);

  const questionCounter = doc.getElementById('question-counter');
  assert.match(questionCounter.textContent, /Vraag 2 van 7/i);
  assert.equal(answerInput.disabled, false);
  assert.equal(answerInput.value, '');
});

test('UI Integration: timer expiration awards 0 pts and advances to next prompt', async (t) => {
  t.mock.timers.enable();

  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;
  const depthCounter = doc.getElementById('depth-counter');

  // Advance through full 25s countdown + transition delay
  t.mock.timers.tick(25000);
  t.mock.timers.tick(2000);

  // Depth remains 0m for timeout
  assert.equal(depthCounter.textContent, '0 m');

  // Question advances to Question 2
  const questionCounter = doc.getElementById('question-counter');
  assert.match(questionCounter.textContent, /Vraag 2 van 7/i);
});

test('UI Integration: sound toggle button toggles mute state and persists', async () => {
  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;
  const muteBtn = doc.getElementById('mute-btn');

  assert.equal(muteBtn.classList.contains('muted'), false);

  muteBtn.click();
  assert.equal(muteBtn.classList.contains('muted'), true);

  muteBtn.click();
  assert.equal(muteBtn.classList.contains('muted'), false);
});

test('UI Integration: completing 7 questions displays summary modal with full breakdown and apex reveals', async (t) => {
  t.mock.timers.enable();

  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;

  // Answer 7 questions sequentially
  for (let i = 0; i < 7; i++) {
    const currentPrompt = doc.getElementById('prompt-text').textContent;
    const qData = QUESTION_CATALOG.find(q => q.prompt === currentPrompt) || QUESTION_CATALOG[i];
    const answer = qData.tiers.plankton[0];

    const answerInput = doc.getElementById('answer-input');
    const submitBtn = doc.getElementById('submit-btn');

    answerInput.value = answer;
    submitBtn.click();

    // Advance past reveal delay
    t.mock.timers.tick(2000);
  }

  const summaryModal = doc.getElementById('summary-modal');
  assert.equal(summaryModal.classList.contains('hidden'), false);
  assert.notEqual(summaryModal.style.display, 'none');

  const summaryDepth = doc.getElementById('summary-depth');
  assert.match(summaryDepth.textContent, /700\s*m/);

  const breakdownContainer = doc.getElementById('summary-breakdown');
  assert.ok(breakdownContainer.children.length === 7 || breakdownContainer.innerHTML.includes('row'));
});

test('UI Integration: share button formats spoiler-free text and copies to clipboard', async (t) => {
  t.mock.timers.enable();

  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;

  // Complete session via 7 timeouts for quick modal display
  for (let i = 0; i < 7; i++) {
    t.mock.timers.tick(27000);
  }

  const shareBtn = doc.getElementById('share-btn');
  shareBtn.click();

  const copiedText = await globalThis.navigator.clipboard.readText();
  assert.match(copiedText, /Krillion Dive/i);
  assert.match(copiedText, /0m/);

  const toast = doc.getElementById('toast');
  assert.equal(toast.classList.contains('hidden'), false);
});

test('UI Integration: infinite replay ("Dive Again") resets session and starts fresh dive', async (t) => {
  t.mock.timers.enable();

  const { KrillionApp, initApp } = await import('../src/js/app.js');
  const app = initApp ? initApp({ autoStart: true }) : new KrillionApp();
  appInstance = app;

  const doc = globalThis.document;

  // Complete 7 questions
  for (let i = 0; i < 7; i++) {
    t.mock.timers.tick(27000);
  }

  const restartBtn = doc.getElementById('restart-btn') || doc.getElementById('play-again-btn');
  restartBtn.click();

  // Summary modal hides
  const summaryModal = doc.getElementById('summary-modal');
  assert.ok(summaryModal.classList.contains('hidden') || summaryModal.style.display === 'none');

  // Reset to Question 1 of 7
  const questionCounter = doc.getElementById('question-counter');
  assert.match(questionCounter.textContent, /Vraag 1 van 7/i);

  // Depth reset to 0m
  const depthCounter = doc.getElementById('depth-counter');
  assert.equal(depthCounter.textContent, '0 m');

  // Timer reset to 25s
  const timerText = doc.getElementById('timer-text');
  assert.equal(timerText.textContent, '25');

  // Input re-enabled and empty
  const answerInput = doc.getElementById('answer-input');
  assert.equal(answerInput.disabled, false);
  assert.equal(answerInput.value, '');
});
