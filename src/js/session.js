/**
 * Krillion Session Manager
 * Orchestrates 7-question sequential game sessions, finite state machine transitions,
 * answer evaluation & prompt locking, score/depth accumulation, and infinite replay with LRU deduplication.
 */

import { evaluateSubmission, getOceanZone, getDiverTitle } from './scoring.js';
import { StorageAdapter } from './storage.js';

export const SESSION_STATES = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  REVEAL: 'REVEAL',
  COMPLETED: 'COMPLETED'
};

export class SessionManager {
  /**
   * @param {object[]} catalog - Array of QuestionDefinition objects
   * @param {object} [options={}]
   * @param {StorageAdapter} [options.storage] - Storage adapter instance
   */
  constructor(catalog = [], { storage = null } = {}) {
    this.catalog = Array.isArray(catalog) ? [...catalog] : [];
    this.storage = storage || new StorageAdapter();

    this.state = SESSION_STATES.IDLE;
    this.questions = [];
    this.currentIndex = 0;
    this.totalPoints = 0;
    this.totalDepth = 0;
    this.history = [];
    this.mode = 'endless';
  }

  /**
   * Starts a new 7-question session.
   * Uses LRU shuffle bag deduplication in endless mode.
   *
   * @param {'endless'|'daily'} [mode='endless']
   * @returns {object|null} The first question
   */
  startSession(mode = 'endless') {
    this.mode = mode;
    this.totalPoints = 0;
    this.totalDepth = 0;
    this.history = [];
    this.currentIndex = 0;

    const sessionLength = Math.min(this.catalog.length, 7);
    if (sessionLength === 0) {
      this.questions = [];
      this.state = SESSION_STATES.COMPLETED;
      return null;
    }

    // Select questions
    this.questions = this._selectQuestions(sessionLength);
    this.state = SESSION_STATES.ACTIVE;

    return this.getCurrentQuestion();
  }

  /**
   * Selects non-repeating questions using LRU history from storage.
   * @private
   */
  _selectQuestions(count) {
    if (this.catalog.length <= count) {
      return this._shuffle([...this.catalog]);
    }

    let recentIds = this.storage ? this.storage.getRecentQuestionIds() : [];
    let eligible = this.catalog.filter(q => !recentIds.includes(q.id));

    // If not enough eligible questions, evict oldest recent IDs until count is met
    while (eligible.length < count && recentIds.length > 0) {
      recentIds.shift(); // remove oldest
      eligible = this.catalog.filter(q => !recentIds.includes(q.id));
    }

    const shuffled = this._shuffle([...eligible]);
    const chosen = shuffled.slice(0, count);

    // Update recent IDs with newly chosen IDs (capped to 28 questions)
    const newRecent = [...recentIds, ...chosen.map(q => q.id)].slice(-28);
    if (this.storage) {
      this.storage.saveRecentQuestionIds(newRecent);
    }

    return chosen;
  }

  /**
   * Fisher-Yates array shuffle.
   * @private
   */
  _shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Returns current active question or null.
   * @returns {object|null}
   */
  getCurrentQuestion() {
    if (this.currentIndex >= 0 && this.currentIndex < this.questions.length) {
      return this.questions[this.currentIndex];
    }
    return null;
  }

  /**
   * Submits an answer for the active prompt.
   * Valid answers immediately lock the prompt, transition to REVEAL, and award points & depth.
   * Invalid answers do NOT lock prompt, leaving state as ACTIVE so the user can retry.
   *
   * @param {string} rawInput
   * @returns {object} Evaluation result
   */
  submitAnswer(rawInput) {
    if (this.state !== SESSION_STATES.ACTIVE) {
      return {
        valid: false,
        error: `Cannot submit answer in state: ${this.state}`,
        points: 0,
        depthMeters: 0
      };
    }

    const currentQ = this.getCurrentQuestion();
    if (!currentQ) {
      return { valid: false, points: 0, depthMeters: 0 };
    }

    const evalResult = evaluateSubmission(currentQ, rawInput);

    if (evalResult.valid) {
      // Valid answer: immediately lock prompt and transition to REVEAL
      this.state = SESSION_STATES.REVEAL;
      this.totalPoints += evalResult.points;
      this.totalDepth += evalResult.depthMeters;

      const rarestReveal = currentQ.tiers?.one_in_a_krillion?.[0] || null;

      this.history.push({
        questionIndex: this.currentIndex,
        questionId: currentQ.id,
        prompt: currentQ.prompt,
        category: currentQ.category,
        submittedAnswer: rawInput,
        canonical: evalResult.canonical,
        tier: evalResult.tier,
        points: evalResult.points,
        depthMeters: evalResult.depthMeters,
        badge: evalResult.badge,
        distance: evalResult.distance,
        timeout: false,
        rarestReveal
      });
    }

    return evalResult;
  }

  /**
   * Handles per-prompt timer expiration (0 seconds remaining).
   * Awards 0 points / 0m depth, locks prompt, and transitions to REVEAL.
   *
   * @returns {object} Timeout outcome
   */
  handleTimeout() {
    if (this.state !== SESSION_STATES.ACTIVE) {
      return { timeout: false, points: 0, depthMeters: 0 };
    }

    const currentQ = this.getCurrentQuestion();
    this.state = SESSION_STATES.REVEAL;

    const rarestReveal = currentQ?.tiers?.one_in_a_krillion?.[0] || null;

    this.history.push({
      questionIndex: this.currentIndex,
      questionId: currentQ?.id ?? '',
      prompt: currentQ?.prompt ?? '',
      category: currentQ?.category ?? '',
      submittedAnswer: null,
      canonical: null,
      tier: null,
      points: 0,
      depthMeters: 0,
      badge: null,
      distance: null,
      timeout: true,
      rarestReveal
    });

    return {
      timeout: true,
      points: 0,
      depthMeters: 0
    };
  }

  /**
   * Moves to the next prompt, or transitions to COMPLETED if all 7 questions finished.
   *
   * @returns {object|null} Next question, or null if session completed
   */
  nextQuestion() {
    if (this.state !== SESSION_STATES.REVEAL) {
      return null;
    }

    this.currentIndex++;

    if (this.currentIndex < this.questions.length) {
      this.state = SESSION_STATES.ACTIVE;
      return this.getCurrentQuestion();
    }

    // All questions completed
    this.state = SESSION_STATES.COMPLETED;
    const summary = this.getSummary();
    if (this.storage) {
      this.storage.saveSessionRecord(summary);
    }
    return null;
  }

  /**
   * Resets session and begins a new 7-question dive immediately.
   *
   * @returns {object|null} First question of new session
   */
  resetSession() {
    return this.startSession(this.mode);
  }

  /**
   * Returns a snapshot of the current state machine state.
   * @returns {object}
   */
  getState() {
    return {
      state: this.state,
      questionIndex: this.currentIndex,
      totalQuestions: this.questions.length,
      currentQuestion: this.getCurrentQuestion(),
      totalPoints: this.totalPoints,
      totalDepth: this.totalDepth,
      currentZone: getOceanZone(this.totalDepth),
      diverTitle: getDiverTitle(this.totalDepth),
      history: [...this.history]
    };
  }

  /**
   * Returns end-of-session summary breakdown and statistics.
   * @returns {object}
   */
  getSummary() {
    return {
      totalDepth: this.totalDepth,
      totalPoints: this.totalPoints,
      zone: getOceanZone(this.totalDepth),
      diverTitle: getDiverTitle(this.totalDepth),
      rounds: [...this.history],
      isCompleted: this.state === SESSION_STATES.COMPLETED
    };
  }
}
