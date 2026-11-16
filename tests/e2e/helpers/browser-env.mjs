/**
 * Zero-dependency headless browser simulation for krillion.io E2E testing.
 * Implements W3C DOM and Web API shims on top of Node.js v24 native primitives.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// 1. Mock LocalStorage with error injection hooks
export class MockLocalStorage {
  constructor() {
    this._store = new Map();
    this._throwQuota = false;
    this._throwSecurity = false;
  }

  get length() {
    return this._store.size;
  }

  key(index) {
    return Array.from(this._store.keys())[index] || null;
  }

  getItem(key) {
    if (this._throwSecurity) {
      throw new Error('SecurityError: The operation is insecure.');
    }
    const val = this._store.get(String(key));
    return val !== undefined ? val : null;
  }

  setItem(key, value) {
    if (this._throwSecurity) {
      throw new Error('SecurityError: The operation is insecure.');
    }
    if (this._throwQuota) {
      throw new Error('QuotaExceededError: The quota has been exceeded.');
    }
    this._store.set(String(key), String(value));
  }

  removeItem(key) {
    if (this._throwSecurity) {
      throw new Error('SecurityError: The operation is insecure.');
    }
    this._store.delete(String(key));
  }

  clear() {
    if (this._throwSecurity) {
      throw new Error('SecurityError: The operation is insecure.');
    }
    this._store.clear();
  }

  __simulateQuotaExceeded(enabled = true) {
    this._throwQuota = enabled;
  }

  __simulateSecurityError(enabled = true) {
    this._throwSecurity = enabled;
  }
}

// 2. Mock Web Audio Engine
export class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.events = [];
  }

  setValueAtTime(val, time) {
    this.events.push({ type: 'setValueAtTime', val, time });
    this.value = val;
    return this;
  }

  exponentialRampToValueAtTime(val, time) {
    this.events.push({ type: 'exponentialRamp', val, time });
    this.value = val;
    return this;
  }

  linearRampToValueAtTime(val, time) {
    this.events.push({ type: 'linearRamp', val, time });
    this.value = val;
    return this;
  }
}

export class MockAudioNode {
  constructor(type) {
    this.nodeType = type;
    this.connections = [];
  }

  connect(dest) {
    this.connections.push(dest);
    return dest;
  }

  disconnect() {
    this.connections = [];
  }
}

export class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super('oscillator');
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
    this.stopped = false;
    this.startTime = 0;
    this.stopTime = 0;
  }

  start(when = 0) {
    this.started = true;
    this.startTime = when;
  }

  stop(when = 0) {
    this.stopped = true;
    this.stopTime = when;
  }
}

export class MockGainNode extends MockAudioNode {
  constructor() {
    super('gain');
    this.gain = new MockAudioParam(1);
  }
}

export class MockAudioContext {
  constructor() {
    this.state = 'suspended'; // Standard browser autoplay policy default
    this.currentTime = 0;
    this.destination = new MockAudioNode('destination');
    this.createdNodes = [];
  }

  async resume() {
    this.state = 'running';
  }

  async suspend() {
    this.state = 'suspended';
  }

  async close() {
    this.state = 'closed';
  }

  createOscillator() {
    const node = new MockOscillatorNode();
    this.createdNodes.push(node);
    return node;
  }

  createGain() {
    const node = new MockGainNode();
    this.createdNodes.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new MockAudioNode('biquadFilter');
    node.frequency = new MockAudioParam(1000);
    node.Q = new MockAudioParam(1);
    this.createdNodes.push(node);
    return node;
  }
}

// 3. Mock Clipboard
export class MockClipboard {
  constructor() {
    this.text = '';
  }

  async writeText(str) {
    this.text = String(str);
  }

  async readText() {
    return this.text;
  }
}

// 4. Style & ClassList Helpers
export function createFakeStyle() {
  const map = new Map();
  const target = {
    setProperty: (k, v) => map.set(k, String(v)),
    getPropertyValue: (k) => map.get(k) || ''
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return map.get(prop) || '';
    },
    set(t, prop, val) {
      map.set(prop, String(val));
      return true;
    }
  });
}

export class FakeClassList {
  constructor(el) {
    this._el = el;
  }

  get _classes() {
    return new Set(this._el.className.trim().split(/\s+/).filter(Boolean));
  }

  add(...classes) {
    const s = this._classes;
    for (const c of classes) {
      if (c) s.add(c);
    }
    this._el.className = Array.from(s).join(' ');
    this._el.attributes.set('class', this._el.className);
  }

  remove(...classes) {
    const s = this._classes;
    for (const c of classes) s.delete(c);
    this._el.className = Array.from(s).join(' ');
    this._el.attributes.set('class', this._el.className);
  }

  contains(cls) {
    return this._classes.has(cls);
  }

  toggle(cls, force) {
    const s = this._classes;
    const shouldAdd = force !== undefined ? Boolean(force) : !s.has(cls);
    if (shouldAdd) s.add(cls);
    else s.delete(cls);
    this._el.className = Array.from(s).join(' ');
    this._el.attributes.set('class', this._el.className);
    return shouldAdd;
  }
}

// 5. FakeElement with DOM Tree Awareness & Event Bubbling
export class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.style = createFakeStyle();
    this.classList = new FakeClassList(this);
    this.value = '';
    this.disabled = false;
    this.placeholder = '';
    this._textContent = '';
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map(c => c.textContent).join('');
  }

  set textContent(text) {
    this.children = [];
    this._textContent = String(text ?? '');
  }

  get innerHTML() {
    if (this.children.length === 0) return this._textContent;
    return this.children
      .map(c => `<${c.tagName.toLowerCase()}${c.id ? ` id="${c.id}"` : ''}${c.className ? ` class="${c.className}"` : ''}>${c.innerHTML}</${c.tagName.toLowerCase()}>`)
      .join('');
  }

  set innerHTML(html) {
    this.children = [];
    this._textContent = '';
    if (!html) return;

    const tagRegex = /<(\/)?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
    const stack = [this];
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const [, isClose, tagName, attrs, text] = match;
      if (text) {
        const trimmed = text.trim();
        if (trimmed && stack.length > 0) {
          stack[stack.length - 1]._textContent += trimmed;
        }
      } else if (isClose) {
        if (stack.length > 1) stack.pop();
      } else {
        const el = new FakeElement(tagName);
        if (attrs) {
          const attrRegex = /([a-zA-Z0-9-]+)(?:=(?:["']([^"']*)["']|(\S+)))?/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            const attrName = attrMatch[1];
            if (attrName.endsWith('/')) continue;
            const attrVal = attrMatch[2] ?? attrMatch[3] ?? '';
            el.setAttribute(attrName, attrVal);
          }
        }
        stack[stack.length - 1].appendChild(el);
        if (!attrs?.trim().endsWith('/') && !['INPUT', 'BR', 'HR', 'IMG', 'META', 'LINK'].includes(el.tagName)) {
          stack.push(el);
        }
      }
    }
  }

  appendChild(child) {
    if (!child) return child;
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  replaceChildren(...newChildren) {
    this.children = [];
    for (const c of newChildren) {
      if (c) this.appendChild(c);
    }
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'disabled') this.disabled = true;
    if (k === 'type') this.type = String(v);
    if (k === 'placeholder') this.placeholder = String(v);
    if (k === 'value') this.value = String(v);
  }

  getAttribute(k) {
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }

  hasAttribute(k) {
    return this.attributes.has(k);
  }

  removeAttribute(k) {
    this.attributes.delete(k);
    if (k === 'id') this.id = '';
    if (k === 'class') this.className = '';
    if (k === 'disabled') this.disabled = false;
    if (k === 'type') this.type = '';
    if (k === 'placeholder') this.placeholder = '';
    if (k === 'value') this.value = '';
  }

  focus() {
    if (globalThis.document) {
      globalThis.document.activeElement = this;
    }
    this.dispatchEvent(new Event('focus'));
  }

  blur() {
    if (globalThis.document && globalThis.document.activeElement === this) {
      globalThis.document.activeElement = null;
    }
    this.dispatchEvent(new Event('blur'));
  }

  click() {
    if (this.disabled) return;
    this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
  }

  submit() {
    if (this.disabled) return;
    this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  dispatchEvent(event) {
    if (!event.target) {
      Object.defineProperty(event, 'target', { value: this, configurable: true });
    }
    Object.defineProperty(event, 'currentTarget', { value: this, configurable: true });
    const result = super.dispatchEvent(event);
    if (event.bubbles && this.parentElement && !event.cancelBubble) {
      this.parentElement.dispatchEvent(event);
    }
    return result;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const match = (el, s) => {
      s = s.trim();
      if (!s) return false;
      if (s.startsWith('#')) return el.id === s.slice(1);
      if (s.startsWith('.')) return el.classList.contains(s.slice(1));
      if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1);
        if (inner.includes('=')) {
          const [k, v] = inner.split('=');
          return el.getAttribute(k.trim()) === v.replace(/^['"]|['"]$/g, '');
        }
        return el.hasAttribute(inner.trim());
      }
      return el.tagName.toLowerCase() === s.toLowerCase();
    };

    const parts = sel.trim().split(/\s+/);
    let current = [this];
    for (const part of parts) {
      const next = [];
      for (const node of current) {
        const traverse = (n) => {
          for (const child of n.children) {
            if (match(child, part)) next.push(child);
            traverse(child);
          }
        };
        traverse(node);
      }
      current = next;
    }
    return current;
  }
}

// 6. FakeWindow and FakeDocument
export class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.startTime = Date.now();
    this.localStorage = new MockLocalStorage();
    this.AudioContext = MockAudioContext;
    this.webkitAudioContext = MockAudioContext;
    this.navigator = { clipboard: new MockClipboard() };
    this.location = { href: 'http://localhost:3000/', reload: () => {} };
    this.performance = {
      now: () => Date.now() - this.startTime
    };
    this.requestAnimationFrame = (cb) => setTimeout(() => cb(this.performance.now()), 16);
    this.cancelAnimationFrame = (id) => clearTimeout(id);
    this.setTimeout = globalThis.setTimeout;
    this.clearTimeout = globalThis.clearTimeout;
    this.setInterval = globalThis.setInterval;
    this.clearInterval = globalThis.clearInterval;
  }
}

export class FakeDocument extends EventTarget {
  constructor(win) {
    super();
    this.defaultView = win;
    this.parentElement = win;
    this.documentElement = new FakeElement('html');
    this.documentElement.parentElement = this;
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.body);
    this.activeElement = null;
  }

  getElementById(id) {
    return this.documentElement.querySelector('#' + id);
  }

  querySelector(sel) {
    return this.documentElement.querySelector(sel);
  }

  querySelectorAll(sel) {
    return this.documentElement.querySelectorAll(sel);
  }

  createElement(tag) {
    return new FakeElement(tag);
  }
}

// 7. Environment Lifecycle Helpers
export function setupBrowserEnv(options = {}) {
  const win = new FakeWindow();
  const doc = new FakeDocument(win);
  win.document = doc;

  globalThis.window = win;
  globalThis.document = doc;
  globalThis.localStorage = win.localStorage;
  globalThis.AudioContext = win.AudioContext;
  globalThis.webkitAudioContext = win.webkitAudioContext;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLInputElement = FakeElement;
  globalThis.HTMLButtonElement = FakeElement;
  try {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: win.navigator.clipboard,
      configurable: true,
      writable: true
    });
  } catch {
    // In case navigator is not available or locked
  }

  // Default game DOM markup fixture
  const defaultHtml = `
    <div id="app">
      <div id="header">
        <span id="best-depth">0m</span>
        <span id="total-dives">0</span>
      </div>
      <div id="dive-screen">
        <div id="depth-gauge">
          <div id="submarine-icon"></div>
          <span id="depth-counter">0 m</span>
          <span id="zone-label">Sunlight Zone (Epipelagic)</span>
        </div>
        <div id="question-card">
          <span id="question-index">Question 1 of 7</span>
          <span id="question-counter">Question 1 of 7</span>
          <span id="prompt-category">Category</span>
          <h2 id="prompt-text">Prompt Question</h2>
          <div id="timer-gauge">
            <span id="timer-display">25</span>
          </div>
          <form id="answer-form">
            <input id="answer-input" type="text" placeholder="Type your answer..." />
            <button id="submit-btn" type="submit">Dive</button>
          </form>
          <div id="feedback-msg" class="hidden"></div>
        </div>
      </div>
      <div id="summary-modal" class="hidden">
        <h2 id="summary-title">Summary Title</h2>
        <span id="summary-depth">0m</span>
        <span id="summary-points">0 pts</span>
        <span id="summary-zone">Sunlight Zone</span>
        <div id="summary-breakdown"></div>
        <button id="share-btn">Share Dive</button>
        <span id="share-feedback" class="hidden"></span>
        <button id="play-again-btn">Play Again</button>
      </div>
    </div>
  `;

  doc.body.innerHTML = options.html || defaultHtml;
  return { window: win, document: doc, localStorage: win.localStorage };
}

export function resetBrowserEnv() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.HTMLElement;
  delete globalThis.HTMLInputElement;
  delete globalThis.HTMLButtonElement;
  try {
    delete globalThis.navigator.clipboard;
  } catch {}
}

// 8. Contract Implementations for Audio and Depth Gauge (M2/M3 Contract Conformance)
export class MockSoundManager {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.callLog = [];
  }

  init() {
    if (typeof globalThis.AudioContext !== 'undefined') {
      try {
        this.ctx = new globalThis.AudioContext();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      } catch {
        // Fallback gracefully
      }
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  _synthesize(type, details = {}) {
    this.callLog.push({ type, ...details });
    if (this.muted) return null;
    if (!this.ctx && typeof globalThis.AudioContext !== 'undefined') {
      try {
        this.ctx = new globalThis.AudioContext();
      } catch {
        return null;
      }
    }
    if (!this.ctx) return null;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(0);
      osc.stop(0.1);
      return osc;
    } catch {
      return null;
    }
  }

  playSonar() {
    return this._synthesize('sonar', { freq: 880 });
  }

  playDive() {
    return this._synthesize('dive', { freq: 220 });
  }

  playChime(tierKey = 'plankton') {
    const freqs = {
      plankton: 523.25,
      too_clever: 587.33,
      schooler: 659.25,
      rare: 783.99,
      deep_cut: 880.0,
      one_in_a_krillion: 1046.5
    };
    return this._synthesize('chime', { tierKey, freq: freqs[tierKey] || 440 });
  }

  playTick() {
    return this._synthesize('tick', { freq: 1200 });
  }

  playFanfare() {
    return this._synthesize('fanfare', { freq: 1046.5 });
  }

  playReject() {
    return this._synthesize('reject', { freq: 150 });
  }
}

export class MockDepthGauge {
  constructor(containerEl = null) {
    this.container = containerEl;
    this.currentDepth = 0;
    this.targetDepth = 0;
    this.maxDepth = 7000;
    this.zone = null;
  }

  updateDepth(targetMeters, previousMeters = this.currentDepth) {
    this.targetDepth = Math.max(0, Math.min(this.maxDepth, targetMeters));
    this.currentDepth = this.targetDepth;

    if (this.container) {
      const pct = (this.currentDepth / this.maxDepth) * 100;
      const vessel = this.container.querySelector('#submarine-icon') || this.container.querySelector('.vessel');
      if (vessel) {
        vessel.style.top = `${pct}%`;
        vessel.style.transform = `translateY(${pct}%)`;
      }
      const odometer = this.container.querySelector('#depth-counter') || this.container.querySelector('.odometer');
      if (odometer) {
        odometer.textContent = `${this.currentDepth.toLocaleString('en-US')} m`;
      }
    }
    return this.currentDepth;
  }

  setZone(zone) {
    this.zone = zone;
    if (this.container) {
      const label = this.container.querySelector('#zone-label') || this.container.querySelector('.zone-label');
      if (label && zone?.name) {
        label.textContent = zone.name;
      }
    }
  }
}

// 9. Share Grid Generator Helper
export function generateShareText(session) {
  const summary = session.getSummary ? session.getSummary() : session;
  const depth = summary.totalDepth || 0;
  const zone = summary.zone?.name || 'Sunlight Zone';
  const tierEmojis = {
    plankton: '⬜',
    too_clever: '🟩',
    schooler: '🟦',
    rare: '🟪',
    deep_cut: '🟨',
    one_in_a_krillion: '🌟',
    missed: '⬛',
    timeout: '⬛'
  };

  const rounds = summary.rounds || [];
  const emojis = rounds.map(r => {
    if (r.timeout || !r.tier) return '⬛';
    return tierEmojis[r.tier] || '⬜';
  }).join('');

  return `🦐 Krillion Dive: ${depth.toLocaleString('en-US')}m / 7,000m | Zone: ${zone} | ${emojis}`;
}

// 10. Static HTTP Server Factory
export function MockCreateStaticServer({ rootDir, port = 0 }) {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';

    // Directory traversal security check with URL decoding
    let decodedUrl = reqPath;
    try {
      decodedUrl = decodeURIComponent(reqPath);
    } catch {}
    if (decodedUrl.includes('..') || req.url.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const safePath = path.normalize(decodedUrl).replace(/^(\.\.[/\\])+/, '');
    if (safePath.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const filePath = path.join(rootDir, safePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });

  return server;
}

// 11. Dynamic Contract Resolvers for M2/M3 modules
let LiveSoundManager = null;
try {
  const mod = await import('../../src/js/audio.js');
  if (mod.SoundManager) LiveSoundManager = mod.SoundManager;
} catch {}

let LiveDepthGauge = null;
try {
  const mod = await import('../../src/js/depth-gauge.js');
  if (mod.DepthGauge) LiveDepthGauge = mod.DepthGauge;
} catch {}

let LiveCreateStaticServer = null;
try {
  const mod = await import('../../scripts/serve.mjs');
  if (mod.createStaticServer) LiveCreateStaticServer = mod.createStaticServer;
} catch {}

export const SoundManager = LiveSoundManager || MockSoundManager;
export const DepthGauge = LiveDepthGauge || MockDepthGauge;
export const createStaticServer = LiveCreateStaticServer || MockCreateStaticServer;
