import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateHTMLReport } from '../src/lib/report-export.js';

test('generateHTMLReport escapes user-derived grammar values', () => {
  const html = generateHTMLReport('<script>alert(1)</script>', {
    start_symbol: 'start<script>',
    metadata: {
      lrama_version: '1<2',
    },
    analysis_warnings: [
      { phase: 'diagram<script>', message: 'failed <b>now</b>' },
    ],
    expectations: {
      shift_reduce: { actual: 1, expected: 2, satisfied: false },
      reduce_reduce: { actual: 0, expected: null, satisfied: null },
    },
    tokens: [
      {
        name: 'TOK<script>',
        alias: '"literal<script>"',
        display_name: '"literal<script>"',
        type: '<tag>',
        token_id: 300,
        location: { line: 1, column: 1, end_line: 1, end_column: 5 },
      },
    ],
    nonterminals: [
      {
        name: 'expr<img>',
        type: '<node>',
        location: { line: 4, column: 1, end_line: 4, end_column: 5 },
      },
    ],
    conflicts: [
      {
        severity: 'error',
        type: 'reduce_reduce<script>',
        state: 3,
        message: 'bad <img src=x onerror=alert(1)>',
        rules: [7],
        tokens: ['TOK<script>'],
      },
    ],
    resolved_conflicts: [
      {
        state: 4,
        symbol: 'PLUS<script>',
        rule: 8,
        resolution: 'shift<script>',
        same_precedence: true,
        message: 'resolved <b>conflict</b>',
      },
    ],
    nullable_symbols: ['empty<script>'],
    lint: {
      undefined_symbols: ['missing<script>'],
    },
    first_sets: {
      'expr<script>': ['TOK<script>'],
    },
    follow_sets: {
      'expr<script>': ['$end'],
    },
    rules: [
      {
        id: 7,
        lhs: 'expr<script>',
        rhs: [
          {
            symbol: 'TOK<script>',
            display_name: '"literal<script>"',
            type: 'terminal',
          },
        ],
        line_number: 12,
        explicit_empty: false,
        action: { present: true, preview: '$$ = <bad>' },
      },
    ],
    state_transitions: [],
    syntax_diagrams: {},
  });

  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;conflict&lt;\/b&gt;/);
  assert.doesNotMatch(html, /TOK<script>/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('generateHTMLReport includes resolved conflicts and display names', () => {
  const html = generateHTMLReport('%token PLUS "+"\n%%\nexpr: expr PLUS expr ;\n', {
    start_symbol: 'expr',
    tokens: [
      {
        name: 'PLUS',
        alias: '"+"',
        display_name: '"+"',
        type: null,
        token_id: 260,
        location: null,
      },
    ],
    nonterminals: [{ name: 'expr', type: null, location: null }],
    conflicts: [],
    resolved_conflicts: [
      {
        state: 5,
        symbol: 'PLUS',
        rule: 2,
        resolution: 'shift',
        same_precedence: false,
        message: 'Conflict between rule 2 and token PLUS resolved as shift.',
      },
    ],
    nullable_symbols: [],
    lint: {},
    first_sets: { expr: ['PLUS'] },
    follow_sets: { expr: ['$end', 'PLUS'] },
    rules: [
      {
        id: 2,
        lhs: 'expr',
        rhs: [
          { symbol: 'expr', display_name: 'expr', type: 'nonterminal' },
          { symbol: 'PLUS', display_name: '"+"', type: 'terminal' },
          { symbol: 'expr', display_name: 'expr', type: 'nonterminal' },
        ],
        line_number: 3,
        explicit_empty: false,
        action: null,
      },
    ],
    state_transitions: [
      {
        id: 5,
        items: [],
        shifts: [{ symbol: 'PLUS', to_state: 6 }],
        gotos: [{ symbol: 'expr', to_state: 7 }],
        reduces: [{ symbol: '$end', rule_id: 2 }],
        conflicts: [],
      },
    ],
    syntax_diagrams: {},
  });

  assert.match(html, /Resolved Conflicts \(1\)/);
  assert.match(html, /STATE 5/);
  assert.match(html, /Rule:<\/strong> #2/);
  assert.match(html, /&quot;\+&quot;/);
  assert.match(html, /Parse Table/);
  assert.match(html, /PLUS: s6/);
  assert.match(html, /expr: 7/);
  assert.match(html, /\$end: r2/);
});
