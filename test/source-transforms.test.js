import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countSymbolReferences,
  ensureNonterminalRuleStub,
  escapeRegExp,
  findRuleEndLine,
  renameSymbolEverywhere,
  removeSymbolFromDeclarationLine,
  upsertNonterminalDeclaration,
  upsertTokenDeclaration,
} from '../src/lib/source-transforms.js';

test('escapeRegExp escapes symbol names before building regexes', () => {
  assert.equal(escapeRegExp('PLUS+'), 'PLUS\\+');
  assert.equal(escapeRegExp('"+"'), '"\\+"');
});

test('upsertTokenDeclaration adds token ids to generated declarations', () => {
  const lines = ['%token NUMBER', '', '%%', 'expr: NUMBER', '    ;'];

  upsertTokenDeclaration(lines, 'PLUS', '', '258');

  assert.deepEqual(lines.slice(0, 3), ['%token NUMBER', '', '%token PLUS 258']);
});

test('upsertTokenDeclaration keeps simple tokens on an existing simple line', () => {
  const lines = ['%token NUMBER', '%%'];

  upsertTokenDeclaration(lines, 'PLUS');

  assert.equal(lines[0], '%token NUMBER PLUS');
});

test('removeSymbolFromDeclarationLine removes an explicit token id with the symbol', () => {
  assert.equal(removeSymbolFromDeclarationLine('%token NUMBER PLUS 258 MINUS', 'PLUS'), '%token NUMBER MINUS');
});

test('findRuleEndLine ignores semicolons inside action code', () => {
  const lines = [
    'expr: NUMBER',
    '    { printf(";"); }',
    '    | expr PLUS NUMBER',
    '    ;',
  ];

  assert.equal(findRuleEndLine(lines, 0), 3);
});

test('findRuleEndLine ignores semicolons inside comments', () => {
  const lines = [
    'expr: NUMBER /* ; */',
    '    // ;',
    '    ;',
  ];

  assert.equal(findRuleEndLine(lines, 0), 2);
});

test('ensureNonterminalRuleStub creates a rule stub inside the grammar section', () => {
  const lines = ['%token NUMBER', '', '%%', '', 'expr: NUMBER', '    ;', '', '%%', ''];

  ensureNonterminalRuleStub(lines, 'term');

  assert.match(lines.join('\n'), /term: \/\* empty \*\/\n    ;/);
  assert.equal(lines.filter(line => line.trim() === '%%').length, 2);
});

test('upsertNonterminalDeclaration adds typed nonterminal declarations without duplicating rules', () => {
  const lines = ['%token NUMBER', '', '%%', '', 'expr: NUMBER', '    ;'];

  upsertNonterminalDeclaration(lines, 'expr', '<node>');

  assert.equal(lines[2], '%type <node> expr');
  assert.equal(lines.filter(line => /^expr\s*:/.test(line)).length, 1);
});

test('upsertNonterminalDeclaration moves symbols between type declarations', () => {
  const lines = ['%type <old> expr other', '', '%%', '', 'expr: NUMBER', '    ;'];

  upsertNonterminalDeclaration(lines, 'expr', '<new>', 'expr');

  assert.equal(lines.includes('%type <new> expr'), true);
  assert.equal(lines[0], '%type <old> other');
});

test('renameSymbolEverywhere renames declarations and grammar references outside actions', () => {
  const lines = [
    '%token NUMBER PLUS',
    '',
    '%%',
    'expr: NUMBER { puts "NUMBER"; }',
    '    | expr PLUS NUMBER',
    '    ;',
    '%%',
    'NUMBER = 1',
  ];

  const count = renameSymbolEverywhere(lines, 'NUMBER', 'INT');

  assert.equal(count, 3);
  assert.equal(lines[0], '%token INT PLUS');
  assert.equal(lines[3], 'expr: INT { puts "NUMBER"; }');
  assert.equal(lines[4], '    | expr PLUS INT');
  assert.equal(lines[7], 'NUMBER = 1');
});

test('countSymbolReferences ignores comments, string aliases, actions, and epilogue', () => {
  const lines = [
    '%token PLUS "+"',
    '/* PLUS */',
    '%%',
    'expr: PLUS { puts "PLUS"; }',
    '    ;',
    '%%',
    'PLUS',
  ];

  assert.equal(countSymbolReferences(lines, 'PLUS'), 2);
});
