import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateStateGraphLayout } from '../src/lib/state-graph-layout.js';

test('calculateStateGraphLayout centers a single state without NaN coordinates', () => {
  const layout = calculateStateGraphLayout([
    { id: 0, shifts: [], gotos: [] },
  ]);

  assert.equal(layout.width, 1200);
  assert.equal(layout.height, 600);
  assert.equal(Number.isFinite(layout.positions[0].x), true);
  assert.equal(Number.isFinite(layout.positions[0].y), true);
  assert.equal(layout.positions[0].x, 600);
  assert.equal(layout.positions[0].y, 300);
});

test('calculateStateGraphLayout separates BFS levels horizontally', () => {
  const layout = calculateStateGraphLayout([
    { id: 0, shifts: [{ to_state: 1 }], gotos: [] },
    { id: 1, shifts: [], gotos: [{ to_state: 2 }] },
    { id: 2, shifts: [], gotos: [] },
  ]);

  assert.ok(layout.positions[0].x < layout.positions[1].x);
  assert.ok(layout.positions[1].x < layout.positions[2].x);
});

test('calculateStateGraphLayout moves disconnected states to later levels', () => {
  const layout = calculateStateGraphLayout([
    { id: 0, shifts: [{ to_state: 1 }], gotos: [] },
    { id: 1, shifts: [], gotos: [] },
    { id: 9, shifts: [], gotos: [] },
  ]);

  assert.ok(layout.positions[1].x < layout.positions[9].x);
});

test('calculateStateGraphLayout grows height for dense levels', () => {
  const states = Array.from({ length: 12 }, (_, id) => ({ id, shifts: [], gotos: [] }));
  states[0].shifts = states.slice(1).map(state => ({ to_state: state.id }));

  const layout = calculateStateGraphLayout(states);

  assert.ok(layout.height > 600);
  assert.equal(Object.keys(layout.positions).length, 12);
});
