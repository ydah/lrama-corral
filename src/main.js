import { lramaBridge } from './lib/lrama-bridge.js';
import { readStorage, writeStorage } from './lib/safe-storage.js';
import {
  countSymbolReferences,
  findRuleEndLine,
  findRulesSectionEnd,
  findRulesSectionStart,
  renameSymbolEverywhere,
  removeSymbolFromDeclarationLine,
  removeTypeDeclaration as removeTypeDeclarationFromLines,
  upsertNonterminalDeclaration,
  upsertTokenDeclaration,
} from './lib/source-transforms.js';
import { parseSanitizedSvg, sanitizeSvgElement } from './lib/svg-sanitizer.js';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// DOM elements
const statusEl = document.getElementById('status');
const editorContainer = document.getElementById('editor-container');
const parseBtn = document.getElementById('parseBtn');
const validateBtn = document.getElementById('validateBtn');
const resetVmBtn = document.getElementById('resetVmBtn');
const outputEl = document.getElementById('output');
const presetSelect = document.getElementById('presetSelect');
const uploadBtn = document.getElementById('uploadBtn');
const downloadBtn = document.getElementById('downloadBtn');
const exportBtn = document.getElementById('exportBtn');
const fileInput = document.getElementById('fileInput');
const autoParseToggle = document.getElementById('autoParseToggle');
const themeToggle = document.getElementById('themeToggle');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const addRuleBtn = document.getElementById('addRuleBtn');
const ruleModal = document.getElementById('ruleModal');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalTitle = document.getElementById('modalTitle');
const ruleForm = document.getElementById('ruleForm');
const ruleLHS = document.getElementById('ruleLHS');
const ruleInsertPosition = document.getElementById('ruleInsertPosition');
const ruleInsertPositionGroup = document.getElementById('ruleInsertPositionGroup');
const rhsSymbols = document.getElementById('rhsSymbols');
const symbolInput = document.getElementById('symbolInput');
const addSymbolBtn = document.getElementById('addSymbolBtn');

// Symbol modal elements
const symbolModal = document.getElementById('symbolModal');
const symbolModalClose = document.getElementById('symbolModalClose');
const symbolModalCancel = document.getElementById('symbolModalCancel');
const symbolModalTitle = document.getElementById('symbolModalTitle');
const symbolForm = document.getElementById('symbolForm');
const symbolName = document.getElementById('symbolName');
const symbolType = document.getElementById('symbolType');
const tokenId = document.getElementById('tokenId');
const tokenIdGroup = document.getElementById('tokenIdGroup');

// Symbol type selection modal elements
const symbolTypeModal = document.getElementById('symbolTypeModal');
const symbolTypeModalClose = document.getElementById('symbolTypeModalClose');
const symbolTypeModalCancel = document.getElementById('symbolTypeModalCancel');
const symbolTypeSymbolName = document.getElementById('symbolTypeSymbolName');
const registerAsTokenBtn = document.getElementById('registerAsTokenBtn');
const registerAsNonterminalBtn = document.getElementById('registerAsNonterminalBtn');

const commandPalette = document.getElementById('commandPalette');
const commandPaletteClose = document.getElementById('commandPaletteClose');
const commandInput = document.getElementById('commandInput');
const commandList = document.getElementById('commandList');

// Monaco Editor instance
let editor = null;

// Theme state
let isDarkMode = false;

// View state for rules
let rulesViewMode = 'card'; // 'card' or 'terminal'

// Rule editing state
let currentRuleSymbols = [];
let editingLineNumber = null;

// Symbol editing state
let editingSymbolType = null; // 'token' or 'nonterminal'
let editingSymbolIndex = null;
let editingSymbolOriginalName = null;

// Pending symbol to add to rule after registration
let pendingSymbolToAdd = null;

// Latest parse result for export
let latestParseResult = null;
let latestParsedSource = '';
let parseRequestId = 0;
let validateRequestId = 0;

// File and draft state
const DEFAULT_DOWNLOAD_FILENAME = 'grammar.y';
const DRAFT_STORAGE_KEY = 'lrama-corral:draft';
const THEME_STORAGE_KEY = 'lrama-corral:theme';
const MAX_GRAMMAR_FILE_SIZE = 1024 * 1024;
const AUTO_PARSE_DELAY_MS = 700;
let currentFileName = DEFAULT_DOWNLOAD_FILENAME;
let isDirty = false;
let draftSaveTimer = null;
let autoParseTimer = null;

/**
 * Yacc/Bison language definition for Monaco Editor
 */
function registerYaccLanguage() {
  monaco.languages.register({ id: 'yacc' });

  monaco.languages.setMonarchTokensProvider('yacc', {
    keywords: [
      'left', 'right', 'nonassoc', 'token', 'prec', 'type', 'start',
      'union', 'define', 'pure', 'parse', 'lex', 'param', 'locations',
      'error', 'destructor', 'printer', 'expect', 'expect-rr'
    ],

    tokenizer: {
      root: [
        // Comments
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],

        // Directives
        [/%[a-zA-Z_][-a-zA-Z_0-9]*/, {
          cases: {
            '%left': 'keyword',
            '%right': 'keyword',
            '%nonassoc': 'keyword',
            '%token': 'keyword',
            '%type': 'keyword',
            '%start': 'keyword',
            '%union': 'keyword',
            '%prec': 'keyword',
            '%empty': 'keyword',
            '%code': 'keyword',
            '%parse-param': 'keyword',
            '%lex-param': 'keyword',
            '%define': 'keyword',
            '%printer': 'keyword',
            '%destructor': 'keyword',
            '%locations': 'keyword',
            '@default': 'directive'
          }
        }],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, 'string', '@string_single'],

        // Action code blocks
        [/\{/, 'delimiter.curly', '@action'],

        // Identifiers and numbers
        [/[a-zA-Z_][\w]*/, 'identifier'],
        [/[0-9]+/, 'number'],

        // Delimiters
        [/[{}()\[\]]/, '@brackets'],
        [/[<>]/, '@brackets'],
        [/:/, 'delimiter'],
        [/;/, 'delimiter'],
        [/\|/, 'operator'],
        [/%%/, { token: 'keyword', next: '@rules' }],
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop']
      ],

      string_single: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, 'string', '@pop']
      ],

      action: [
        [/[^{}]+/, 'source'],
        [/\{/, 'delimiter.curly', '@push'],
        [/\}/, 'delimiter.curly', '@pop']
      ],

      rules: [
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, 'string', '@string_single'],
        [/\{/, 'delimiter.curly', '@action'],
        [/[a-zA-Z_][\w]*/, 'type.identifier'],
        [/:/, 'delimiter'],
        [/;/, 'delimiter'],
        [/\|/, 'operator'],
        [/%%/, { token: 'keyword', next: '@epilogue' }],
      ],

      epilogue: [
        [/.*/, 'source']
      ]
    }
  });

  // Light theme configuration
  monaco.editor.defineTheme('yacc-theme', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },
      { token: 'directive', foreground: '8B008B', fontStyle: 'bold' },
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'string', foreground: 'A31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type.identifier', foreground: '267F99' },
      { token: 'delimiter', foreground: '000000' },
      { token: 'operator', foreground: 'D73A49' },
    ],
    colors: {}
  });

  // Dark theme configuration
  monaco.editor.defineTheme('yacc-theme-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
      { token: 'directive', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'delimiter', foreground: 'D4D4D4' },
      { token: 'operator', foreground: 'D16969' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
    }
  });

  // Code completion configuration
  monaco.languages.registerCompletionItemProvider('yacc', {
    provideCompletionItems: (model, position) => {
      const suggestions = [];

      // Directive completion
      const directives = [
        { label: '%token', insertText: '%token ', detail: 'Token definition' },
        { label: '%type', insertText: '%type ', detail: 'Type definition' },
        { label: '%left', insertText: '%left ', detail: 'Left-associative operator' },
        { label: '%right', insertText: '%right ', detail: 'Right-associative operator' },
        { label: '%nonassoc', insertText: '%nonassoc ', detail: 'Non-associative operator' },
        { label: '%start', insertText: '%start ', detail: 'Start symbol' },
        { label: '%union', insertText: '%union {\n  $0\n}', detail: 'Union definition', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        { label: '%prec', insertText: '%prec ', detail: 'Precedence specification' },
        { label: '%define', insertText: '%define ', detail: 'Bison definition' },
        { label: '%code', insertText: '%code {\n  $0\n}', detail: 'Code block', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        { label: '%parse-param', insertText: '%parse-param { ${1:param} }', detail: 'Parser parameter', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        { label: '%lex-param', insertText: '%lex-param { ${1:param} }', detail: 'Lexer parameter', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        { label: '%locations', insertText: '%locations', detail: 'Enable locations' },
        { label: '%printer', insertText: '%printer { ${1:code} } ${2:symbol}', detail: 'Printer code', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        { label: '%destructor', insertText: '%destructor { ${1:code} } ${2:symbol}', detail: 'Destructor code', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        { label: '%empty', insertText: '%empty', detail: 'Explicit empty rule' },
        { label: '%error-verbose', insertText: '%error-verbose', detail: 'Verbose error' },
        { label: '%expect', insertText: '%expect ', detail: 'Expected conflict count' },
        { label: '%expect-rr', insertText: '%expect-rr ', detail: 'Expected reduce/reduce conflict count' },
      ];

      directives.forEach(directive => {
        suggestions.push({
          label: directive.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: directive.insertText,
          insertTextRules: directive.insertTextRules,
          detail: directive.detail,
          documentation: directive.detail,
        });
      });

      // Delimiter completion
      const separators = [
        { label: '%%', insertText: '%%\n\n$0\n\n%%', detail: 'Rule section delimiter', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
      ];

      separators.forEach(sep => {
        suggestions.push({
          label: sep.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: sep.insertText,
          insertTextRules: sep.insertTextRules,
          detail: sep.detail,
          documentation: sep.detail,
        });
      });

      // Rule template completion
      const templates = [
        {
          label: 'rule',
          insertText: '${1:nonterminal}: ${2:symbols}\n    {\n      $0\n    }\n    ;',
          detail: 'Rule template',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        },
      ];

      templates.forEach(template => {
        suggestions.push({
          label: template.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: template.insertText,
          insertTextRules: template.insertTextRules,
          detail: template.detail,
          documentation: template.detail,
        });
      });

      const grammar = latestParseResult?.grammar;
      if (grammar) {
        const symbols = [
          ...(grammar.tokens || []).map(token => ({
            label: token.name,
            kind: monaco.languages.CompletionItemKind.EnumMember,
            detail: token.type ? `Token ${token.type}` : 'Token',
          })),
          ...(grammar.nonterminals || []).map(nonterminal => ({
            label: nonterminal.name,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: nonterminal.type ? `Nonterminal ${nonterminal.type}` : 'Nonterminal',
          })),
        ];

        symbols.forEach(symbol => {
          suggestions.push({
            label: symbol.label,
            kind: symbol.kind,
            insertText: symbol.label,
            detail: symbol.detail,
            documentation: symbol.detail,
          });
        });
      }

      return { suggestions };
    }
  });

  monaco.languages.registerHoverProvider('yacc', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      const symbol = word?.word;
      const grammar = latestParseResult?.grammar;
      if (!symbol || !grammar) return null;

      const token = grammar.tokens?.find(item => item.name === symbol);
      if (token) {
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [
            { value: `**Token** \`${token.name}\`` },
            { value: `Type: \`${token.type || '-'}\`, ID: \`${token.token_id ?? '-'}\`` },
          ],
        };
      }

      const nonterminal = grammar.nonterminals?.find(item => item.name === symbol);
      if (!nonterminal) return null;

      const first = grammar.first_sets?.[symbol]?.join(', ') || '-';
      const follow = grammar.follow_sets?.[symbol]?.join(', ') || '-';
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [
          { value: `**Nonterminal** \`${nonterminal.name}\`` },
          { value: `Type: \`${nonterminal.type || '-'}\`` },
          { value: `FIRST: \`${first}\`` },
          { value: `FOLLOW: \`${follow}\`` },
        ],
      };
    },
  });

  monaco.languages.registerDefinitionProvider('yacc', {
    provideDefinition: (model, position) => {
      const word = model.getWordAtPosition(position);
      const symbol = word?.word;
      const grammar = latestParseResult?.grammar;
      if (!symbol || !grammar?.rules) return null;

      const rule = grammar.rules.find(item => item.lhs === symbol && item.line_number);
      if (!rule) return null;

      return {
        uri: model.uri,
        range: new monaco.Range(rule.line_number, 1, rule.line_number, model.getLineMaxColumn(rule.line_number)),
      };
    },
  });

  monaco.languages.registerFoldingRangeProvider('yacc', {
    provideFoldingRanges: (model) => {
      const ranges = [];
      const lines = model.getLinesContent();

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.includes('%{')) {
          const end = lines.findIndex((candidate, candidateIndex) => (
            candidateIndex > index && candidate.includes('%}')
          ));
          if (end !== -1) {
            ranges.push({ start: index + 1, end: end + 1, kind: monaco.languages.FoldingRangeKind.Region });
            index = end;
          }
          continue;
        }

        if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*:/.test(line)) {
          const end = findRuleEndLine(lines, index);
          if (end > index) {
            ranges.push({ start: index + 1, end: end + 1, kind: monaco.languages.FoldingRangeKind.Region });
            index = end;
          }
        }
      }

      return ranges;
    },
  });
}

/**
 * Initialize Monaco Editor
 */
function initMonacoEditor() {
  registerYaccLanguage();

  const defaultValue = `%token NUMBER
%token PLUS MINUS TIMES DIVIDE
%token LPAREN RPAREN

%%

expr: term
    | expr PLUS term
    | expr MINUS term
    ;

term: factor
    | term TIMES factor
    | term DIVIDE factor
    ;

factor: NUMBER
      | LPAREN expr RPAREN
      ;`;

  const draft = loadDraft();
  const initialValue = draft?.content || defaultValue;
  if (draft?.fileName) {
    currentFileName = draft.fileName;
    isDirty = true;
  }

  editor = monaco.editor.create(editorContainer, {
    value: initialValue,
    language: 'yacc',
    theme: isDarkMode ? 'yacc-theme-dark' : 'yacc-theme',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'on',
    roundedSelection: false,
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10
    }
  });

  // Update Undo/Redo button state when editor content changes
  editor.onDidChangeModelContent(() => {
    updateUndoRedoButtons();
    invalidateParseResult();
    scheduleDraftSave();
    scheduleAutoParse();
    isDirty = true;
  });

  // Update initial button state
  updateUndoRedoButtons();

  return editor;
}

/**
 * Toggle dark mode
 */
function toggleTheme() {
  isDarkMode = !isDarkMode;

  // Set HTML attributes
  if (isDarkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️ Light Mode';
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeToggle.textContent = '🌙 Dark Mode';
  }

  // Switch Monaco Editor theme
  if (editor) {
    monaco.editor.setTheme(isDarkMode ? 'yacc-theme-dark' : 'yacc-theme');
  }

  // Save theme preference when storage is available.
  writeStorage(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
}

/**
 * Load saved theme settings
 */
function loadTheme() {
  const savedTheme = readStorage(THEME_STORAGE_KEY);
  if (savedTheme === 'dark') {
    isDarkMode = true;
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️ Light Mode';
  }
}

/**
 * Undo handler
 */
function handleUndo() {
  if (editor) {
    editor.trigger('keyboard', 'undo', null);
    updateUndoRedoButtons();
  }
}

/**
 * Redo handler
 */
function handleRedo() {
  if (editor) {
    editor.trigger('keyboard', 'redo', null);
    updateUndoRedoButtons();
  }
}

/**
 * Update Undo/Redo button state
 */
function updateUndoRedoButtons() {
  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  // Get Undo/Redo availability and enable/disable buttons
  // Use Monaco Editor internal API
  const canUndo = model.canUndo();
  const canRedo = model.canRedo();

  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
}

function loadDraft() {
  const stored = readStorage(DRAFT_STORAGE_KEY);
  if (!stored) return null;

  try {
    const draft = JSON.parse(stored);
    if (!draft || typeof draft.content !== 'string') return null;
    return draft;
  } catch (_error) {
    return null;
  }
}

function scheduleDraftSave() {
  if (!editor) return;
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => {
    const content = editor.getValue();
    writeStorage(DRAFT_STORAGE_KEY, JSON.stringify({
      content,
      fileName: currentFileName,
      updatedAt: new Date().toISOString(),
    }));
  }, 300);
}

function scheduleAutoParse() {
  window.clearTimeout(autoParseTimer);
  if (!autoParseToggle.checked || !editor) return;

  autoParseTimer = window.setTimeout(() => {
    if (getActiveModal() || parseBtn.disabled) return;
    if (!editor.getValue().trim()) return;
    handleParse();
  }, AUTO_PARSE_DELAY_MS);
}

function replaceEditorContent(content, source = 'lrama-corral') {
  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  editor.executeEdits(source, [{
    range: model.getFullModelRange(),
    text: content,
    forceMoveMarkers: true,
  }]);
  editor.pushUndoStop();
}

function replaceEditorLineRange(startLineNumber, endLineNumber, text, source = 'lrama-corral') {
  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  const range = new monaco.Range(
    startLineNumber,
    1,
    endLineNumber,
    model.getLineMaxColumn(endLineNumber)
  );

  editor.executeEdits(source, [{
    range,
    text,
    forceMoveMarkers: true,
  }]);
  editor.pushUndoStop();
}

function insertEditorText(lineNumber, column, text, source = 'lrama-corral') {
  if (!editor) return;

  const range = new monaco.Range(lineNumber, column, lineNumber, column);
  editor.executeEdits(source, [{
    range,
    text,
    forceMoveMarkers: true,
  }]);
  editor.pushUndoStop();
}

function getRuleInsertionPoint(lines) {
  const mode = ruleInsertPosition.value;

  if (mode === 'cursor' && editor) {
    const position = editor.getPosition();
    return {
      lineNumber: position.lineNumber,
      column: 1,
      revealLineNumber: position.lineNumber,
    };
  }

  if (mode === 'before-epilogue') {
    const rulesEnd = findRulesSectionEnd(lines);
    if (rulesEnd !== -1 && rulesEnd < lines.length) {
      return {
        lineNumber: rulesEnd + 1,
        column: 1,
        revealLineNumber: rulesEnd + 1,
      };
    }
  }

  const rulesStart = findRulesSectionStart(lines);
  if (rulesStart !== -1) {
    return {
      lineNumber: Math.min(rulesStart + 3, lines.length + 1),
      column: 1,
      revealLineNumber: Math.min(rulesStart + 4, lines.length + 1),
    };
  }

  return null;
}

function invalidateParseResult() {
  if (!latestParseResult) return;

  latestParseResult = null;
  latestParsedSource = '';
  exportBtn.disabled = true;
  setParseMarkers([]);
  updateStatus('Grammar changed - run Parse again before exporting', 'loading');
}

function markContentClean() {
  isDirty = false;
}

function confirmDiscardDirtyContent() {
  if (!isDirty) return true;
  return confirm('Current edits will be replaced. Continue?');
}

function sanitizeDownloadFileName(fileName) {
  const sanitized = fileName.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return sanitized || DEFAULT_DOWNLOAD_FILENAME;
}

function validateGrammarFile(file) {
  if (!file.name.match(/\.(y|yacc|yy)$/i)) {
    return 'Unsupported file format. Please use .y, .yacc, or .yy files.';
  }

  if (file.size > MAX_GRAMMAR_FILE_SIZE) {
    return `File is too large. The limit is ${Math.round(MAX_GRAMMAR_FILE_SIZE / 1024)} KB.`;
  }

  const type = file.type.toLowerCase();
  const textLike = !type || type.startsWith('text/') || type === 'application/octet-stream';
  if (!textLike) {
    return 'Unsupported file type. Please use a text grammar file.';
  }

  return null;
}

function setParseMarkers(errors = []) {
  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  const markers = errors.map(error => {
    const line = Math.max(1, error.location?.line || 1);
    const column = Math.max(1, error.location?.column || 1);
    return {
      startLineNumber: line,
      startColumn: column,
      endLineNumber: line,
      endColumn: column + 1,
      message: error.message || 'Parse error',
      severity: error.severity === 'warning'
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Error,
    };
  });

  monaco.editor.setModelMarkers(model, 'lrama-corral', markers);
}

function getActiveModal() {
  const activeModals = [symbolModal, symbolTypeModal, ruleModal, commandPalette]
    .filter(modal => modal.classList.contains('active'));
  return activeModals.at(-1) || null;
}

function showModal(modal, focusTarget) {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => focusTarget?.focus(), 0);
}

function hideModal(modal) {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function closeTopModal() {
  const activeModal = getActiveModal();
  if (!activeModal) return false;

  if (activeModal === symbolModal) {
    closeSymbolModal(true);
  } else if (activeModal === symbolTypeModal) {
    closeSymbolTypeModal(true);
  } else if (activeModal === ruleModal) {
    closeRuleModal();
  } else if (activeModal === commandPalette) {
    closeCommandPalette();
  }

  return true;
}

function trapModalFocus(event, modal) {
  const focusableElements = [...modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )].filter(element => !element.disabled && element.offsetParent !== null);

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Open symbol modal
 */
function openSymbolModal(type, index = null, symbolData = {}) {
  editingSymbolType = type;
  editingSymbolIndex = index;
  editingSymbolOriginalName = symbolData.name || null;

  // Set title
  if (index === null) {
    symbolModalTitle.textContent = type === 'token' ? 'Add Token' : 'Add Nonterminal';
  } else {
    symbolModalTitle.textContent = type === 'token' ? 'Edit Token' : 'Edit Nonterminal';
  }

  // Set fields
  symbolName.value = symbolData.name || '';
  symbolType.value = symbolData.type || '';

  // Token ID field is only shown for tokens
  if (type === 'token') {
    tokenIdGroup.style.display = 'block';
    tokenId.value = symbolData.token_id || '';
  } else {
    tokenIdGroup.style.display = 'none';
    tokenId.value = '';
  }

  showModal(symbolModal, symbolName);
}

/**
 * Close symbol modal
 */
function closeSymbolModal(clearPending = false) {
  hideModal(symbolModal);
  symbolForm.reset();
  editingSymbolType = null;
  editingSymbolIndex = null;
  editingSymbolOriginalName = null;

  // Clear pending symbol if modal was cancelled (not saved)
  if (clearPending && pendingSymbolToAdd) {
    pendingSymbolToAdd = null;
    // Re-focus on symbol input if rule modal is still open
    if (ruleModal.classList.contains('active')) {
      symbolInput.focus();
    }
  }
}

/**
 * Save symbol
 */
function handleSaveSymbol(event) {
  event.preventDefault();

  const name = symbolName.value.trim();
  if (!name) {
    alert('Symbol name is required');
    return;
  }

  if (!editor) return;

  const model = editor.getModel();
  const content = model.getValue();
  const lines = content.split('\n');

  // Get type information (optional)
  const typeValue = symbolType.value.trim();
  const tokenIdValue = tokenId.value.trim();
  if (tokenIdValue && !/^\d+$/.test(tokenIdValue)) {
    alert('Token ID must be a positive integer');
    return;
  }

  const oldName = editingSymbolOriginalName;
  if (oldName && oldName !== name) {
    const referenceCount = countSymbolReferences(lines, oldName);
    const confirmed = confirm(
      `Rename "${oldName}" to "${name}" in ${referenceCount} grammar reference(s)?`
    );
    if (!confirmed) return;
  }

  if (editingSymbolType === 'token') {
    // Add/edit token
    updateTokenDeclaration(lines, name, typeValue, tokenIdValue);
  } else {
    // Add/edit nonterminal
    updateNonterminalDeclaration(lines, name, typeValue);
  }

  if (oldName && oldName !== name) {
    renameSymbolEverywhere(lines, oldName, name);
  }

  replaceEditorContent(lines.join('\n'));
  editor.focus();
  closeSymbolModal();

  // Re-parse to update parse results
  // If called from rule editing, the parse will add the symbol to RHS
  setTimeout(() => {
    if (!parseBtn.disabled) {
      handleParse().then(() => {
        // After parse completes, add pending symbol to rule if needed
        if (pendingSymbolToAdd) {
          currentRuleSymbols.push(pendingSymbolToAdd);
          updateRHSDisplay();
          pendingSymbolToAdd = null;
          symbolInput.focus();
        }
      });
    }
  }, 100);
}

/**
 * Update token declaration
 */
function updateTokenDeclaration(lines, name, type, tokenIdValue) {
  const oldName = editingSymbolOriginalName;
  upsertTokenDeclaration(lines, name, type, tokenIdValue, oldName);
}

/**
 * Update nonterminal declaration
 */
function updateNonterminalDeclaration(lines, name, type) {
  const oldName = editingSymbolOriginalName;
  upsertNonterminalDeclaration(lines, name, type, oldName);
}

/**
 * Remove from %type declaration
 */
function removeTypeDeclaration(lines, name) {
  removeTypeDeclarationFromLines(lines, name);
}

/**
 * Delete symbol
 */
function handleDeleteSymbol(type, symbolData) {
  const name = symbolData.name;

  if (!editor) return;

  const model = editor.getModel();
  const content = model.getValue();
  const lines = content.split('\n');
  const referenceCount = Math.max(0, countSymbolReferences(lines, name) - 1);
  const referenceMessage = referenceCount > 0
    ? ` It still has ${referenceCount} grammar reference(s), which may become undefined.`
    : '';

  if (!confirm(`Are you sure you want to delete "${name}"?${referenceMessage}`)) {
    return;
  }

  if (type === 'token') {
    // Remove from token declaration
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('%token') && lines[i].includes(name)) {
        lines[i] = removeSymbolFromDeclarationLine(lines[i], name);
        // Delete if line becomes empty
        if (lines[i].trim() === '%token') {
          lines.splice(i, 1);
        }
        break;
      }
    }
  }

  // Also remove from %type declaration
  removeTypeDeclaration(lines, name);

  replaceEditorContent(lines.join('\n'));
  editor.focus();

  // Re-parse to update parse results
  setTimeout(() => {
    if (!parseBtn.disabled) {
      handleParse();
    }
  }, 100);
}

/**
 * Open modal
 */
function openRuleModal(lineNumber = null, lhs = '', rhs = []) {
  editingLineNumber = lineNumber;
  modalTitle.textContent = lineNumber ? 'Edit Rule' : 'Add New Rule';
  ruleLHS.value = lhs;
  currentRuleSymbols = rhs.map(s => s.symbol || s);
  ruleInsertPositionGroup.style.display = lineNumber ? 'none' : 'block';
  updateRHSDisplay();
  showModal(ruleModal, ruleLHS);
}

/**
 * Close modal
 */
function closeRuleModal() {
  hideModal(ruleModal);
  ruleForm.reset();
  currentRuleSymbols = [];
  editingLineNumber = null;
  ruleInsertPositionGroup.style.display = 'block';
  updateRHSDisplay();
}

/**
 * Update RHS symbol display
 */
function updateRHSDisplay() {
  rhsSymbols.innerHTML = '';

  if (currentRuleSymbols.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = 'No symbols yet (empty rule)';
    emptyMsg.style.color = 'var(--text-secondary)';
    emptyMsg.style.fontStyle = 'italic';
    rhsSymbols.appendChild(emptyMsg);
    return;
  }

  currentRuleSymbols.forEach((symbol, index) => {
    const tag = document.createElement('div');
    tag.className = 'symbol-tag';

    const symbolText = document.createElement('span');
    symbolText.textContent = symbol;
    tag.appendChild(symbolText);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${symbol}`);
    removeBtn.addEventListener('click', () => {
      currentRuleSymbols.splice(index, 1);
      updateRHSDisplay();
    });
    tag.appendChild(removeBtn);

    rhsSymbols.appendChild(tag);
  });
}

/**
 * Add symbol
 */
function handleAddSymbol() {
  const symbol = symbolInput.value.trim();
  if (!symbol) return;

  // Check if symbol is already defined
  const isDefined = isSymbolDefined(symbol);

  if (isDefined) {
    // Add to current rule symbols
    currentRuleSymbols.push(symbol);
    updateRHSDisplay();
    symbolInput.value = '';
    symbolInput.focus();
  } else {
    // Symbol is undefined - prompt user to register it
    pendingSymbolToAdd = symbol;
    symbolInput.value = '';
    openSymbolTypeModal(symbol);
  }
}

/**
 * Check if symbol is defined in current grammar
 */
function isSymbolDefined(symbolName) {
  if (!latestParseResult || !latestParseResult.grammar) {
    // No parse result - allow any symbol
    return true;
  }

  const grammar = latestParseResult.grammar;

  // Check in tokens
  if (grammar.tokens && grammar.tokens.some(t => t.name === symbolName)) {
    return true;
  }

  // Check in nonterminals
  if (grammar.nonterminals && grammar.nonterminals.some(n => n.name === symbolName)) {
    return true;
  }

  return false;
}

/**
 * Open symbol type selection modal
 */
function openSymbolTypeModal(symbol) {
  symbolTypeSymbolName.textContent = symbol;
  showModal(symbolTypeModal, registerAsTokenBtn);
}

/**
 * Close symbol type selection modal
 */
function closeSymbolTypeModal(clearPending = true) {
  hideModal(symbolTypeModal);
  // Clear pending symbol if cancelled
  if (clearPending && pendingSymbolToAdd) {
    pendingSymbolToAdd = null;
    // Re-focus on symbol input if rule modal is still open
    if (ruleModal.classList.contains('active')) {
      symbolInput.focus();
    }
  }
}

/**
 * Handle register as token button
 */
function handleRegisterAsToken() {
  if (pendingSymbolToAdd) {
    closeSymbolTypeModal(false); // Don't clear pending symbol
    openSymbolModal('token', null, { name: pendingSymbolToAdd });
  }
}

/**
 * Handle register as nonterminal button
 */
function handleRegisterAsNonterminal() {
  if (pendingSymbolToAdd) {
    closeSymbolTypeModal(false); // Don't clear pending symbol
    openSymbolModal('nonterminal', null, { name: pendingSymbolToAdd });
  }
}

/**
 * Save rule
 */
function handleSaveRule(event) {
  event.preventDefault();

  const lhs = ruleLHS.value.trim();
  if (!lhs) {
    alert('Left-Hand Side (LHS) is required');
    return;
  }

  // Convert rule to string
  const rhs = currentRuleSymbols.length > 0
    ? currentRuleSymbols.join(' ')
    : '/* empty */';
  const ruleText = `${lhs}: ${rhs}\n    ;\n`;

  // Insert into editor
  if (editor) {
    const model = editor.getModel();
    const currentContent = model.getValue();

    if (editingLineNumber) {
      // Edit existing rule
      const lines = currentContent.split('\n');
      let ruleStart = editingLineNumber - 1;
      let ruleEnd = findRuleEndLine(lines, ruleStart);

      replaceEditorLineRange(
        ruleStart + 1,
        ruleEnd + 1,
        ruleText.trim()
      );
    } else {
      const lines = currentContent.split('\n');
      const insertionPoint = getRuleInsertionPoint(lines);

      if (insertionPoint) {
        insertEditorText(
          insertionPoint.lineNumber,
          insertionPoint.column,
          `\n${ruleText}\n`
        );

        editor.setPosition({ lineNumber: insertionPoint.revealLineNumber, column: 1 });
        editor.revealLineInCenter(insertionPoint.revealLineNumber);
      } else {
        // Add to end if %% not found
        replaceEditorContent(`${currentContent}\n\n%%\n\n${ruleText}`);
      }
    }

    editor.focus();
  }

  closeRuleModal();

  // Re-parse to update parse results
  setTimeout(() => {
    if (!parseBtn.disabled) {
      handleParse();
    }
  }, 100);
}

/**
 * Keyboard shortcut handler
 */
function handleKeyboardShortcuts(event) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? event.metaKey : event.ctrlKey;

  const activeModal = getActiveModal();
  if (activeModal) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTopModal();
      return;
    }

    if (event.key === 'Tab') {
      trapModalFocus(event, activeModal);
    }

    return;
  }

  if (modKey && event.shiftKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  // Ctrl/Cmd + Enter: Parse
  if (modKey && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    if (!parseBtn.disabled) {
      handleParse();
    }
    return;
  }

  // Ctrl/Cmd + Shift + Enter: Validate
  if (modKey && event.key === 'Enter' && event.shiftKey) {
    event.preventDefault();
    if (!validateBtn.disabled) {
      handleValidate();
    }
    return;
  }

  // Ctrl/Cmd + S: Download
  if (modKey && event.key === 's') {
    event.preventDefault();
    if (!downloadBtn.disabled) {
      handleDownload();
    }
    return;
  }

  // Ctrl/Cmd + O: Upload
  if (modKey && event.key === 'o') {
    event.preventDefault();
    if (!uploadBtn.disabled) {
      handleUpload();
    }
    return;
  }
}

/**
 * Update status display
 */
function updateStatus(message, type = 'loading') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

/**
 * Clear output area
 */
function clearOutput() {
  outputEl.innerHTML = '';
  addRuleBtn.style.display = 'none';
}

/**
 * Show error
 */
function showError(message, location = null) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';

  // Display if location information is available
  if (location && (location.line > 0 || location.column > 0)) {
    const locationText = location.column > 0
      ? `Line ${location.line}, Column ${location.column}: `
      : `Line ${location.line}: `;

    const locationSpan = document.createElement('strong');
    locationSpan.textContent = locationText;
    errorDiv.appendChild(locationSpan);

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    errorDiv.appendChild(messageSpan);
  } else {
    errorDiv.textContent = message;
  }

  outputEl.appendChild(errorDiv);
}

/**
 * Format and display JSON result
 */
function showResult(title, data) {
  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  titleEl.style.marginBottom = '10px';
  titleEl.style.color = '#2c3e50';

  const preEl = document.createElement('pre');
  preEl.textContent = JSON.stringify(data, null, 2);

  outputEl.appendChild(titleEl);
  outputEl.appendChild(preEl);
}

/**
 * Display structured parse result
 */
function showStructuredResult(data) {
  if (!data.success || !data.grammar) {
    showResult('Parse Result', data);
    return;
  }

  const grammar = data.grammar;

  // Title
  const titleEl = document.createElement('h3');
  titleEl.textContent = 'Grammar Structure';
  titleEl.style.marginBottom = '15px';
  titleEl.style.color = '#2c3e50';
  outputEl.appendChild(titleEl);

  // Start symbol
  if (grammar.start_symbol) {
    const startEl = document.createElement('div');
    startEl.style.marginBottom = '20px';
    const label = document.createElement('strong');
    label.textContent = 'Start Symbol:';
    const code = document.createElement('code');
    code.textContent = grammar.start_symbol;
    code.style.background = 'var(--status-bg)';
    code.style.padding = '2px 6px';
    code.style.borderRadius = '3px';
    code.style.marginLeft = '4px';
    startEl.append(label, code);
    outputEl.appendChild(startEl);
  }

  if (grammar.metadata || (grammar.analysis_warnings && grammar.analysis_warnings.length > 0)) {
    outputEl.appendChild(createMetadataSection(grammar.metadata, grammar.analysis_warnings || []));
  }

  // Token list (with edit/delete buttons)
  if (grammar.tokens && grammar.tokens.length > 0) {
    const tokensSection = createSymbolSection(
      'Tokens',
      grammar.tokens.map(t => ({
        name: t.name,
        type: t.type || '-',
        id: t.token_id !== null ? t.token_id : '-'
      })),
      ['Name', 'Type', 'ID'],
      'token',
      grammar.tokens
    );
    outputEl.appendChild(tokensSection);
  }

  // Nonterminal list (with edit/delete buttons)
  if (grammar.nonterminals && grammar.nonterminals.length > 0) {
    const ntermsSection = createSymbolSection(
      'Nonterminals',
      grammar.nonterminals.map(n => ({
        name: n.name,
        type: n.type || '-'
      })),
      ['Name', 'Type'],
      'nonterminal',
      grammar.nonterminals
    );
    outputEl.appendChild(ntermsSection);
  }

  // Display conflict information
  if (grammar.conflicts && grammar.conflicts.length > 0) {
    const conflictsSection = createConflictsSection(grammar.conflicts);
    outputEl.appendChild(conflictsSection);
  }

  if (grammar.expectations) {
    outputEl.appendChild(createExpectationsSection(grammar.expectations));
  }

  if (grammar.nullable_symbols && grammar.nullable_symbols.length > 0) {
    outputEl.appendChild(createNullableSection(grammar.nullable_symbols));
  }

  if (grammar.lint && hasLintFindings(grammar.lint)) {
    outputEl.appendChild(createLintSection(grammar.lint));
  }

  // Display First/Follow sets
  if (grammar.first_sets && grammar.follow_sets) {
    const firstFollowSection = createFirstFollowSection(grammar.first_sets, grammar.follow_sets);
    outputEl.appendChild(firstFollowSection);
  }

  // Display State Transition Diagram
  if (grammar.state_transitions && grammar.state_transitions.length > 0) {
    const stateSection = createStateTransitionSection(grammar.state_transitions);
    if (stateSection) {
      outputEl.appendChild(stateSection);
    }
  }

  // Display Syntax Diagrams
  if (grammar.syntax_diagrams && Object.keys(grammar.syntax_diagrams).length > 0) {
    const diagramsSection = createSyntaxDiagramsSection(grammar.syntax_diagrams);
    outputEl.appendChild(diagramsSection);
  }

  // Rule list
  if (grammar.rules && grammar.rules.length > 0) {
    const rulesSection = createRulesSection(grammar.rules);
    outputEl.appendChild(rulesSection);
  }
}

function createMetadataSection(metadata, warnings) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = 'Parser Runtime';
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  if (metadata?.lrama_version) {
    const version = document.createElement('p');
    version.textContent = `Lrama ${metadata.lrama_version}`;
    version.style.color = 'var(--text-secondary)';
    version.style.fontSize = '13px';
    section.appendChild(version);
  }

  if (warnings.length > 0) {
    const list = document.createElement('ul');
    list.style.marginTop = '10px';
    list.style.paddingLeft = '18px';
    warnings.forEach(warning => {
      const item = document.createElement('li');
      item.textContent = `${warning.phase}: ${warning.message}`;
      item.style.color = 'var(--status-loading-text)';
      item.style.fontSize = '13px';
      list.appendChild(item);
    });
    section.appendChild(list);
  }

  return section;
}

function createExpectationsSection(expectations) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = 'Conflict Expectations';
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  const rows = [
    ['Shift/Reduce', expectations.shift_reduce],
    ['Reduce/Reduce', expectations.reduce_reduce],
  ];

  rows.forEach(([label, data]) => {
    if (!data) return;
    const row = document.createElement('div');
    row.style.fontSize = '13px';
    row.style.color = 'var(--text-secondary)';
    row.style.marginBottom = '4px';
    const status = data.satisfied === null
      ? 'not declared'
      : data.satisfied ? 'satisfied' : 'mismatch';
    row.textContent = `${label}: actual ${data.actual}, expected ${data.expected ?? 'none'} (${status})`;
    section.appendChild(row);
  });

  return section;
}

function createNullableSection(nullableSymbols) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `Nullable Nonterminals (${nullableSymbols.length})`;
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.gap = '6px';
  container.style.flexWrap = 'wrap';

  nullableSymbols.forEach(symbol => {
    const tag = document.createElement('span');
    tag.textContent = symbol;
    tag.style.padding = '3px 8px';
    tag.style.borderRadius = '3px';
    tag.style.fontSize = '12px';
    tag.style.fontFamily = "'Courier New', monospace";
    tag.style.background = 'rgba(155, 89, 182, 0.15)';
    tag.style.color = '#8e44ad';
    tag.style.border = '1px solid rgba(155, 89, 182, 0.3)';
    container.appendChild(tag);
  });

  section.appendChild(container);
  return section;
}

function hasLintFindings(lint) {
  return Object.values(lint).some(value => Array.isArray(value) && value.length > 0);
}

function createLintSection(lint) {
  const labels = {
    undefined_symbols: 'Undefined Symbols',
    unused_tokens: 'Unused Tokens',
    unreachable_nonterminals: 'Unreachable Nonterminals',
    unused_rules: 'Unused Rules',
    non_productive_nonterminals: 'Nonproductive Nonterminals',
    referenced_nonterminals_without_rules: 'Referenced Nonterminals Without Rules',
    declared_nonterminals_without_rules: 'Declared Nonterminals Without Rules',
  };

  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = 'Grammar Lint';
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  Object.entries(labels).forEach(([key, label]) => {
    const values = lint[key] || [];
    if (values.length === 0) return;

    const group = document.createElement('div');
    group.style.marginBottom = '10px';

    const groupTitle = document.createElement('div');
    groupTitle.textContent = `${label}:`;
    groupTitle.style.fontWeight = '600';
    groupTitle.style.fontSize = '13px';
    groupTitle.style.marginBottom = '4px';
    group.appendChild(groupTitle);

    const valuesEl = document.createElement('div');
    valuesEl.style.display = 'flex';
    valuesEl.style.flexWrap = 'wrap';
    valuesEl.style.gap = '6px';

    values.forEach(value => {
      const tag = document.createElement('span');
      tag.textContent = String(value);
      tag.style.padding = '3px 8px';
      tag.style.borderRadius = '3px';
      tag.style.fontSize = '12px';
      tag.style.fontFamily = "'Courier New', monospace";
      tag.style.background = 'rgba(243, 156, 18, 0.15)';
      tag.style.color = '#b36b00';
      tag.style.border = '1px solid rgba(243, 156, 18, 0.3)';
      valuesEl.appendChild(tag);
    });

    group.appendChild(valuesEl);
    section.appendChild(group);
  });

  return section;
}

/**
 * Create conflict section
 */
function createConflictsSection(conflicts) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  // Title
  const titleEl = document.createElement('h4');
  titleEl.textContent = `Potential Conflicts (${conflicts.length})`;
  titleEl.style.color = conflicts.some(c => c.severity === 'error') ? '#e74c3c' : '#f39c12';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  // Description
  const descEl = document.createElement('p');
  descEl.textContent = 'These are potential shift/reduce or reduce/reduce conflicts detected based on FIRST and FOLLOW set analysis';
  descEl.style.color = 'var(--text-secondary)';
  descEl.style.fontSize = '13px';
  descEl.style.marginBottom = '15px';
  section.appendChild(descEl);

  // Conflict list
  conflicts.forEach((conflict, index) => {
    const conflictCard = document.createElement('div');
    conflictCard.style.background = conflict.severity === 'error'
      ? 'rgba(231, 76, 60, 0.1)'
      : 'rgba(243, 156, 18, 0.1)';
    conflictCard.style.border = `2px solid ${conflict.severity === 'error' ? '#e74c3c' : '#f39c12'}`;
    conflictCard.style.borderRadius = '6px';
    conflictCard.style.padding = '15px';
    conflictCard.style.marginBottom = '12px';

    // Severity tag
    const severityTag = document.createElement('span');
    severityTag.textContent = conflict.severity === 'error' ? '⚠️ ERROR' : '⚡ WARNING';
    severityTag.style.display = 'inline-block';
    severityTag.style.padding = '3px 8px';
    severityTag.style.borderRadius = '3px';
    severityTag.style.fontSize = '11px';
    severityTag.style.fontWeight = 'bold';
    severityTag.style.marginBottom = '8px';
    severityTag.style.background = conflict.severity === 'error' ? '#e74c3c' : '#f39c12';
    severityTag.style.color = 'white';
    conflictCard.appendChild(severityTag);

    // Type tag
    const typeTag = document.createElement('span');
    typeTag.textContent = conflict.type.replace(/_/g, ' ').toUpperCase();
    typeTag.style.display = 'inline-block';
    typeTag.style.padding = '3px 8px';
    typeTag.style.borderRadius = '3px';
    typeTag.style.fontSize = '11px';
    typeTag.style.fontWeight = '600';
    typeTag.style.marginLeft = '8px';
    typeTag.style.marginBottom = '8px';
    typeTag.style.background = 'var(--bg-secondary)';
    typeTag.style.color = 'var(--text-primary)';
    typeTag.style.border = '1px solid var(--border-color)';
    conflictCard.appendChild(typeTag);

    // Message
    const messageEl = document.createElement('div');
    messageEl.textContent = conflict.message;
    messageEl.style.color = 'var(--text-primary)';
    messageEl.style.fontSize = '14px';
    messageEl.style.marginTop = '10px';
    messageEl.style.marginBottom = '10px';
    conflictCard.appendChild(messageEl);

    // Related rules
    if (conflict.rules && conflict.rules.length > 0) {
      const rulesLabel = document.createElement('div');
      rulesLabel.textContent = 'Related rules:';
      rulesLabel.style.fontSize = '12px';
      rulesLabel.style.fontWeight = '600';
      rulesLabel.style.color = 'var(--text-secondary)';
      rulesLabel.style.marginTop = '8px';
      rulesLabel.style.marginBottom = '4px';
      conflictCard.appendChild(rulesLabel);

      const rulesDiv = document.createElement('div');
      rulesDiv.style.display = 'flex';
      rulesDiv.style.gap = '6px';
      rulesDiv.style.flexWrap = 'wrap';

      conflict.rules.forEach(ruleId => {
        const ruleSpan = document.createElement('span');
        ruleSpan.textContent = `Rule #${ruleId}`;
        ruleSpan.style.padding = '4px 8px';
        ruleSpan.style.borderRadius = '3px';
        ruleSpan.style.fontSize = '12px';
        ruleSpan.style.fontFamily = "'Courier New', monospace";
        ruleSpan.style.background = 'var(--bg-secondary)';
        ruleSpan.style.color = 'var(--btn-primary)';
        ruleSpan.style.border = '1px solid var(--btn-primary)';
        ruleSpan.style.fontWeight = 'bold';
        rulesDiv.appendChild(ruleSpan);
      });

      conflictCard.appendChild(rulesDiv);
    }

    // Related tokens
    if (conflict.tokens && conflict.tokens.length > 0) {
      const tokensLabel = document.createElement('div');
      tokensLabel.textContent = 'Conflicting tokens:';
      tokensLabel.style.fontSize = '12px';
      tokensLabel.style.fontWeight = '600';
      tokensLabel.style.color = 'var(--text-secondary)';
      tokensLabel.style.marginTop = '8px';
      tokensLabel.style.marginBottom = '4px';
      conflictCard.appendChild(tokensLabel);

      const tokensDiv = document.createElement('div');
      tokensDiv.style.display = 'flex';
      tokensDiv.style.gap = '6px';
      tokensDiv.style.flexWrap = 'wrap';

      conflict.tokens.forEach(token => {
        const tokenSpan = document.createElement('span');
        tokenSpan.textContent = token;
        tokenSpan.style.padding = '4px 8px';
        tokenSpan.style.borderRadius = '3px';
        tokenSpan.style.fontSize = '12px';
        tokenSpan.style.fontFamily = "'Courier New', monospace";
        tokenSpan.style.background = 'rgba(231, 76, 60, 0.15)';
        tokenSpan.style.color = '#c0392b';
        tokenSpan.style.border = '1px solid rgba(231, 76, 60, 0.3)';
        tokenSpan.style.fontWeight = 'bold';
        tokensDiv.appendChild(tokenSpan);
      });

      conflictCard.appendChild(tokensDiv);
    }

    section.appendChild(conflictCard);
  });

  return section;
}

/**
 * Create First/Follow set section
 */
function createFirstFollowSection(firstSets, followSets) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  // Title
  const titleEl = document.createElement('h4');
  titleEl.textContent = 'First/Follow Sets';
  titleEl.style.color = '#34495e';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  // Description
  const descEl = document.createElement('p');
  descEl.textContent = 'First and Follow sets for each nonterminal symbol';
  descEl.style.color = 'var(--text-secondary)';
  descEl.style.fontSize = '13px';
  descEl.style.marginBottom = '15px';
  section.appendChild(descEl);

  // Grid container
  const gridContainer = document.createElement('div');
  gridContainer.style.display = 'grid';
  gridContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(350px, 1fr))';
  gridContainer.style.gap = '15px';

  // First/Follow cards for each nonterminal
  const symbols = Object.keys(firstSets).sort();

  symbols.forEach(symbol => {
    const card = document.createElement('div');
    card.style.background = 'var(--bg-secondary)';
    card.style.border = '1px solid var(--border-color)';
    card.style.borderRadius = '6px';
    card.style.padding = '15px';
    card.style.transition = 'all 0.2s';

    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.boxShadow = '0 4px 12px var(--shadow)';
      card.style.borderColor = 'var(--btn-primary)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.boxShadow = 'none';
      card.style.borderColor = 'var(--border-color)';
    });

    // Symbol name
    const symbolName = document.createElement('div');
    symbolName.textContent = symbol;
    symbolName.style.fontSize = '16px';
    symbolName.style.fontWeight = 'bold';
    symbolName.style.color = 'var(--btn-primary)';
    symbolName.style.marginBottom = '12px';
    symbolName.style.fontFamily = "'Courier New', monospace";
    card.appendChild(symbolName);

    // First set
    const firstLabel = document.createElement('div');
    firstLabel.textContent = 'FIRST:';
    firstLabel.style.fontSize = '11px';
    firstLabel.style.fontWeight = '600';
    firstLabel.style.color = 'var(--text-secondary)';
    firstLabel.style.marginBottom = '5px';
    card.appendChild(firstLabel);

    const firstDiv = document.createElement('div');
    firstDiv.style.display = 'flex';
    firstDiv.style.flexWrap = 'wrap';
    firstDiv.style.gap = '6px';
    firstDiv.style.marginBottom = '12px';

    const firstList = firstSets[symbol] || [];
    if (firstList.length > 0) {
      firstList.forEach(token => {
        const tokenSpan = document.createElement('span');
        tokenSpan.textContent = token;
        tokenSpan.style.padding = '3px 8px';
        tokenSpan.style.borderRadius = '3px';
        tokenSpan.style.fontSize = '12px';
        tokenSpan.style.fontFamily = "'Courier New', monospace";

        // Special color for ε
        if (token === 'ε') {
          tokenSpan.style.background = 'rgba(155, 89, 182, 0.15)';
          tokenSpan.style.color = '#8e44ad';
          tokenSpan.style.border = '1px solid rgba(155, 89, 182, 0.3)';
          tokenSpan.style.fontStyle = 'italic';
        } else {
          tokenSpan.style.background = 'rgba(46, 204, 113, 0.15)';
          tokenSpan.style.color = '#27ae60';
          tokenSpan.style.border = '1px solid rgba(46, 204, 113, 0.3)';
        }

        firstDiv.appendChild(tokenSpan);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.textContent = '(empty)';
      emptySpan.style.color = 'var(--text-secondary)';
      emptySpan.style.fontStyle = 'italic';
      emptySpan.style.fontSize = '12px';
      firstDiv.appendChild(emptySpan);
    }

    card.appendChild(firstDiv);

    // Follow set
    const followLabel = document.createElement('div');
    followLabel.textContent = 'FOLLOW:';
    followLabel.style.fontSize = '11px';
    followLabel.style.fontWeight = '600';
    followLabel.style.color = 'var(--text-secondary)';
    followLabel.style.marginBottom = '5px';
    card.appendChild(followLabel);

    const followDiv = document.createElement('div');
    followDiv.style.display = 'flex';
    followDiv.style.flexWrap = 'wrap';
    followDiv.style.gap = '6px';

    const followList = followSets[symbol] || [];
    if (followList.length > 0) {
      followList.forEach(token => {
        const tokenSpan = document.createElement('span');
        tokenSpan.textContent = token;
        tokenSpan.style.padding = '3px 8px';
        tokenSpan.style.borderRadius = '3px';
        tokenSpan.style.fontSize = '12px';
        tokenSpan.style.fontFamily = "'Courier New', monospace";

        // Special color for $
        if (token === '$') {
          tokenSpan.style.background = 'rgba(231, 76, 60, 0.15)';
          tokenSpan.style.color = '#c0392b';
          tokenSpan.style.border = '1px solid rgba(231, 76, 60, 0.3)';
          tokenSpan.style.fontWeight = 'bold';
        } else {
          tokenSpan.style.background = 'rgba(52, 152, 219, 0.15)';
          tokenSpan.style.color = '#2980b9';
          tokenSpan.style.border = '1px solid rgba(52, 152, 219, 0.3)';
        }

        followDiv.appendChild(tokenSpan);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.textContent = '(empty)';
      emptySpan.style.color = 'var(--text-secondary)';
      emptySpan.style.fontStyle = 'italic';
      emptySpan.style.fontSize = '12px';
      followDiv.appendChild(emptySpan);
    }

    card.appendChild(followDiv);
    gridContainer.appendChild(card);
  });

  section.appendChild(gridContainer);
  return section;
}

/**
 * Create table section
 */
function createSection(title, items, headers) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `${title} (${items.length})`;
  titleEl.style.color = '#34495e';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.background = 'white';
  table.style.border = '1px solid #ddd';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.background = '#34495e';
  headerRow.style.color = 'white';

  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px 12px';
    th.style.textAlign = 'left';
    th.style.borderBottom = '2px solid #2c3e50';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  items.forEach((item, index) => {
    const row = document.createElement('tr');
    row.style.background = index % 2 === 0 ? '#f9f9f9' : 'white';

    Object.values(item).forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      td.style.padding = '6px 12px';
      td.style.borderBottom = '1px solid #ddd';
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  section.appendChild(table);

  return section;
}

/**
 * シンボル用のCreate table section（編集/削除ボタン付き）
 */
function createSymbolSection(title, items, headers, symbolType, originalData) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  // Header（タイトル + 追加ボタン）
  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.marginBottom = '10px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `${title} (${items.length})`;
  titleEl.style.color = '#34495e';
  titleEl.style.fontSize = '16px';
  titleEl.style.margin = '0';
  headerDiv.appendChild(titleEl);

  const addBtn = document.createElement('button');
  addBtn.textContent = `+ Add ${symbolType === 'token' ? 'Token' : 'Nonterminal'}`;
  addBtn.className = 'secondary';
  addBtn.style.padding = '6px 12px';
  addBtn.style.fontSize = '12px';
  addBtn.addEventListener('click', () => {
    openSymbolModal(symbolType);
  });
  headerDiv.appendChild(addBtn);

  section.appendChild(headerDiv);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.background = 'var(--bg-secondary)';
  table.style.border = '1px solid var(--border-color)';

  // Header (add Actions column)
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.background = '#34495e';
  headerRow.style.color = 'white';

  [...headers, 'Actions'].forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px 12px';
    th.style.textAlign = 'left';
    th.style.borderBottom = '2px solid #2c3e50';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  items.forEach((item, index) => {
    const row = document.createElement('tr');
    row.style.background = index % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)';

    // Data columns
    Object.values(item).forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      td.style.padding = '6px 12px';
      td.style.borderBottom = '1px solid var(--border-color)';
      td.style.color = 'var(--text-primary)';
      row.appendChild(td);
    });

    // Action column
    const actionTd = document.createElement('td');
    actionTd.style.padding = '6px 12px';
    actionTd.style.borderBottom = '1px solid var(--border-color)';
    actionTd.style.display = 'flex';
    actionTd.style.gap = '8px';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️ Edit';
    editBtn.setAttribute('aria-label', `Edit ${item.name}`);
    editBtn.className = 'secondary';
    editBtn.style.padding = '4px 8px';
    editBtn.style.fontSize = '11px';
    editBtn.addEventListener('click', () => {
      openSymbolModal(symbolType, index, originalData[index]);
    });
    actionTd.appendChild(editBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️ Delete';
    deleteBtn.setAttribute('aria-label', `Delete ${item.name}`);
    deleteBtn.className = 'secondary';
    deleteBtn.style.padding = '4px 8px';
    deleteBtn.style.fontSize = '11px';
    deleteBtn.addEventListener('click', () => {
      handleDeleteSymbol(symbolType, originalData[index]);
    });
    actionTd.appendChild(deleteBtn);

    row.appendChild(actionTd);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  section.appendChild(table);

  return section;
}

/**
 * Create rule card display
 */
function createRulesCardView(rules) {
  const container = document.createElement('div');
  container.className = 'rules-grid';

  rules.forEach((rule) => {
    const card = document.createElement('div');
    card.className = 'rule-card';

    // Click to jump to editor
    if (rule.line_number) {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.addEventListener('click', () => {
        if (editor) {
          editor.revealLineInCenter(rule.line_number);
          editor.setPosition({ lineNumber: rule.line_number, column: 1 });
          editor.focus();
        }
      });
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (editor) {
          editor.revealLineInCenter(rule.line_number);
          editor.setPosition({ lineNumber: rule.line_number, column: 1 });
          editor.focus();
        }
      });
      card.title = `Click to jump to line ${rule.line_number}`;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'rule-card-header';

    const idSpan = document.createElement('span');
    idSpan.className = 'rule-card-id';
    idSpan.textContent = `Rule #${rule.id}`;
    header.appendChild(idSpan);

    if (rule.line_number) {
      const lineSpan = document.createElement('span');
      lineSpan.className = 'rule-card-line';
      lineSpan.textContent = `Line ${rule.line_number}`;
      header.appendChild(lineSpan);
    }

    card.appendChild(header);

    // LHS
    const lhsDiv = document.createElement('div');
    lhsDiv.className = 'rule-card-lhs';
    lhsDiv.textContent = rule.lhs;
    card.appendChild(lhsDiv);

    // Arrow and RHS
    const rhsContainer = document.createElement('div');
    rhsContainer.className = 'rule-card-rhs';

    const arrow = document.createElement('span');
    arrow.className = 'rule-card-arrow';
    arrow.textContent = '→';
    rhsContainer.appendChild(arrow);

    if (rule.rhs && rule.rhs.length > 0) {
      rule.rhs.forEach((sym) => {
        const symSpan = document.createElement('span');
        symSpan.className = `rule-symbol ${sym.type}`;
        symSpan.textContent = sym.symbol;
        rhsContainer.appendChild(symSpan);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'rule-symbol empty';
      emptySpan.textContent = 'ε (empty)';
      rhsContainer.appendChild(emptySpan);
    }

    card.appendChild(rhsContainer);

    // アクションボタン
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'rule-card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = '✏️ Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card click event
      openRuleModal(rule.line_number, rule.lhs, rule.rhs || []);
    });
    actionsDiv.appendChild(editBtn);

    card.appendChild(actionsDiv);
    container.appendChild(card);
  });

  return container;
}

/**
 * Create State Transition Diagram section
 */
function createStateTransitionSection(stateTransitions) {
  if (!stateTransitions || stateTransitions.length === 0) {
    return null;
  }

  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  // Title
  const titleEl = document.createElement('h4');
  titleEl.textContent = `State Transition Diagram (${stateTransitions.length} states)`;
  titleEl.style.color = '#34495e';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  // Description
  const descEl = document.createElement('p');
  descEl.textContent = 'LALR(1) parser state machine visualization';
  descEl.style.color = 'var(--text-secondary)';
  descEl.style.fontSize = '13px';
  descEl.style.marginBottom = '15px';
  section.appendChild(descEl);

  // グラフコンテナ
  const graphContainer = document.createElement('div');
  graphContainer.style.background = 'var(--bg-secondary)';
  graphContainer.style.border = '1px solid var(--border-color)';
  graphContainer.style.borderRadius = '6px';
  graphContainer.style.padding = '20px';
  graphContainer.style.overflow = 'auto';
  graphContainer.style.position = 'relative';

  // Export buttons
  const exportDiv = document.createElement('div');
  exportDiv.style.marginBottom = '15px';
  exportDiv.style.display = 'flex';
  exportDiv.style.gap = '8px';

  const svgExportBtn = document.createElement('button');
  svgExportBtn.textContent = '💾 Export SVG';
  svgExportBtn.className = 'secondary';
  svgExportBtn.style.padding = '6px 12px';
  svgExportBtn.style.fontSize = '12px';
  exportDiv.appendChild(svgExportBtn);

  const pngExportBtn = document.createElement('button');
  pngExportBtn.textContent = '🖼️ Export PNG';
  pngExportBtn.className = 'secondary';
  pngExportBtn.style.padding = '6px 12px';
  pngExportBtn.style.fontSize = '12px';
  exportDiv.appendChild(pngExportBtn);

  graphContainer.appendChild(exportDiv);

  // Generate SVG graph
  const svg = createStateTransitionGraph(stateTransitions);
  graphContainer.appendChild(svg);

  // Export button event listeners
  svgExportBtn.addEventListener('click', () => {
    downloadSVG(svg, 'state-transition-diagram.svg');
    updateStatus('SVG exported: state-transition-diagram.svg', 'ready');
  });

  pngExportBtn.addEventListener('click', () => {
    downloadPNG(svg, 'state-transition-diagram.png');
    updateStatus('PNG export started: state-transition-diagram.png', 'ready');
  });

  section.appendChild(graphContainer);

  // State details table
  const detailsSection = createStateDetailsTable(stateTransitions);
  section.appendChild(detailsSection);

  return section;
}

/**
 * Create SVG for state transition graph
 */
function createStateTransitionGraph(stateTransitions) {
  const width = 1200;
  const height = Math.max(600, stateTransitions.length * 80);
  const nodeRadius = 30;
  const levelWidth = 200;

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.background = 'var(--bg-primary)';
  svg.style.border = '1px solid var(--border-color)';
  svg.style.borderRadius = '4px';

  // Layout calculation (simple hierarchical layout)
  const positions = calculateStatePositions(stateTransitions, width, height, nodeRadius);

  // Arrow marker definition
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 3, 0 6');
  polygon.setAttribute('fill', '#666');
  marker.appendChild(polygon);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Draw edges (transitions)
  stateTransitions.forEach((state, index) => {
    const fromPos = positions[state.id];
    if (!fromPos) return;

    // Draw Shift transitions
    state.shifts.forEach(shift => {
      const toPos = positions[shift.to_state];
      if (toPos) {
        drawEdge(svg, fromPos, toPos, shift.symbol, '#2ecc71', nodeRadius);
      }
    });

    // Draw Goto transitions
    state.gotos.forEach(goto => {
      const toPos = positions[goto.to_state];
      if (toPos) {
        drawEdge(svg, fromPos, toPos, goto.symbol, '#3498db', nodeRadius);
      }
    });
  });

  // Draw nodes (states)
  stateTransitions.forEach((state, index) => {
    const pos = positions[state.id];
    if (!pos) return;

    const hasConflict = state.error || (state.conflicts && state.conflicts.length > 0);
    drawStateNode(svg, pos, state.id, hasConflict, nodeRadius);
  });

  return svg;
}

/**
 * Calculate state positions (simple level-based layout)
 */
function calculateStatePositions(stateTransitions, width, height, nodeRadius) {
  const positions = {};
  const margin = 50;
  const usableWidth = width - 2 * margin;
  const usableHeight = height - 2 * margin;

  // Calculate hierarchical levels (BFS)
  const levels = {};
  const visited = new Set();
  const queue = [0]; // Start from state 0
  levels[0] = 0;
  visited.add(0);

  while (queue.length > 0) {
    const stateId = queue.shift();
    const state = stateTransitions.find(s => s.id === stateId);
    if (!state) continue;

    const currentLevel = levels[stateId];

    // Add transition destinations
    [...state.shifts, ...state.gotos].forEach(trans => {
      if (!visited.has(trans.to_state)) {
        visited.add(trans.to_state);
        levels[trans.to_state] = currentLevel + 1;
        queue.push(trans.to_state);
      }
    });
  }

  // Add unvisited states
  stateTransitions.forEach((state, index) => {
    if (!visited.has(state.id)) {
      levels[state.id] = Math.floor(index / 5);
    }
  });

  // Group by level
  const levelGroups = {};
  Object.keys(levels).forEach(stateId => {
    const level = levels[stateId];
    if (!levelGroups[level]) levelGroups[level] = [];
    levelGroups[level].push(parseInt(stateId));
  });

  // Calculate positions
  const maxLevel = Math.max(...Object.values(levels));
  Object.keys(levelGroups).forEach(level => {
    const states = levelGroups[level];
    const levelNum = parseInt(level);
    const x = maxLevel === 0
      ? width / 2
      : margin + (levelNum / maxLevel) * usableWidth;

    states.forEach((stateId, index) => {
      const y = margin + ((index + 0.5) / states.length) * usableHeight;
      positions[stateId] = { x, y };
    });
  });

  return positions;
}

/**
 * Draw edge (transition)
 */
function drawEdge(svg, fromPos, toPos, label, color, nodeRadius) {
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const angle = Math.atan2(dy, dx);

  // Adjust to start from node boundary
  const startX = fromPos.x + Math.cos(angle) * nodeRadius;
  const startY = fromPos.y + Math.sin(angle) * nodeRadius;
  const endX = toPos.x - Math.cos(angle) * (nodeRadius + 10);
  const endY = toPos.y - Math.sin(angle) * (nodeRadius + 10);

  // Draw path
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  // Use curve (Bezier curve)
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const controlOffset = 20;
  const controlX = midX - dy / 10;
  const controlY = midY + dx / 10;

  path.setAttribute('d', `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  path.setAttribute('marker-end', 'url(#arrowhead)');
  svg.appendChild(path);

  // Draw label
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', controlX);
  text.setAttribute('y', controlY - 5);
  text.setAttribute('font-size', '12');
  text.setAttribute('fill', color);
  text.setAttribute('text-anchor', 'middle');
  text.textContent = label;
  svg.appendChild(text);
}

/**
 * Draw state node
 */
function drawStateNode(svg, pos, stateId, hasConflict, radius) {
  // Draw circle
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', pos.x);
  circle.setAttribute('cy', pos.y);
  circle.setAttribute('r', radius);
  circle.setAttribute('fill', hasConflict ? '#e74c3c' : '#3498db');
  circle.setAttribute('stroke', '#2c3e50');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);

  // Draw text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', pos.x);
  text.setAttribute('y', pos.y + 5);
  text.setAttribute('font-size', '14');
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('fill', 'white');
  text.setAttribute('text-anchor', 'middle');
  text.textContent = stateId;
  svg.appendChild(text);
}

/**
 * Create state details table
 */
function createStateDetailsTable(stateTransitions) {
  const section = document.createElement('div');
  section.style.marginTop = '20px';

  const titleEl = document.createElement('h5');
  titleEl.textContent = 'State Details';
  titleEl.style.color = '#34495e';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '14px';
  section.appendChild(titleEl);

  const list = document.createElement('div');
  section.appendChild(list);

  const renderStateCards = (states) => {
    states.forEach(state => {
      const stateCard = document.createElement('details');
      stateCard.style.marginBottom = '10px';
      stateCard.style.background = 'var(--bg-secondary)';
      stateCard.style.border = '1px solid var(--border-color)';
      stateCard.style.borderRadius = '4px';
      stateCard.style.padding = '10px';

    const summary = document.createElement('summary');
    summary.textContent = `State ${state.id}`;
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = 'bold';
    summary.style.color = 'var(--btn-primary)';
    stateCard.appendChild(summary);

    const content = document.createElement('div');
    content.style.marginTop = '10px';
    content.style.fontSize = '13px';

    // Items
    if (state.items && state.items.length > 0) {
      const itemsDiv = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = 'Items:';
      itemsDiv.appendChild(label);
      itemsDiv.appendChild(document.createElement('br'));
      state.items.forEach(item => {
        const itemLine = document.createElement('div');
        itemLine.textContent = `  ${item.display}`;
        itemLine.style.fontFamily = 'monospace';
        itemLine.style.fontSize = '12px';
        itemLine.style.marginLeft = '10px';
        itemsDiv.appendChild(itemLine);
      });
      content.appendChild(itemsDiv);
    }

    // Shift transitions
    if (state.shifts && state.shifts.length > 0) {
      const shiftsDiv = document.createElement('div');
      shiftsDiv.style.marginTop = '8px';
      const label = document.createElement('strong');
      label.textContent = 'Shifts: ';
      const text = document.createElement('span');
      text.textContent = state.shifts.map(s => `${s.symbol} → ${s.to_state}`).join(', ');
      shiftsDiv.append(label, text);
      content.appendChild(shiftsDiv);
    }

    // Goto transitions
    if (state.gotos && state.gotos.length > 0) {
      const gotosDiv = document.createElement('div');
      gotosDiv.style.marginTop = '8px';
      const label = document.createElement('strong');
      label.textContent = 'Gotos: ';
      const text = document.createElement('span');
      text.textContent = state.gotos.map(g => `${g.symbol} → ${g.to_state}`).join(', ');
      gotosDiv.append(label, text);
      content.appendChild(gotosDiv);
    }

    // Reduce actions
    if (state.reduces && state.reduces.length > 0) {
      const reducesDiv = document.createElement('div');
      reducesDiv.style.marginTop = '8px';
      const label = document.createElement('strong');
      label.textContent = 'Reduces: ';
      const text = document.createElement('span');
      text.textContent = state.reduces.map(r => `${r.symbol} → Rule #${r.rule_id}`).join(', ');
      reducesDiv.append(label, text);
      content.appendChild(reducesDiv);
    }

    if (state.conflicts && state.conflicts.length > 0) {
      const conflictsDiv = document.createElement('div');
      conflictsDiv.style.marginTop = '8px';
      const label = document.createElement('strong');
      label.textContent = 'Conflicts: ';
      const text = document.createElement('span');
      text.textContent = state.conflicts
        .map(conflict => `${conflict.type.replace(/_/g, '/')} (${conflict.tokens.join(', ')})`)
        .join(', ');
      conflictsDiv.append(label, text);
      content.appendChild(conflictsDiv);
    }

    stateCard.appendChild(content);
      list.appendChild(stateCard);
    });
  };

  // Collapsible state list
  renderStateCards(stateTransitions.slice(0, 10));

  if (stateTransitions.length > 10) {
    const showAllBtn = document.createElement('button');
    showAllBtn.className = 'secondary';
    showAllBtn.textContent = `Show ${stateTransitions.length - 10} more states`;
    showAllBtn.style.marginTop = '10px';
    showAllBtn.addEventListener('click', () => {
      renderStateCards(stateTransitions.slice(10));
      showAllBtn.remove();
    });
    section.appendChild(showAllBtn);
  }

  return section;
}

/**
 * Create Syntax Diagrams section
 */
function createSyntaxDiagramsSection(syntaxDiagrams) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  // Title
  const titleEl = document.createElement('h4');
  titleEl.textContent = `Syntax Diagrams (${Object.keys(syntaxDiagrams).length})`;
  titleEl.style.color = '#34495e';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  // Description
  const descEl = document.createElement('p');
  descEl.textContent = 'Visual railroad diagrams for each nonterminal production rule';
  descEl.style.color = 'var(--text-secondary)';
  descEl.style.fontSize = '13px';
  descEl.style.marginBottom = '15px';
  section.appendChild(descEl);

  // Syntax diagrams for each nonterminal
  const symbols = Object.keys(syntaxDiagrams).sort();

  symbols.forEach(symbol => {
    const diagramCard = document.createElement('div');
    diagramCard.style.background = 'var(--bg-secondary)';
    diagramCard.style.border = '1px solid var(--border-color)';
    diagramCard.style.borderRadius = '6px';
    diagramCard.style.padding = '20px';
    diagramCard.style.marginBottom = '15px';
    diagramCard.style.overflow = 'auto';

    // Symbol nameヘッダー
    const header = document.createElement('div');
    header.style.marginBottom = '15px';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '2px solid var(--border-color)';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const symbolName = document.createElement('div');
    symbolName.textContent = symbol;
    symbolName.style.fontSize = '18px';
    symbolName.style.fontWeight = 'bold';
    symbolName.style.color = 'var(--btn-primary)';
    symbolName.style.fontFamily = "'Courier New', monospace";
    header.appendChild(symbolName);

    // Export buttons群
    const exportButtons = document.createElement('div');
    exportButtons.style.display = 'flex';
    exportButtons.style.gap = '8px';

    const svgExportBtn = document.createElement('button');
    svgExportBtn.textContent = '💾 SVG';
    svgExportBtn.className = 'secondary';
    svgExportBtn.style.padding = '4px 10px';
    svgExportBtn.style.fontSize = '12px';
    svgExportBtn.title = 'Export as SVG';
    exportButtons.appendChild(svgExportBtn);

    const pngExportBtn = document.createElement('button');
    pngExportBtn.textContent = '🖼️ PNG';
    pngExportBtn.className = 'secondary';
    pngExportBtn.style.padding = '4px 10px';
    pngExportBtn.style.fontSize = '12px';
    pngExportBtn.title = 'Export as PNG';
    exportButtons.appendChild(pngExportBtn);

    header.appendChild(exportButtons);
    diagramCard.appendChild(header);

    // Insert SVG syntax diagram
    const svgContainer = document.createElement('div');
    svgContainer.style.textAlign = 'center';
    svgContainer.style.padding = '15px';
    svgContainer.style.background = 'var(--bg-primary)';
    svgContainer.style.borderRadius = '4px';
    svgContainer.style.minHeight = '80px';
    svgContainer.style.display = 'flex';
    svgContainer.style.justifyContent = 'center';
    svgContainer.style.alignItems = 'center';

    // Insert a sanitized SVG diagram.
    const svg = parseSanitizedSvg(syntaxDiagrams[symbol]);
    if (svg) {
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      svgContainer.appendChild(svg);

      // SVG export button event listener
      svgExportBtn.addEventListener('click', () => {
        const filename = `${symbol}-syntax-diagram.svg`;
        downloadSVG(svg, filename);
        updateStatus(`SVG exported: ${filename}`, 'ready');
      });

      // PNG export button event listener
      pngExportBtn.addEventListener('click', () => {
        const filename = `${symbol}-syntax-diagram.png`;
        downloadPNG(svg, filename);
        updateStatus(`PNG export started: ${filename}`, 'ready');
      });
    } else {
      svgExportBtn.disabled = true;
      pngExportBtn.disabled = true;
      const error = document.createElement('span');
      error.textContent = 'Diagram could not be rendered safely.';
      error.style.color = 'var(--status-error-text)';
      svgContainer.appendChild(error);
    }

    diagramCard.appendChild(svgContainer);
    section.appendChild(diagramCard);
  });

  return section;
}

/**
 * Create rules section
 */
function createRulesSection(rules) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.marginBottom = '15px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `Rules (${rules.length})`;
  titleEl.style.color = '#34495e';
  titleEl.style.fontSize = '16px';
  titleEl.style.margin = '0';
  headerDiv.appendChild(titleEl);

  // View toggle button
  const viewToggle = document.createElement('div');
  viewToggle.className = 'view-toggle';

  const cardViewBtn = document.createElement('button');
  cardViewBtn.textContent = '📋 Card View';
  cardViewBtn.className = rulesViewMode === 'card' ? 'active' : '';
  cardViewBtn.addEventListener('click', () => {
    rulesViewMode = 'card';
    // Re-render
    const newContent = rulesViewMode === 'card'
      ? createRulesCardView(rules)
      : createRulesTerminalView(rules);

    const oldContent = section.querySelector('.rules-grid, .rules-terminal');
    if (oldContent) {
      section.replaceChild(newContent, oldContent);
    }

    cardViewBtn.className = 'active';
    terminalViewBtn.className = '';
  });

  const terminalViewBtn = document.createElement('button');
  terminalViewBtn.textContent = '💻 Terminal View';
  terminalViewBtn.className = rulesViewMode === 'terminal' ? 'active' : '';
  terminalViewBtn.addEventListener('click', () => {
    rulesViewMode = 'terminal';
    // Re-render
    const newContent = rulesViewMode === 'card'
      ? createRulesCardView(rules)
      : createRulesTerminalView(rules);

    const oldContent = section.querySelector('.rules-grid, .rules-terminal');
    if (oldContent) {
      section.replaceChild(newContent, oldContent);
    }

    cardViewBtn.className = '';
    terminalViewBtn.className = 'active';
  });

  viewToggle.appendChild(cardViewBtn);
  viewToggle.appendChild(terminalViewBtn);
  headerDiv.appendChild(viewToggle);

  section.appendChild(headerDiv);

  // Display rules
  const rulesContent = rulesViewMode === 'card'
    ? createRulesCardView(rules)
    : createRulesTerminalView(rules);
  section.appendChild(rulesContent);

  return section;
}

/**
 * Create rule terminal view (existing style)
 */
function createRulesTerminalView(rules) {
  const rulesContainer = document.createElement('div');
  rulesContainer.className = 'rules-terminal';
  rulesContainer.style.background = '#2c3e50';
  rulesContainer.style.padding = '15px';
  rulesContainer.style.borderRadius = '4px';
  rulesContainer.style.color = '#ecf0f1';
  rulesContainer.style.fontFamily = "'Courier New', monospace";
  rulesContainer.style.fontSize = '13px';
  rulesContainer.style.lineHeight = '1.6';

  rules.forEach((rule) => {
    const ruleLine = document.createElement('div');
    ruleLine.style.marginBottom = '8px';

    // Make clickable if line number is available
    if (rule.line_number) {
      ruleLine.style.cursor = 'pointer';
      ruleLine.style.transition = 'background-color 0.2s';

      // Hover appearance
      ruleLine.addEventListener('mouseenter', () => {
        ruleLine.style.backgroundColor = 'rgba(52, 152, 219, 0.2)';
      });

      ruleLine.addEventListener('mouseleave', () => {
        ruleLine.style.backgroundColor = 'transparent';
      });

      // Jump to the line in the editor on click
      ruleLine.addEventListener('click', () => {
        if (editor) {
          editor.revealLineInCenter(rule.line_number);
          editor.setPosition({ lineNumber: rule.line_number, column: 1 });
          editor.focus();
        }
      });

      ruleLine.title = `Click to jump to line ${rule.line_number}`;
    }

    // Rule ID (line number)
    const idSpan = document.createElement('span');
    idSpan.textContent = `[${rule.id}] `;
    idSpan.style.color = '#95a5a6';
    idSpan.style.marginRight = '8px';
    ruleLine.appendChild(idSpan);

    // LHS
    const lhsSpan = document.createElement('span');
    lhsSpan.textContent = rule.lhs;
    lhsSpan.style.color = '#3498db';
    lhsSpan.style.fontWeight = 'bold';
    ruleLine.appendChild(lhsSpan);

    // Colon
    const colonSpan = document.createElement('span');
    colonSpan.textContent = ' : ';
    colonSpan.style.color = '#ecf0f1';
    ruleLine.appendChild(colonSpan);

    // RHS
    if (rule.rhs && rule.rhs.length > 0) {
      rule.rhs.forEach((sym, i) => {
        if (i > 0) {
          const spaceSpan = document.createElement('span');
          spaceSpan.textContent = ' ';
          ruleLine.appendChild(spaceSpan);
        }

        const symSpan = document.createElement('span');
        symSpan.textContent = sym.symbol;
        symSpan.style.color = sym.type === 'terminal' ? '#2ecc71' : '#e74c3c';
        ruleLine.appendChild(symSpan);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.textContent = '/* empty */';
      emptySpan.style.color = '#95a5a6';
      emptySpan.style.fontStyle = 'italic';
      ruleLine.appendChild(emptySpan);
    }

    // Line number
    if (rule.line_number) {
      const lineSpan = document.createElement('span');
      lineSpan.textContent = ` /* line ${rule.line_number} */`;
      lineSpan.style.color = '#7f8c8d';
      lineSpan.style.fontSize = '11px';
      lineSpan.style.marginLeft = '10px';
      ruleLine.appendChild(lineSpan);
    }

    rulesContainer.appendChild(ruleLine);
  });

  return rulesContainer;
}

async function ensureLramaReady() {
  if (lramaBridge.isReady()) return;

  await lramaBridge.init((message) => {
    updateStatus(message, 'loading');
  });
}

/**
 * Parse button handler
 */
async function handleParse() {
  clearOutput();
  const source = editor.getValue().trim();
  const requestId = ++parseRequestId;

  if (!source) {
    showError('Input is empty. Please enter .y file content.');
    return;
  }

  try {
    parseBtn.disabled = true;
    validateBtn.disabled = true;
    await ensureLramaReady();
    updateStatus('Parsing...', 'loading');

    const result = await lramaBridge.parse(source);
    if (requestId !== parseRequestId) return;

    if (result.success) {
      updateStatus('Parse successful', 'ready');
      showStructuredResult(result);
      // Show new rule add button
      addRuleBtn.style.display = 'block';
      // Save parse result and enable export button
      latestParseResult = result;
      latestParsedSource = source;
      exportBtn.disabled = false;
      setParseMarkers([]);
    } else {
      updateStatus('Parse error', 'error');
      setParseMarkers(result.errors || []);

      // Display error information
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          showError(error.message, error.location);
        });
      } else {
        showError('Failed to parse');
      }

      // Also display details in JSON format
      showResult('Error Details', result);
    }
  } catch (error) {
    updateStatus('An error occurred', 'error');
    showError(error.message);
    console.error('Parse error:', error);
  } finally {
    parseBtn.disabled = false;
    validateBtn.disabled = false;
  }
}

/**
 * Preset selection handler
 */
async function handlePresetSelect(event) {
  const preset = event.target.value;

  if (!preset) {
    return;
  }

  if (!confirmDiscardDirtyContent()) {
    event.target.value = '';
    return;
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}samples/${preset}.y`);

    if (!response.ok) {
      throw new Error(`Failed to load sample: ${response.statusText}`);
    }

    const content = await response.text();
    replaceEditorContent(content);
    currentFileName = `${preset}.y`;
    markContentClean();
    clearOutput();
    updateStatus('Sample loaded', 'ready');

    // Reset selection
    event.target.value = '';
  } catch (error) {
    updateStatus('Failed to load sample', 'error');
    showError(error.message);
    console.error('Failed to load preset:', error);
  }
}

/**
 * Validate button handler
 */
async function handleValidate() {
  clearOutput();
  const source = editor.getValue().trim();
  const requestId = ++validateRequestId;

  if (!source) {
    showError('Input is empty. Please enter .y file content.');
    return;
  }

  try {
    parseBtn.disabled = true;
    validateBtn.disabled = true;
    await ensureLramaReady();
    updateStatus('Validating...', 'loading');

    const result = await lramaBridge.validate(source);
    if (requestId !== validateRequestId) return;

    if (result.valid) {
      updateStatus('Validation successful - Grammar is correct', 'ready');
      setParseMarkers([]);
      showResult('Validation Result', result);
    } else {
      updateStatus('Validation failed - Grammar has errors', 'error');
      setParseMarkers(result.errors || []);

      // Display error information
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          showError(error.message, error.location);
        });
      }

      // Also display details in JSON format
      showResult('Validation Result', result);
    }
  } catch (error) {
    updateStatus('An error occurred', 'error');
    showError(error.message);
    console.error('Validation error:', error);
  } finally {
    parseBtn.disabled = false;
    validateBtn.disabled = false;
  }
}

function handleResetVM() {
  lramaBridge.reset();
  latestParseResult = null;
  latestParsedSource = '';
  parseRequestId += 1;
  validateRequestId += 1;
  exportBtn.disabled = true;
  setParseMarkers([]);
  updateStatus('Ruby Wasm VM reset - it will initialize on the next Parse or Validate', 'ready');
}

function formatSelection() {
  if (!editor) return;

  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const startLine = selection.startLineNumber;
  const endLine = selection.isEmpty() ? selection.startLineNumber : selection.endLineNumber;
  const lines = [];
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    lines.push(model.getLineContent(lineNumber).replace(/\s+$/g, ''));
  }

  replaceEditorLineRange(startLine, endLine, lines.join('\n'), 'format-selection');
  updateStatus('Selection formatted', 'ready');
}

function jumpToSymbol() {
  if (!editor) return;

  const symbol = prompt('Symbol name');
  if (!symbol) return;

  const grammar = latestParseResult?.grammar;
  const rule = grammar?.rules?.find(item => item.lhs === symbol && item.line_number);
  if (rule) {
    editor.setPosition({ lineNumber: rule.line_number, column: 1 });
    editor.revealLineInCenter(rule.line_number);
    editor.focus();
    return;
  }

  const match = editor.getModel()?.findNextMatch(symbol, { lineNumber: 1, column: 1 }, false, true, null, true);
  if (match) {
    editor.setSelection(match.range);
    editor.revealRangeInCenter(match.range);
    editor.focus();
  }
}

function getCommands() {
  return [
    { id: 'parse', label: 'Parse', run: handleParse, disabled: parseBtn.disabled },
    { id: 'validate', label: 'Validate', run: handleValidate, disabled: validateBtn.disabled },
    { id: 'reset-vm', label: 'Reset VM', run: handleResetVM, disabled: resetVmBtn.disabled },
    { id: 'export', label: 'Export Report', run: handleExport, disabled: exportBtn.disabled },
    { id: 'download', label: 'Download .y', run: handleDownload, disabled: downloadBtn.disabled },
    { id: 'upload', label: 'Upload File', run: handleUpload, disabled: uploadBtn.disabled },
    { id: 'theme', label: 'Toggle Theme', run: toggleTheme },
    { id: 'jump-symbol', label: 'Jump to Symbol', run: jumpToSymbol },
    { id: 'format-selection', label: 'Format Selection', run: formatSelection },
  ];
}

function renderCommandPalette() {
  const query = commandInput.value.trim().toLowerCase();
  commandList.replaceChildren();

  getCommands()
    .filter(command => command.label.toLowerCase().includes(query))
    .forEach(command => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-item';
      button.textContent = command.label;
      button.disabled = Boolean(command.disabled);
      button.addEventListener('click', () => {
        closeCommandPalette();
        command.run();
      });
      commandList.appendChild(button);
    });
}

function openCommandPalette() {
  commandInput.value = '';
  renderCommandPalette();
  showModal(commandPalette, commandInput);
}

function closeCommandPalette() {
  hideModal(commandPalette);
}

/**
 * Report export handler
 */
function handleExport() {
  if (!latestParseResult || !latestParseResult.grammar) {
    alert('No parse result available. Please run Parse first.');
    return;
  }

  const grammar = latestParseResult.grammar;
  const source = editor.getValue();
  if (source.trim() !== latestParsedSource) {
    alert('The grammar changed after the last successful parse. Please run Parse again before exporting.');
    latestParseResult = null;
    latestParsedSource = '';
    exportBtn.disabled = true;
    return;
  }

  // Generate HTML report
  const html = generateHTMLReport(source, grammar);

  // Create Blob
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  // Create download link
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lrama-report.html';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateStatus('Report exported', 'ready');
}

/**
 * Generate HTML report
 */
function generateHTMLReport(source, grammar) {
  const now = new Date().toLocaleString();
  const renderToken = (value, className) => {
    const safeClassName = className === 'nonterminal' ? 'nonterminal' : 'terminal';
    return `<span class="token ${safeClassName}">${escapeHtml(String(value))}</span>`;
  };

  let html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lrama Grammar Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
    header { background: #2c3e50; color: white; padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #ecf0f1; font-size: 14px; }
    .content { padding: 20px; }
    h2 { color: #2c3e50; font-size: 20px; margin: 20px 0 10px; padding-bottom: 8px; border-bottom: 2px solid #3498db; }
    h3 { color: #34495e; font-size: 16px; margin: 15px 0 10px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #34495e; color: white; padding: 8px 12px; text-align: left; }
    td { padding: 6px 12px; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) { background: #f9f9f9; }
    pre { background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
    .token { padding: 3px 8px; border-radius: 3px; font-size: 12px; font-family: 'Courier New', monospace; display: inline-block; margin: 2px; }
    .token.terminal { background: rgba(46, 204, 113, 0.15); color: #27ae60; border: 1px solid rgba(46, 204, 113, 0.3); }
    .token.nonterminal { background: rgba(52, 152, 219, 0.15); color: #2980b9; border: 1px solid rgba(52, 152, 219, 0.3); }
    .conflict { background: rgba(231, 76, 60, 0.1); border: 2px solid #e74c3c; border-radius: 6px; padding: 15px; margin: 10px 0; }
    .conflict-tag { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; background: #e74c3c; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Lrama Grammar Report</h1>
      <p class="subtitle">Generated: ${escapeHtml(now)}</p>
    </header>
    <div class="content">
`;

  // Start symbol
  if (grammar.start_symbol) {
    html += `<h2>Start Symbol</h2><p><code>${escapeHtml(grammar.start_symbol)}</code></p>`;
  }

  // Tokens
  if (grammar.tokens && grammar.tokens.length > 0) {
    html += `<h2>Tokens (${grammar.tokens.length})</h2><table><thead><tr><th>Name</th><th>Type</th><th>ID</th></tr></thead><tbody>`;
    grammar.tokens.forEach(t => {
      html += `<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.type || '-')}</td><td>${escapeHtml(String(t.token_id !== null ? t.token_id : '-'))}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Nonterminals
  if (grammar.nonterminals && grammar.nonterminals.length > 0) {
    html += `<h2>Nonterminals (${grammar.nonterminals.length})</h2><table><thead><tr><th>Name</th><th>Type</th></tr></thead><tbody>`;
    grammar.nonterminals.forEach(n => {
      html += `<tr><td>${escapeHtml(n.name)}</td><td>${escapeHtml(n.type || '-')}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Conflicts
  if (grammar.conflicts && grammar.conflicts.length > 0) {
    html += `<h2>Conflicts (${grammar.conflicts.length})</h2>`;
    grammar.conflicts.forEach(c => {
      html += `<div class="conflict">
        <span class="conflict-tag">${c.severity === 'error' ? 'ERROR' : 'WARNING'}</span>
        <span class="conflict-tag" style="background: #95a5a6;">${escapeHtml(c.type.replace(/_/g, ' ').toUpperCase())}</span>
        <p style="margin-top: 10px;">${escapeHtml(c.message)}</p>
        ${c.rules ? `<p style="margin-top: 8px;"><strong>Rules:</strong> ${escapeHtml(c.rules.join(', '))}</p>` : ''}
        ${c.tokens ? `<p><strong>Tokens:</strong> ${escapeHtml(c.tokens.join(', '))}</p>` : ''}
      </div>`;
    });
  }

  if (grammar.nullable_symbols && grammar.nullable_symbols.length > 0) {
    html += `<h2>Nullable Nonterminals (${grammar.nullable_symbols.length})</h2>`;
    html += grammar.nullable_symbols.map(sym => renderToken(sym, 'nonterminal')).join(' ');
  }

  if (grammar.lint && hasLintFindings(grammar.lint)) {
    html += `<h2>Grammar Lint</h2>`;
    Object.entries(grammar.lint).forEach(([key, values]) => {
      if (!Array.isArray(values) || values.length === 0) return;
      html += `<h3>${escapeHtml(key.replace(/_/g, ' '))}</h3><p>${values.map(value => renderToken(value, 'terminal')).join(' ')}</p>`;
    });
  }

  // First/Follow sets
  if (grammar.first_sets && grammar.follow_sets) {
    html += `<h2>First/Follow Sets</h2>`;
    const symbols = Object.keys(grammar.first_sets).sort();
    symbols.forEach(sym => {
      html += `<h3>${escapeHtml(sym)}</h3>`;
      html += `<p><strong>FIRST:</strong> `;
      const first = grammar.first_sets[sym] || [];
      if (first.length > 0) {
        html += first.map(t => renderToken(t, 'terminal')).join(' ');
      } else {
        html += `<em>(empty)</em>`;
      }
      html += `</p>`;

      html += `<p><strong>FOLLOW:</strong> `;
      const follow = grammar.follow_sets[sym] || [];
      if (follow.length > 0) {
        html += follow.map(t => renderToken(t, 'nonterminal')).join(' ');
      } else {
        html += `<em>(empty)</em>`;
      }
      html += `</p>`;
    });
  }

  // Rules
  if (grammar.rules && grammar.rules.length > 0) {
    html += `<h2>Rules (${grammar.rules.length})</h2>`;
    grammar.rules.forEach(rule => {
      html += `<div style="margin: 10px 0; font-family: 'Courier New', monospace;">`;
      html += `<span style="color: #95a5a6;">[${escapeHtml(String(rule.id))}]</span> `;
      html += `<strong style="color: #3498db;">${escapeHtml(rule.lhs)}</strong> : `;

      if (rule.rhs && rule.rhs.length > 0) {
        rule.rhs.forEach(sym => {
          html += `${renderToken(sym.symbol, sym.type)} `;
        });
      } else {
        html += `<em>ε (empty)</em>`;
      }

      if (rule.line_number) {
        html += `<span style="color: #7f8c8d; font-size: 11px;"> /* line ${escapeHtml(String(rule.line_number))} */</span>`;
      }
      html += `</div>`;
    });
  }

  // Source code
  html += `<h2>Source Code</h2><pre>${escapeHtml(source)}</pre>`;

  html += `
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * HTML escape
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Download SVG
 */
function downloadSVG(svgElement, filename) {
  // Create SVG element clone
  const svgClone = svgElement.cloneNode(true);
  sanitizeSvgElement(svgClone);
  const svgString = new XMLSerializer().serializeToString(svgClone);

  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert SVG to PNG and download
 */
function downloadPNG(svgElement, filename) {
  const svgClone = svgElement.cloneNode(true);
  sanitizeSvgElement(svgClone);
  const svgString = new XMLSerializer().serializeToString(svgClone);

  // Get SVG size
  const svgWidth = svgElement.width.baseVal.value || 800;
  const svgHeight = svgElement.height.baseVal.value || 600;

  // Create Canvas element
  const canvas = document.createElement('canvas');
  canvas.width = svgWidth * 2; // 2x for high resolution
  canvas.height = svgHeight * 2;
  const ctx = canvas.getContext('2d');

  // Draw white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load SVG as Image
  const img = new Image();
  img.onload = function() {
    URL.revokeObjectURL(svgUrl);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Download as PNG
    canvas.toBlob(function(blob) {
      if (!blob) {
        updateStatus('PNG export failed', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.onerror = function() {
    URL.revokeObjectURL(svgUrl);
    updateStatus('PNG export failed', 'error');
  };

  // Set SVG as Data URL
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  img.src = svgUrl;
}

/**
 * File download handler
 */
function handleDownload() {
  const content = editor.getValue();

  if (!content.trim()) {
    showError('No content to download.');
    return;
  }

  // Create Blob
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  // Create download link
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFileName || DEFAULT_DOWNLOAD_FILENAME;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateStatus('File downloaded', 'ready');
  markContentClean();
}

/**
 * File upload handler
 */
function handleUpload() {
  fileInput.click();
}

/**
 * File selection handler
 */
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirmDiscardDirtyContent()) {
    fileInput.value = '';
    return;
  }

  const validationError = validateGrammarFile(file);
  if (validationError) {
    showError(validationError);
    fileInput.value = '';
    return;
  }

  try {
    const content = await file.text();
    replaceEditorContent(content);
    currentFileName = sanitizeDownloadFileName(file.name);
    markContentClean();
    clearOutput();
    updateStatus(`File "${file.name}" loaded`, 'ready');

    // Reset file input
    fileInput.value = '';
  } catch (error) {
    updateStatus('Failed to load file', 'error');
    showError(error.message);
    console.error('Failed to read file:', error);
  }
}

/**
 * Drag and drop handler
 */
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  editorContainer.classList.add('drag-over');
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  editorContainer.classList.remove('drag-over');
}

async function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  editorContainer.classList.remove('drag-over');

  const files = event.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];

  if (!confirmDiscardDirtyContent()) {
    return;
  }

  const validationError = validateGrammarFile(file);
  if (validationError) {
    showError(validationError);
    return;
  }

  try {
    const content = await file.text();
    replaceEditorContent(content);
    currentFileName = sanitizeDownloadFileName(file.name);
    markContentClean();
    clearOutput();
    updateStatus(`File "${file.name}" loaded`, 'ready');
  } catch (error) {
    updateStatus('Failed to load file', 'error');
    showError(error.message);
    console.error('Failed to read dropped file:', error);
  }
}

/**
 * Application initialization
 */
async function init() {
  try {
    // Load theme settings
    loadTheme();

    updateStatus('Initializing editor...', 'loading');

    // Initialize Monaco Editor
    initMonacoEditor();

    updateStatus(isDirty ? 'Draft restored - Click Parse button' : 'Ready - Click Parse button', 'ready');

    // Enable buttons
    parseBtn.disabled = false;
    validateBtn.disabled = false;
    resetVmBtn.disabled = false;
    uploadBtn.disabled = false;
    downloadBtn.disabled = false;

    // Set event listeners
    parseBtn.addEventListener('click', handleParse);
    validateBtn.addEventListener('click', handleValidate);
    resetVmBtn.addEventListener('click', handleResetVM);
    presetSelect.addEventListener('change', handlePresetSelect);
    uploadBtn.addEventListener('click', handleUpload);
    downloadBtn.addEventListener('click', handleDownload);
    exportBtn.addEventListener('click', handleExport);
    fileInput.addEventListener('change', handleFileSelect);
    themeToggle.addEventListener('click', toggleTheme);
    undoBtn.addEventListener('click', handleUndo);
    redoBtn.addEventListener('click', handleRedo);
    autoParseToggle.addEventListener('change', scheduleAutoParse);

    // Symbol modal event listeners
    symbolModalClose.addEventListener('click', () => closeSymbolModal(true));
    symbolModalCancel.addEventListener('click', () => closeSymbolModal(true));
    symbolForm.addEventListener('submit', handleSaveSymbol);

    // Close symbol modal on outside click
    symbolModal.addEventListener('click', (e) => {
      if (e.target === symbolModal) {
        closeSymbolModal(true);
      }
    });

    // Rule modal event listeners
    addRuleBtn.addEventListener('click', () => openRuleModal());
    modalClose.addEventListener('click', closeRuleModal);
    modalCancel.addEventListener('click', closeRuleModal);
    ruleForm.addEventListener('submit', handleSaveRule);
    addSymbolBtn.addEventListener('click', handleAddSymbol);

    // Add symbol on Enter key
    symbolInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSymbol();
      }
    });

    // Close modal on outside click
    ruleModal.addEventListener('click', (e) => {
      if (e.target === ruleModal) {
        closeRuleModal();
      }
    });

    // Symbol type selection modal event listeners
    symbolTypeModalClose.addEventListener('click', closeSymbolTypeModal);
    symbolTypeModalCancel.addEventListener('click', closeSymbolTypeModal);
    registerAsTokenBtn.addEventListener('click', handleRegisterAsToken);
    registerAsNonterminalBtn.addEventListener('click', handleRegisterAsNonterminal);

    // Close symbol type modal on outside click
    symbolTypeModal.addEventListener('click', (e) => {
      if (e.target === symbolTypeModal) {
        closeSymbolTypeModal();
      }
    });

    commandPaletteClose.addEventListener('click', closeCommandPalette);
    commandInput.addEventListener('input', renderCommandPalette);
    commandInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const firstCommand = commandList.querySelector('.command-item:not(:disabled)');
      if (!firstCommand) return;
      event.preventDefault();
      firstCommand.click();
    });
    commandPalette.addEventListener('click', (event) => {
      if (event.target === commandPalette) {
        closeCommandPalette();
      }
    });

    // Drag and drop event listeners
    editorContainer.addEventListener('dragover', handleDragOver);
    editorContainer.addEventListener('dragleave', handleDragLeave);
    editorContainer.addEventListener('drop', handleDrop);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    console.log('Lrama Corral initialized successfully');
  } catch (error) {
    updateStatus('Initialization failed: ' + error.message, 'error');
    console.error('Initialization error:', error);
  }
}

// Start application
init();
