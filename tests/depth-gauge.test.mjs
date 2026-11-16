import test from 'node:test';
import assert from 'node:assert/strict';
import { DepthGauge } from '../src/js/depth-gauge.js';
import { OCEAN_ZONES, getOceanZone } from '../src/js/scoring.js';

/**
 * Creates a mock DOM element tree simulating the depth gauge container.
 */
function createMockDepthGaugeContainer() {
  const classListSet = new Set();

  const vesselEl = {
    id: 'submarine-icon',
    className: 'vessel',
    style: { top: '0%', transform: 'translateY(0%)' }
  };

  const odometerEl = {
    id: 'depth-counter',
    className: 'odometer',
    textContent: '0 m'
  };

  const fillEl = {
    id: 'depth-progress-fill',
    className: 'depth-track-fill',
    style: { height: '0%' }
  };

  const zoneLabelEl = {
    id: 'zone-label',
    className: 'zone-label',
    textContent: 'Zonlichtzone (Epipelagisch)'
  };

  const container = {
    id: 'depth-gauge',
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      contains: (cls) => classListSet.has(cls),
      get length() {
        return classListSet.size;
      }
    },
    querySelector: (selector) => {
      if (selector === '#submarine-icon' || selector === '.vessel' || selector === '.submarine') {
        return vesselEl;
      }
      if (selector === '#depth-counter' || selector === '.depth-counter' || selector === '.odometer') {
        return odometerEl;
      }
      if (selector === '#depth-progress-fill' || selector === '.depth-track-fill') {
        return fillEl;
      }
      if (selector === '#zone-label' || selector === '.zone-label' || selector === '.zone-badge') {
        return zoneLabelEl;
      }
      return null;
    },
    _elements: { vesselEl, odometerEl, fillEl, zoneLabelEl }
  };

  return container;
}

test('DepthGauge: default initialization and initial state', () => {
  const container = createMockDepthGaugeContainer();
  const gauge = new DepthGauge(container);

  assert.equal(gauge.getCurrentDepth(), 0);
  assert.equal(gauge.currentDepth, 0);
  assert.equal(gauge.targetDepth, 0);
  assert.equal(gauge.maxDepth, 7000);
  assert.equal(gauge.container, container);
});

test('DepthGauge: custom maxDepth option in constructor', () => {
  const gauge = new DepthGauge(null, { maxDepth: 5000 });
  assert.equal(gauge.maxDepth, 5000);
});

test('DepthGauge: updateDepth updates depth within boundaries', () => {
  const container = createMockDepthGaugeContainer();
  const gauge = new DepthGauge(container);

  const d1 = gauge.updateDepth(600, 0);
  assert.equal(d1, 600);
  assert.equal(gauge.getCurrentDepth(), 600);
  assert.equal(container._elements.odometerEl.textContent, '600 m');

  const d2 = gauge.updateDepth(1500, 600);
  assert.equal(d2, 1500);
  assert.equal(gauge.getCurrentDepth(), 1500);
  assert.equal(container._elements.odometerEl.textContent, '1,500 m');
});

test('DepthGauge: clamps target depth between 0m and maxDepth (7,000m)', () => {
  const container = createMockDepthGaugeContainer();
  const gauge = new DepthGauge(container);

  // Negative target clamped to 0
  const dNeg = gauge.updateDepth(-200);
  assert.equal(dNeg, 0);
  assert.equal(gauge.getCurrentDepth(), 0);
  assert.equal(container._elements.odometerEl.textContent, '0 m');
  assert.equal(container._elements.vesselEl.style.top, '0%');

  // Target exceeding 7,000m clamped to 7,000m
  const dMax = gauge.updateDepth(99999);
  assert.equal(dMax, 7000);
  assert.equal(gauge.getCurrentDepth(), 7000);
  assert.equal(container._elements.odometerEl.textContent, '7,000 m');
  assert.equal(container._elements.vesselEl.style.top, '100%');
});

test('DepthGauge: calculates accurate vessel position percentage and transform', () => {
  const container = createMockDepthGaugeContainer();
  const gauge = new DepthGauge(container);

  // 3,500m / 7,000m = 50%
  gauge.updateDepth(3500);
  assert.equal(container._elements.vesselEl.style.top, '50%');
  assert.equal(container._elements.vesselEl.style.transform, 'translateY(50%)');
  assert.equal(container._elements.fillEl.style.height, '50%');

  // 1,000m / 7,000m = 14.2857%
  gauge.updateDepth(1000);
  const topVal = parseFloat(container._elements.vesselEl.style.top);
  assert.ok(Math.abs(topVal - 14.2857) < 0.01);
});

test('DepthGauge: automatically synchronizes ocean zone on updateDepth', () => {
  const container = createMockDepthGaugeContainer();
  const gauge = new DepthGauge(container);

  // 0m -> Zonlichtzone
  gauge.updateDepth(0);
  assert.equal(gauge.getCurrentZone().name, 'Zonlichtzone (Epipelagisch)');
  assert.equal(container.classList.contains('zone-sunlight'), true);
  assert.equal(container._elements.zoneLabelEl.textContent, 'Zonlichtzone (Epipelagisch)');

  // 500m -> Schemerzone
  gauge.updateDepth(500);
  assert.equal(gauge.getCurrentZone().name, 'Schemerzone (Mesopelagisch)');
  assert.equal(container.classList.contains('zone-twilight'), true);
  assert.equal(container.classList.contains('zone-sunlight'), false);

  // 2,500m -> Middernachtzone
  gauge.updateDepth(2500);
  assert.equal(gauge.getCurrentZone().name, 'Middernachtzone (Bathypelagisch)');
  assert.equal(container.classList.contains('zone-midnight'), true);
  assert.equal(container.classList.contains('zone-twilight'), false);

  // 4,500m -> De Afgrond
  gauge.updateDepth(4500);
  assert.equal(gauge.getCurrentZone().name, 'De Afgrond (Abyssopelagisch)');
  assert.equal(container.classList.contains('zone-abyss'), true);
  assert.equal(container.classList.contains('zone-midnight'), false);

  // 6,500m -> De Hadale Trog
  gauge.updateDepth(6500);
  assert.equal(gauge.getCurrentZone().name, 'De Hadale Trog (Hadalpelagisch)');
  assert.equal(container.classList.contains('zone-hadal'), true);
  assert.equal(container.classList.contains('zone-abyss'), false);
});

test('DepthGauge: setZone accepts zone object and updates container classes and label', () => {
  const container = createMockDepthGaugeContainer();
  const gauge = new DepthGauge(container);

  const targetZone = OCEAN_ZONES[2]; // Midnight Zone
  const res = gauge.setZone(targetZone);

  assert.equal(res, targetZone);
  assert.equal(gauge.getCurrentZone(), targetZone);
  assert.equal(container.classList.contains('zone-midnight'), true);
  assert.equal(container._elements.zoneLabelEl.textContent, targetZone.name);
});

test('DepthGauge: setZone accepts zone name string or class string', () => {
  const container = createMockDepthGaugeContainer();
  const gauge = new DepthGauge(container);

  gauge.setZone('zone-hadal');
  assert.equal(container.classList.contains('zone-hadal'), true);

  gauge.setZone('De Afgrond (Abyssopelagisch)');
  assert.equal(container.classList.contains('zone-abyss'), true);
  assert.equal(container.classList.contains('zone-hadal'), false);
});

test('DepthGauge: operates safely when container is null or missing querySelector', () => {
  assert.doesNotThrow(() => {
    const gauge = new DepthGauge(null);
    assert.equal(gauge.getCurrentDepth(), 0);
    const d = gauge.updateDepth(1200);
    assert.equal(d, 1200);
    assert.equal(gauge.getCurrentDepth(), 1200);

    const zone = gauge.setZone(OCEAN_ZONES[1]);
    assert.ok(zone);
    assert.equal(gauge.getCurrentZone(), zone);
  });
});
