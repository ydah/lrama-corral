import { lramaBridge } from './lib/lrama-bridge.js';
import * as monaco from 'monaco-editor';

// DOM elements
const statusEl = document.getElementById('status');
const editorContainer = document.getElementById('editor-container');
const parseBtn = document.getElementById('parseBtn');
const validateBtn = document.getElementById('validateBtn');
const outputEl = document.getElementById('output');
const presetSelect = document.getElementById('presetSelect');
const uploadBtn = document.getElementById('uploadBtn');
const downloadBtn = document.getElementById('downloadBtn');
const exportBtn = document.getElementById('exportBtn');
const fileInput = document.getElementById('fileInput');
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

// Latest parse result for export
let latestParseResult = null;

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

      return { suggestions };
    }
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

  editor = monaco.editor.create(editorContainer, {
    value: defaultValue,
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

  // Save to localStorage
  localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
}

/**
 * Load saved theme settings
 */
function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
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

  symbolModal.classList.add('active');
  symbolName.focus();
}

/**
 * Close symbol modal
 */
function closeSymbolModal() {
  symbolModal.classList.remove('active');
  symbolForm.reset();
  editingSymbolType = null;
  editingSymbolIndex = null;
  editingSymbolOriginalName = null;
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

  if (editingSymbolType === 'token') {
    // Add/edit token
    updateTokenDeclaration(lines, name, typeValue, tokenIdValue);
  } else {
    // Add/edit nonterminal
    updateNonterminalDeclaration(lines, name, typeValue);
  }

  model.setValue(lines.join('\n'));
  editor.focus();
  closeSymbolModal();

  // Re-parse to update parse results
  setTimeout(() => {
    if (!parseBtn.disabled) {
      handleParse();
    }
  }, 100);
}

/**
 * Update token declaration
 */
function updateTokenDeclaration(lines, name, type, tokenIdValue) {
  const oldName = editingSymbolOriginalName;

  // Find existing %token line
  let tokenLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('%token')) {
      if (oldName && lines[i].includes(oldName)) {
        tokenLineIndex = i;
        break;
      }
    }
  }

  if (editingSymbolIndex !== null && oldName) {
    // Edit mode: replace existing token
    if (tokenLineIndex !== -1) {
      // Remove old name from that line
      lines[tokenLineIndex] = lines[tokenLineIndex].replace(new RegExp(`\\b${oldName}\\b`), name);
    }
  } else {
    // New addition mode
    // Find last %token line
    let lastTokenLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('%token')) {
        lastTokenLine = i;
      }
    }

    if (lastTokenLine !== -1) {
      // Add to existing %token line
      lines[lastTokenLine] += ` ${name}`;
    } else {
      // Add new %token line (before %%)
      let insertIndex = lines.findIndex(line => line.trim() === '%%');
      if (insertIndex === -1) insertIndex = 0;
      lines.splice(insertIndex, 0, `%token ${name}`);
    }
  }

  // Add/update %type declaration if type information is present
  if (type) {
    updateTypeDeclaration(lines, name, type, oldName);
  }
}

/**
 * Update nonterminal declaration
 */
function updateNonterminalDeclaration(lines, name, type) {
  const oldName = editingSymbolOriginalName;

  // Update %type declaration only if type information is present
  if (type) {
    updateTypeDeclaration(lines, name, type, oldName);
  } else if (oldName && type === '') {
    // Remove from %type declaration if type information is deleted
    removeTypeDeclaration(lines, oldName);
  }
}

/**
 * Update %type declaration
 */
function updateTypeDeclaration(lines, name, type, oldName) {
  // Find existing %type <type> line
  let typeLineIndex = -1;
  const typePattern = type.startsWith('<') ? type : `<${type}>`;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('%type') && lines[i].includes(typePattern)) {
      typeLineIndex = i;
      break;
    }
  }

  if (oldName && typeLineIndex !== -1) {
    // Replace old name with new name
    lines[typeLineIndex] = lines[typeLineIndex].replace(new RegExp(`\\b${oldName}\\b`), name);
  } else {
    // New addition or different type
    if (typeLineIndex !== -1) {
      // Add to existing line
      lines[typeLineIndex] += ` ${name}`;
    } else {
      // Add new %type line (before %%)
      let insertIndex = lines.findIndex(line => line.trim() === '%%');
      if (insertIndex === -1) insertIndex = 0;
      lines.splice(insertIndex, 0, `%type ${typePattern} ${name}`);
    }
  }
}

/**
 * Remove from %type declaration
 */
function removeTypeDeclaration(lines, name) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('%type') && lines[i].includes(name)) {
      lines[i] = lines[i].replace(new RegExp(`\\s+${name}\\b`), '');
      // Delete if line becomes empty
      if (lines[i].trim() === '%type') {
        lines.splice(i, 1);
      }
      break;
    }
  }
}

/**
 * Delete symbol
 */
function handleDeleteSymbol(type, symbolData) {
  const name = symbolData.name;

  if (!confirm(`Are you sure you want to delete "${name}"?`)) {
    return;
  }

  if (!editor) return;

  const model = editor.getModel();
  const content = model.getValue();
  const lines = content.split('\n');

  if (type === 'token') {
    // Remove from token declaration
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('%token') && lines[i].includes(name)) {
        lines[i] = lines[i].replace(new RegExp(`\\s+${name}\\b`), '');
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

  model.setValue(lines.join('\n'));
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
  updateRHSDisplay();
  ruleModal.classList.add('active');
}

/**
 * Close modal
 */
function closeRuleModal() {
  ruleModal.classList.remove('active');
  ruleForm.reset();
  currentRuleSymbols = [];
  editingLineNumber = null;
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
  if (symbol) {
    currentRuleSymbols.push(symbol);
    updateRHSDisplay();
    symbolInput.value = '';
    symbolInput.focus();
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
      // Find and replace the line
      const lines = currentContent.split('\n');
      let ruleStart = editingLineNumber - 1;
      let ruleEnd = ruleStart;

      // Find the end of the rule (;)
      while (ruleEnd < lines.length && !lines[ruleEnd].includes(';')) {
        ruleEnd++;
      }

      lines.splice(ruleStart, ruleEnd - ruleStart + 1, ...ruleText.trim().split('\n'));
      model.setValue(lines.join('\n'));
    } else {
      // Add new rule
      // Add after %%
      const lines = currentContent.split('\n');
      let insertIndex = lines.findIndex(line => line.trim() === '%%');

      if (insertIndex !== -1) {
        // If there is an empty line after %%, insert after it
        insertIndex += 2;
        lines.splice(insertIndex, 0, '', ...ruleText.split('\n'));
        model.setValue(lines.join('\n'));

        // Move cursor to newly added line
        editor.setPosition({ lineNumber: insertIndex + 2, column: 1 });
        editor.revealLineInCenter(insertIndex + 2);
      } else {
        // Add to end if %% not found
        model.setValue(currentContent + '\n\n%%\n\n' + ruleText);
      }
    }

    editor.focus();
  }

  closeRuleModal();
}

/**
 * Keyboard shortcut handler
 */
function handleKeyboardShortcuts(event) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? event.metaKey : event.ctrlKey;

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
    startEl.innerHTML = `<strong>Start Symbol:</strong> <code style="background: #ecf0f1; padding: 2px 6px; border-radius: 3px;">${grammar.start_symbol}</code>`;
    outputEl.appendChild(startEl);
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
      card.addEventListener('click', () => {
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

    const hasConflict = state.error || (state.reduces && state.reduces.length > 0);
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
    const x = margin + (levelNum / maxLevel) * usableWidth;

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

  // Collapsible state list
  stateTransitions.slice(0, 10).forEach(state => {
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
      itemsDiv.innerHTML = `<strong>Items:</strong><br/>`;
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
      shiftsDiv.innerHTML = `<strong>Shifts:</strong> `;
      shiftsDiv.innerHTML += state.shifts.map(s => `${s.symbol} → ${s.to_state}`).join(', ');
      content.appendChild(shiftsDiv);
    }

    // Goto transitions
    if (state.gotos && state.gotos.length > 0) {
      const gotosDiv = document.createElement('div');
      gotosDiv.style.marginTop = '8px';
      gotosDiv.innerHTML = `<strong>Gotos:</strong> `;
      gotosDiv.innerHTML += state.gotos.map(g => `${g.symbol} → ${g.to_state}`).join(', ');
      content.appendChild(gotosDiv);
    }

    // Reduce actions
    if (state.reduces && state.reduces.length > 0) {
      const reducesDiv = document.createElement('div');
      reducesDiv.style.marginTop = '8px';
      reducesDiv.innerHTML = `<strong>Reduces:</strong> `;
      reducesDiv.innerHTML += state.reduces.map(r => `${r.symbol} → Rule #${r.rule_id}`).join(', ');
      content.appendChild(reducesDiv);
    }

    stateCard.appendChild(content);
    section.appendChild(stateCard);
  });

  if (stateTransitions.length > 10) {
    const moreInfo = document.createElement('p');
    moreInfo.textContent = `... and ${stateTransitions.length - 10} more states`;
    moreInfo.style.color = 'var(--text-secondary)';
    moreInfo.style.fontSize = '13px';
    moreInfo.style.fontStyle = 'italic';
    moreInfo.style.marginTop = '10px';
    section.appendChild(moreInfo);
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

    // Insert SVG as HTML
    svgContainer.innerHTML = syntaxDiagrams[symbol];

    // Adjust SVG element style
    const svg = svgContainer.querySelector('svg');
    if (svg) {
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';

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

/**
 * Parse button handler
 */
async function handleParse() {
  clearOutput();
  const source = editor.getValue().trim();

  if (!source) {
    showError('Input is empty. Please enter .y file content.');
    return;
  }

  try {
    parseBtn.disabled = true;
    validateBtn.disabled = true;
    updateStatus('Parsing...', 'loading');

    const result = await lramaBridge.parse(source);

    if (result.success) {
      updateStatus('Parse successful', 'ready');
      showStructuredResult(result);
      // Show new rule add button
      addRuleBtn.style.display = 'block';
      // Save parse result and enable export button
      latestParseResult = result;
      exportBtn.disabled = false;
    } else {
      updateStatus('Parse error', 'error');

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

  try {
    const response = await fetch(`/samples/${preset}.y`);

    if (!response.ok) {
      throw new Error(`Failed to load sample: ${response.statusText}`);
    }

    const content = await response.text();
    editor.setValue(content);
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

  if (!source) {
    showError('Input is empty. Please enter .y file content.');
    return;
  }

  try {
    parseBtn.disabled = true;
    validateBtn.disabled = true;
    updateStatus('Validating...', 'loading');

    const result = await lramaBridge.validate(source);

    if (result.valid) {
      updateStatus('Validation successful - Grammar is correct', 'ready');
      showResult('Validation Result', result);
    } else {
      updateStatus('Validation failed - Grammar has errors', 'error');

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
      <p class="subtitle">Generated: ${now}</p>
    </header>
    <div class="content">
`;

  // Start symbol
  if (grammar.start_symbol) {
    html += `<h2>Start Symbol</h2><p><code>${grammar.start_symbol}</code></p>`;
  }

  // Tokens
  if (grammar.tokens && grammar.tokens.length > 0) {
    html += `<h2>Tokens (${grammar.tokens.length})</h2><table><thead><tr><th>Name</th><th>Type</th><th>ID</th></tr></thead><tbody>`;
    grammar.tokens.forEach(t => {
      html += `<tr><td>${t.name}</td><td>${t.type || '-'}</td><td>${t.token_id !== null ? t.token_id : '-'}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Nonterminals
  if (grammar.nonterminals && grammar.nonterminals.length > 0) {
    html += `<h2>Nonterminals (${grammar.nonterminals.length})</h2><table><thead><tr><th>Name</th><th>Type</th></tr></thead><tbody>`;
    grammar.nonterminals.forEach(n => {
      html += `<tr><td>${n.name}</td><td>${n.type || '-'}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Conflicts
  if (grammar.conflicts && grammar.conflicts.length > 0) {
    html += `<h2>Conflicts (${grammar.conflicts.length})</h2>`;
    grammar.conflicts.forEach(c => {
      html += `<div class="conflict">
        <span class="conflict-tag">${c.severity === 'error' ? 'ERROR' : 'WARNING'}</span>
        <span class="conflict-tag" style="background: #95a5a6;">${c.type.replace(/_/g, ' ').toUpperCase()}</span>
        <p style="margin-top: 10px;">${c.message}</p>
        ${c.rules ? `<p style="margin-top: 8px;"><strong>Rules:</strong> ${c.rules.join(', ')}</p>` : ''}
        ${c.tokens ? `<p><strong>Tokens:</strong> ${c.tokens.join(', ')}</p>` : ''}
      </div>`;
    });
  }

  // First/Follow sets
  if (grammar.first_sets && grammar.follow_sets) {
    html += `<h2>First/Follow Sets</h2>`;
    const symbols = Object.keys(grammar.first_sets).sort();
    symbols.forEach(sym => {
      html += `<h3>${sym}</h3>`;
      html += `<p><strong>FIRST:</strong> `;
      const first = grammar.first_sets[sym] || [];
      if (first.length > 0) {
        html += first.map(t => `<span class="token terminal">${t}</span>`).join(' ');
      } else {
        html += `<em>(empty)</em>`;
      }
      html += `</p>`;

      html += `<p><strong>FOLLOW:</strong> `;
      const follow = grammar.follow_sets[sym] || [];
      if (follow.length > 0) {
        html += follow.map(t => `<span class="token nonterminal">${t}</span>`).join(' ');
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
      html += `<span style="color: #95a5a6;">[${rule.id}]</span> `;
      html += `<strong style="color: #3498db;">${rule.lhs}</strong> : `;

      if (rule.rhs && rule.rhs.length > 0) {
        rule.rhs.forEach(sym => {
          html += `<span class="token ${sym.type}">${sym.symbol}</span> `;
        });
      } else {
        html += `<em>ε (empty)</em>`;
      }

      if (rule.line_number) {
        html += `<span style="color: #7f8c8d; font-size: 11px;"> /* line ${rule.line_number} */</span>`;
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
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Download SVG
 */
function downloadSVG(svgElement, filename) {
  // Create SVG element clone
  const svgClone = svgElement.cloneNode(true);
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
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Download as PNG
    canvas.toBlob(function(blob) {
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
  a.download = 'grammar.y';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateStatus('File downloaded', 'ready');
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

  try {
    const content = await file.text();
    editor.setValue(content);
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

  // Accept only .y, .yacc, .yy files
  if (!file.name.match(/\.(y|yacc|yy)$/i)) {
    showError('Unsupported file format. Please drop .y, .yacc, or .yy files.');
    return;
  }

  try {
    const content = await file.text();
    editor.setValue(content);
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

    updateStatus('Initializing... Loading Monaco Editor and Ruby Wasm VM', 'loading');

    // Initialize Monaco Editor
    initMonacoEditor();

    // Initialize Ruby Wasm + Lrama
    await lramaBridge.init();

    updateStatus('Ready - Click Parse button', 'ready');

    // Enable buttons
    parseBtn.disabled = false;
    validateBtn.disabled = false;
    uploadBtn.disabled = false;
    downloadBtn.disabled = false;

    // Set event listeners
    parseBtn.addEventListener('click', handleParse);
    validateBtn.addEventListener('click', handleValidate);
    presetSelect.addEventListener('change', handlePresetSelect);
    uploadBtn.addEventListener('click', handleUpload);
    downloadBtn.addEventListener('click', handleDownload);
    exportBtn.addEventListener('click', handleExport);
    fileInput.addEventListener('change', handleFileSelect);
    themeToggle.addEventListener('click', toggleTheme);
    undoBtn.addEventListener('click', handleUndo);
    redoBtn.addEventListener('click', handleRedo);

    // Symbol modal event listeners
    symbolModalClose.addEventListener('click', closeSymbolModal);
    symbolModalCancel.addEventListener('click', closeSymbolModal);
    symbolForm.addEventListener('submit', handleSaveSymbol);

    // Close symbol modal on outside click
    symbolModal.addEventListener('click', (e) => {
      if (e.target === symbolModal) {
        closeSymbolModal();
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
