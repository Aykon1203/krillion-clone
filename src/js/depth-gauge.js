/**
 * Krillion Depth Gauge
 * Controls the vertical submarine descent rail, odometer display, and dynamic ocean zone styling.
 */

import { OCEAN_ZONES, getOceanZone } from './scoring.js';

export class DepthGauge {
  /**
   * @param {HTMLElement|object|null} containerEl - DOM container or mock element
   * @param {object} [options]
   * @param {number} [options.maxDepth=7000] - Maximum dive boundary in meters
   */
  constructor(containerEl = null, options = {}) {
    this.container = containerEl;
    this.maxDepth = Number(options?.maxDepth) || 7000;
    this.currentDepth = 0;
    this.targetDepth = 0;
    this.zone = null;
  }

  /**
   * Updates current depth and updates all attached visual DOM elements.
   *
   * @param {number} targetMeters - Target depth in meters
   * @param {number} [previousMeters=this.currentDepth] - Starting depth for animation
   * @returns {number} The updated depth in meters
   */
  updateDepth(targetMeters, previousMeters = this.currentDepth) {
    const rawTarget = Number(targetMeters) || 0;
    this.targetDepth = Math.max(0, Math.min(this.maxDepth, rawTarget));
    this.currentDepth = this.targetDepth;

    if (this.container) {
      const pct = (this.currentDepth / this.maxDepth) * 100;

      // 1. Update Submarine vessel position
      const vessel =
        typeof this.container.querySelector === 'function'
          ? this.container.querySelector('#submarine-icon') ||
            this.container.querySelector('.vessel') ||
            this.container.querySelector('.submarine')
          : null;

      if (vessel && vessel.style) {
        vessel.style.top = `${pct}%`;
        vessel.style.transform = `translateY(${pct}%)`;
      }

      // 2. Update Depth Odometer counter text
      const odometer =
        typeof this.container.querySelector === 'function'
          ? this.container.querySelector('#depth-counter') ||
            this.container.querySelector('.depth-counter') ||
            this.container.querySelector('.odometer')
          : null;

      if (odometer) {
        odometer.textContent = `${this.currentDepth.toLocaleString('en-US')} m`;
      }

      // 3. Update Depth Progress Rail fill
      const fill =
        typeof this.container.querySelector === 'function'
          ? this.container.querySelector('#depth-progress-fill') ||
            this.container.querySelector('.depth-track-fill')
          : null;

      if (fill && fill.style) {
        fill.style.height = `${pct}%`;
      }
    }

    // Automatically synchronize ocean zone based on updated depth
    const matchingZone = getOceanZone(this.currentDepth);
    this.setZone(matchingZone);

    return this.currentDepth;
  }

  /**
   * Sets the active ocean zone and synchronizes DOM zone classes and labels.
   *
   * @param {object|string} zone - Ocean zone object or zone name/class
   * @returns {object|null} The resolved ocean zone
   */
  setZone(zone) {
    if (!zone) return null;

    let zoneObj = zone;
    if (typeof zone === 'string') {
      zoneObj =
        OCEAN_ZONES.find((z) => z.class === zone || z.name === zone) || {
          name: zone,
          class: zone
        };
    }

    this.zone = zoneObj;

    // 1. Update Container elements if available
    if (this.container) {
      const label =
        typeof this.container.querySelector === 'function'
          ? this.container.querySelector('#zone-label') ||
            this.container.querySelector('.zone-label') ||
            this.container.querySelector('.zone-badge')
          : null;

      if (label && zoneObj.name) {
        label.textContent = zoneObj.name;
      }

      if (this.container.classList) {
        for (const z of OCEAN_ZONES) {
          if (z.class) this.container.classList.remove(z.class);
        }
        if (zoneObj.class) {
          this.container.classList.add(zoneObj.class);
        }
      }
    }

    // 2. Update document.body zone classes for global atmospheric styling
    if (
      typeof document !== 'undefined' &&
      document.body &&
      document.body.classList
    ) {
      for (const z of OCEAN_ZONES) {
        if (z.class) document.body.classList.remove(z.class);
      }
      if (zoneObj.class) {
        document.body.classList.add(zoneObj.class);
      }
    }

    return this.zone;
  }

  /**
   * Returns current depth in meters.
   * @returns {number}
   */
  getCurrentDepth() {
    return this.currentDepth;
  }

  /**
   * Returns current active ocean zone.
   * @returns {object}
   */
  getCurrentZone() {
    return this.zone || getOceanZone(this.currentDepth);
  }
}
