import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearParseState,
  createAppState,
  invalidateParserRequests,
} from '../src/lib/app-state.js';

test('createAppState centralizes mutable UI defaults', () => {
  const state = createAppState({ currentFileName: 'calc.y' });

  assert.equal(state.rulesViewMode, 'card');
  assert.deepEqual(state.currentRuleSymbols, []);
  assert.equal(state.currentFileName, 'calc.y');
  assert.equal(state.mobileViewMode, 'editor');
});

test('clearParseState clears stale parse result data', () => {
  const state = createAppState({
    latestParseResult: { success: true },
    latestParsedSource: '%token NUMBER',
  });

  clearParseState(state);

  assert.equal(state.latestParseResult, null);
  assert.equal(state.latestParsedSource, '');
});

test('invalidateParserRequests advances parse and validate generations', () => {
  const state = createAppState({ parseRequestId: 2, validateRequestId: 4 });

  invalidateParserRequests(state);

  assert.equal(state.parseRequestId, 3);
  assert.equal(state.validateRequestId, 5);
});
