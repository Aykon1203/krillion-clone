/**
 * krillion.io - Zero-Dependency Headless DOM Environment Mock
 *
 * Lightweight W3C DOM and Web API shims built on Node.js native primitives (EventTarget).
 * Designed for sub-50ms execution in node:test without external npm packages.
 */

// 1. Mock LocalStorage
export class MockLocalStorage {
  constructor(initial = {}) {
    this._store = new Map(Object.entries(initial));
  }

  get length() {
    return this._store.size;
  }

  key(index) {
    return Array.from(this._store.keys())[index] || null;
  }

  getItem(key) {
    const val = this._store.get(String(key));
    return val !== undefined ? val : null;
  }

  setItem(key, value) {
    this._store.set(String(key), String(value));
  }

  removeItem(key) {
    this._store.delete(String(key));
  }

  clear() {
    this._store.clear();
  }
}

// 2. Mock AudioContext & Web Audio nodes
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
  }

  start(when = 0) {
    this.started = true;
  }

  stop(when = 0) {
    this.stopped = true;
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
    this.state = 'suspended';
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
    node.frequency = new MockAudioParam(350);
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
    return new Set((this._el.className || '').trim().split(/\s+/).filter(Boolean));
  }

  add(...classes) {
    const s = this._classes;
    for (const c of classes) {
      if (c) s.add(c);
    }
    this._el.className = Array.from(s).join(' ');
  }

  remove(...classes) {
    const s = this._classes;
    for (const c of classes) s.delete(c);
    this._el.className = Array.from(s).join(' ');
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
    return shouldAdd;
  }
}

// 5. FakeElement with Event Bubbling and DOM Traversal
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
    this.type = '';
    this._textContent = '';
  }

  get offsetWidth() {
    return 100;
  }

  get offsetHeight() {
    return 50;
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
        if (!attrs?.trim().endsWith('/') && !['INPUT', 'BR', 'HR', 'IMG', 'META', 'LINK', 'CIRCLE'].includes(el.tagName)) {
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

  contains(node) {
    let curr = node;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  click() {
    if (this.disabled) return;
    const evt = new Event('click', { bubbles: true, cancelable: true });
    this.dispatchEvent(evt);
    if (!evt.defaultPrevented && (this.type === 'submit' || this.tagName === 'BUTTON')) {
      let p = this.parentElement;
      while (p) {
        if (p.tagName === 'FORM') {
          p.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          break;
        }
        p = p.parentElement;
      }
    }
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
    this.location = { href: 'http://localhost:8000/', reload: () => {} };
    this.performance = {
      now: () => Date.now() - this.startTime
    };
    this.requestAnimationFrame = (cb) => setTimeout(() => cb(this.performance.now()), 16);
    this.cancelAnimationFrame = (id) => clearTimeout(id);
  }
}

export class FakeDocument extends EventTarget {
  constructor(win) {
    super();
    this.defaultView = win;
    this.parentElement = win;
    this.documentElement = new FakeElement('html');
    this.documentElement.parentElement = this;
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.activeElement = null;
    this.readyState = 'complete';
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

// 7. Canonical Game HTML Fixture matching index.html
export const DEFAULT_GAME_HTML = `
  <div id="app">
    <div id="header">
      <span id="best-depth">0m</span>
      <span id="total-dives">0</span>
    </div>

    <header id="hud" class="hud">
      <div class="hud-left">
        <span id="question-index">Vraag 1 van 7</span>
        <span id="question-counter" class="question-badge">Vraag 1 van 7</span>
      </div>
      <div class="hud-center">
        <span id="depth-counter" class="odometer">0 m</span>
        <span id="zone-label" class="zone-badge">Zonlichtzone (Epipelagisch)</span>
      </div>
      <div class="hud-right">
        <button id="mute-btn" class="sound-toggle" aria-label="Toggle Sound">🔊</button>
      </div>
    </header>

    <aside id="depth-gauge" class="depth-gauge zone-sunlight">
      <div class="depth-track">
        <div id="depth-progress-fill" class="depth-track-fill" style="height: 0%"></div>
        <div id="submarine-icon" class="submarine vessel" style="top: 0%">🦐</div>
      </div>
    </aside>

    <main id="prompt-container" class="prompt-card">
      <div id="timer-container" class="timer-container">
        <div id="timer-gauge">
          <svg class="timer-svg" viewBox="0 0 84 84">
            <circle class="timer-track" cx="42" cy="42" r="36"></circle>
            <circle id="timer-ring" class="timer-circle" cx="42" cy="42" r="36" stroke-dasharray="226" stroke-dashoffset="0"></circle>
          </svg>
          <span id="timer-text" class="timer-number">25</span>
          <span id="timer-display" class="sr-only">25</span>
        </div>
      </div>

      <span id="prompt-category" class="prompt-category">Category</span>
      <h1 id="prompt-text" class="prompt-title">Prompt Question</h1>

      <form id="answer-form" class="answer-form">
        <div class="input-wrapper">
          <input id="answer-input" class="answer-input" type="text" placeholder="Type your answer..." autocomplete="off" autofocus />
        </div>
        <button id="submit-btn" class="btn-submit" type="submit">Dive</button>
      </form>

      <div id="feedback-message" class="feedback-message" aria-live="polite">
        <span id="feedback-msg" class="hidden"></span>
      </div>
    </main>

    <div id="summary-modal" class="summary-modal hidden" role="dialog" aria-modal="true" style="display: none">
      <div class="summary-card">
        <h2 id="summary-title" class="summary-title">Dive Complete!</h2>
        <p class="summary-rank-title" id="summary-diver-title">Surface Swimmer</p>
        <div class="summary-metrics">
          <div class="metric-item">
            <span class="metric-label">Final Depth</span>
            <span id="summary-depth" class="metric-value">0 m</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Total Points</span>
            <span id="summary-points" class="metric-value">0 pts</span>
          </div>
          <span id="summary-zone" class="sr-only">Sunlight Zone (Epipelagic)</span>
        </div>
        <div id="summary-breakdown" class="summary-breakdown"></div>
        <div class="summary-actions">
          <button id="share-btn" class="btn-share">Share Dive</button>
          <button id="restart-btn" class="btn-restart">Dive Again</button>
          <button id="play-again-btn" class="btn-replay">Play Again</button>
        </div>
      </div>
    </div>

    <div id="toast" class="copy-toast hidden" style="display: none">
      <span id="share-feedback">Copied to clipboard!</span>
    </div>
  </div>
`;

// 8. Lifecycle Setup & Teardown Helpers
export function setupDomMock(options = {}) {
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
    globalThis.navigator = { clipboard: win.navigator.clipboard };
  }

  doc.body.innerHTML = options.html || DEFAULT_GAME_HTML;

  return {
    window: win,
    document: doc,
    localStorage: win.localStorage,
    cleanup: teardownDomMock
  };
}

export function teardownDomMock() {
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
}
