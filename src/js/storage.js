/**
 * Krillion Storage Adapter
 * Abstraction layer for localStorage with graceful in-memory fallback.
 */

export class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

export class StorageAdapter {
  /**
   * @param {Storage|null} [storageBackend=null] - Optional custom storage backend
   */
  constructor(storageBackend = null) {
    if (storageBackend) {
      this.backend = storageBackend;
    } else {
      try {
        if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage !== null) {
          const testKey = '__krillion_storage_test__';
          globalThis.localStorage.setItem(testKey, testKey);
          globalThis.localStorage.removeItem(testKey);
          this.backend = globalThis.localStorage;
        } else {
          this.backend = new MemoryStorage();
        }
      } catch {
        this.backend = new MemoryStorage();
      }
    }
  }

  /**
   * Loads accumulated player stats.
   * @returns {{ totalDives: number, bestDepth: number, totalPoints: number, history: any[] }}
   */
  getStats() {
    try {
      const data = this.backend.getItem('krillion_stats');
      if (data) {
        const parsed = JSON.parse(data);
        return {
          totalDives: parsed.totalDives ?? 0,
          bestDepth: parsed.bestDepth ?? 0,
          totalPoints: parsed.totalPoints ?? 0,
          history: Array.isArray(parsed.history) ? parsed.history : []
        };
      }
    } catch {
      // Ignore parse error and return defaults
    }

    return {
      totalDives: 0,
      bestDepth: 0,
      totalPoints: 0,
      history: []
    };
  }

  /**
   * Saves a completed 7-question session record into cumulative stats.
   * @param {object} record
   * @returns {object} Updated stats
   */
  saveSessionRecord(record = {}) {
    const current = this.getStats();
    const updated = {
      totalDives: (current.totalDives || 0) + 1,
      bestDepth: Math.max(current.bestDepth || 0, record.totalDepth || 0),
      totalPoints: (current.totalPoints || 0) + (record.totalPoints || 0),
      history: [record, ...(current.history || [])].slice(0, 50)
    };

    try {
      this.backend.setItem('krillion_stats', JSON.stringify(updated));
    } catch {
      // Graceful fallback if storage fails/quota exceeded
    }

    return updated;
  }

  /**
   * Loads user settings.
   * @returns {{ soundEnabled: boolean, highContrast: boolean }}
   */
  getSettings() {
    try {
      const data = this.backend.getItem('krillion_settings');
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Ignore parse error and return defaults
    }

    return {
      soundEnabled: true,
      highContrast: false
    };
  }

  /**
   * Saves user settings.
   * @param {object} settings
   * @returns {object} Updated settings
   */
  saveSettings(settings = {}) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    try {
      this.backend.setItem('krillion_settings', JSON.stringify(updated));
    } catch {
      // Storage quota or error
    }
    return updated;
  }

  /**
   * Retrieves list of recently asked question IDs for LRU deduplication.
   * @returns {string[]}
   */
  getRecentQuestionIds() {
    try {
      const data = this.backend.getItem('krillion_recent_questions');
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback
    }
    return [];
  }

  /**
   * Saves list of recently asked question IDs.
   * @param {string[]} ids
   */
  saveRecentQuestionIds(ids = []) {
    try {
      this.backend.setItem('krillion_recent_questions', JSON.stringify(ids));
    } catch {
      // Storage quota or error
    }
  }
}
