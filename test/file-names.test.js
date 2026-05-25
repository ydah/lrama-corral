import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_DOWNLOAD_FILENAME,
  reportFileNameForGrammar,
  sanitizeDownloadFileName,
} from '../src/lib/file-names.js';

test('sanitizeDownloadFileName strips path separators and unsafe filename characters', () => {
  assert.equal(sanitizeDownloadFileName('../bad:grammar?.y'), '..-bad-grammar-.y');
});

test('sanitizeDownloadFileName falls back for empty names', () => {
  assert.equal(sanitizeDownloadFileName(''), DEFAULT_DOWNLOAD_FILENAME);
});

test('reportFileNameForGrammar follows grammar file stems', () => {
  assert.equal(reportFileNameForGrammar('calc.y'), 'calc-report.html');
  assert.equal(reportFileNameForGrammar('parser.yacc'), 'parser-report.html');
  assert.equal(reportFileNameForGrammar('grammar.txt'), 'grammar.txt-report.html');
});
