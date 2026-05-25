import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatErrorLocation } from '../src/lib/output-view.js';

test('formatErrorLocation returns line and column when both are available', () => {
  assert.equal(formatErrorLocation({ line: 12, column: 8 }), 'Line 12, Column 8: ');
});

test('formatErrorLocation returns line-only labels', () => {
  assert.equal(formatErrorLocation({ line: 12, column: 0 }), 'Line 12: ');
});

test('formatErrorLocation omits missing locations', () => {
  assert.equal(formatErrorLocation(null), '');
  assert.equal(formatErrorLocation({ line: 0, column: 0 }), '');
});
