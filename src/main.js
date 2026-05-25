import { lramaBridge } from './lib/lrama-bridge.js';
import './styles.css';
import {
  clearParseState,
  createEditorTab,
  createAppState,
  getActiveEditorTab,
  invalidateParserRequests,
} from './lib/app-state.js';
import { createLifecycle } from './lib/lifecycle.js';
import {
  appendCollapsibleJsonResult,
  appendError,
  appendJsonResult,
  clearAnalysisOutput,
  setStatus,
} from './lib/output-view.js';
import {
  DEFAULT_DOWNLOAD_FILENAME,
  reportFileNameForGrammar,
  sanitizeDownloadFileName,
} from './lib/file-names.js';
import { readStorage, writeStorage } from './lib/safe-storage.js';
import { generateHTMLReport } from './lib/report-export.js';
import { LINT_LABELS } from './lib/grammar-labels.js';
import { calculateStateGraphLayout } from './lib/state-graph-layout.js';
import { downloadPNG, downloadSVG } from './lib/svg-export.js';
import { registerYaccLanguage } from './lib/yacc-language.js';
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
import { parseSanitizedSvg } from './lib/svg-sanitizer.js';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

/** @typedef {import('./lib/grammar-types.js').GrammarResult} GrammarResult */

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// DOM elements
const statusEl = document.getElementById('status');
const editorContainer = document.getElementById('editor-container');
const fileTabs = document.getElementById('fileTabs');
const addFileTabBtn = document.getElementById('addFileTabBtn');
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
const mobileEditorTab = document.getElementById('mobileEditorTab');
const mobileOutputTab = document.getElementById('mobileOutputTab');

// Monaco Editor instance
let editor = null;

// Theme state
let isDarkMode = false;

// File and draft state
const DRAFT_STORAGE_KEY = 'lrama-corral:draft';
const THEME_STORAGE_KEY = 'lrama-corral:theme';
const MAX_GRAMMAR_FILE_SIZE = 1024 * 1024;
const AUTO_PARSE_DELAY_MS = 700;
const MAX_EDITOR_TABS = 3;
const GRAPH_ZOOM_STEP = 0.15;
const GRAPH_MIN_ZOOM = 0.35;
const GRAPH_MAX_ZOOM = 2.5;
const STATE_GRAPH_COLORS = {
  state: 'var(--btn-primary)',
  conflict: 'var(--status-error-text)',
  shift: 'var(--status-ready-text)',
  goto: 'var(--btn-primary)',
  reduce: 'var(--status-loading-text)',
  edge: 'var(--text-secondary)',
  highlight: 'var(--status-loading-text)',
  nodeStroke: 'var(--text-primary)',
};
let draftSaveTimer = null;
let autoParseTimer = null;
let suppressEditorChange = false;
const appLifecycle = createLifecycle();
const appState = createAppState({
  currentFileName: DEFAULT_DOWNLOAD_FILENAME,
});

function getDefaultGrammarSource() {
  return `%token NUMBER
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
}

/**
 * Initialize Monaco Editor
 */
function initMonacoEditor() {
  registerYaccLanguage(monaco, {
    getGrammar: () => appState.latestParseResult?.grammar,
  });

  const draft = loadDraft();
  initializeEditorTabs(draft, getDefaultGrammarSource());
  const activeTab = getActiveEditorTab(appState);
  const initialValue = activeTab?.content || getDefaultGrammarSource();
  appState.currentFileName = activeTab?.fileName || DEFAULT_DOWNLOAD_FILENAME;
  appState.isDirty = Boolean(activeTab?.isDirty);
  const initialModel = activeTab
    ? ensureEditorTabModel(activeTab)
    : monaco.editor.createModel(initialValue, 'yacc');

  editor = monaco.editor.create(editorContainer, {
    model: initialModel,
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
  appLifecycle.addDisposable(editor.onDidChangeModelContent(() => {
    updateUndoRedoButtons();
    if (suppressEditorChange) return;
    invalidateParseResult();
    scheduleDraftSave();
    scheduleAutoParse();
    appState.isDirty = true;
    syncActiveEditorTab();
  }));
  appLifecycle.add(() => editor?.dispose());
  appLifecycle.add(() => {
    appState.editorTabs.forEach(tab => tab.model?.dispose());
  });

  // Update initial button state
  updateUndoRedoButtons();
  renderFileTabs();

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

function normalizeDraftTab(tab, index) {
  const id = typeof tab?.id === 'string' && tab.id ? tab.id : `tab-${index + 1}`;
  const fileName = sanitizeDownloadFileName(tab?.fileName || DEFAULT_DOWNLOAD_FILENAME);
  return createEditorTab({
    id,
    fileName,
    content: typeof tab?.content === 'string' ? tab.content : '',
    isDirty: Boolean(tab?.isDirty),
  });
}

function initializeEditorTabs(draft, defaultContent) {
  if (Array.isArray(draft?.tabs) && draft.tabs.length > 0) {
    appState.editorTabs = draft.tabs.slice(0, MAX_EDITOR_TABS).map(normalizeDraftTab);
    appState.activeEditorTabId = appState.editorTabs.some(tab => tab.id === draft.activeTabId)
      ? draft.activeTabId
      : appState.editorTabs[0].id;
    appState.nextEditorTabId = Math.max(
      Number(draft.nextEditorTabId) || 1,
      appState.editorTabs.length + 1
    );
    return;
  }

  const initialTab = createEditorTab({
    id: 'tab-1',
    fileName: sanitizeDownloadFileName(draft?.fileName || DEFAULT_DOWNLOAD_FILENAME),
    content: typeof draft?.content === 'string' ? draft.content : defaultContent,
    isDirty: Boolean(draft?.content),
  });
  appState.editorTabs = [initialTab];
  appState.activeEditorTabId = initialTab.id;
  appState.nextEditorTabId = 2;
}

function syncActiveEditorTab() {
  const tab = getActiveEditorTab(appState);
  if (!tab) return;

  tab.fileName = appState.currentFileName;
  tab.isDirty = appState.isDirty;
  tab.latestParseResult = appState.latestParseResult;
  tab.latestParsedSource = appState.latestParsedSource;
  if (editor && tab.id === appState.activeEditorTabId) {
    tab.content = editor.getValue();
    tab.viewState = editor.saveViewState();
  } else if (tab.model) {
    tab.content = tab.model.getValue();
  }
  renderFileTabs();
}

function activeTabsForStorage() {
  syncActiveEditorTab();
  return appState.editorTabs.map(tab => ({
    id: tab.id,
    fileName: tab.fileName,
    content: tab.content,
    isDirty: tab.isDirty,
  }));
}

function scheduleDraftSave() {
  if (!editor) return;
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => {
    writeStorage(DRAFT_STORAGE_KEY, JSON.stringify({
      tabs: activeTabsForStorage(),
      activeTabId: appState.activeEditorTabId,
      nextEditorTabId: appState.nextEditorTabId,
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
  if (!appState.latestParseResult) return;

  clearParseState(appState);
  exportBtn.disabled = true;
  setParseMarkers([]);
  updateStatus('Grammar changed - run Parse again before exporting', 'loading');
}

function markContentClean() {
  appState.isDirty = false;
  syncActiveEditorTab();
}

function confirmDiscardDirtyContent() {
  if (!appState.isDirty) return true;
  return confirm('Current edits will be replaced. Continue?');
}

function setMobileView(mode) {
  appState.mobileViewMode = mode === 'output' ? 'output' : 'editor';
  document.body.dataset.mobileView = appState.mobileViewMode;

  mobileEditorTab.setAttribute('aria-selected', String(appState.mobileViewMode === 'editor'));
  mobileOutputTab.setAttribute('aria-selected', String(appState.mobileViewMode === 'output'));
  mobileEditorTab.classList.toggle('active', appState.mobileViewMode === 'editor');
  mobileOutputTab.classList.toggle('active', appState.mobileViewMode === 'output');

  if (appState.mobileViewMode === 'editor') {
    editor?.layout();
  }
}

function renderFileTabs() {
  fileTabs.replaceChildren();

  appState.editorTabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = `file-tab-item${tab.id === appState.activeEditorTabId ? ' active' : ''}`;

    const tabButton = document.createElement('button');
    tabButton.type = 'button';
    tabButton.className = 'file-tab';
    tabButton.setAttribute('role', 'tab');
    tabButton.setAttribute('aria-selected', String(tab.id === appState.activeEditorTabId));
    tabButton.setAttribute('aria-label', `Open ${tab.fileName}`);
    tabButton.title = tab.fileName;
    tabButton.textContent = `${tab.fileName}${tab.isDirty ? ' *' : ''}`;
    tabButton.addEventListener('click', () => switchEditorTab(tab.id));
    item.appendChild(tabButton);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'file-tab-close';
    closeButton.textContent = 'x';
    closeButton.setAttribute('aria-label', `Close ${tab.fileName}`);
    closeButton.addEventListener('click', event => {
      event.stopPropagation();
      closeEditorTab(tab.id);
    });
    item.appendChild(closeButton);

    fileTabs.appendChild(item);
  });

  addFileTabBtn.disabled = appState.editorTabs.length >= MAX_EDITOR_TABS;
}

function ensureEditorTabModel(tab) {
  if (!tab.model) {
    tab.model = monaco.editor.createModel(tab.content, 'yacc');
  }
  return tab.model;
}

function setEditorModelForTab(tab) {
  suppressEditorChange = true;
  try {
    editor.setModel(ensureEditorTabModel(tab));
  } finally {
    suppressEditorChange = false;
  }
}

function restoreTabOutput(tab) {
  clearOutput();
  exportBtn.disabled = !tab.latestParseResult;
  setParseMarkers([]);

  if (tab.latestParseResult) {
    showStructuredResult(tab.latestParseResult);
    updateStatus(`Tab "${tab.fileName}" restored`, 'ready');
    return;
  }

  updateStatus(`Tab "${tab.fileName}" ready - Click Parse button`, 'ready');
}

function switchEditorTab(tabId) {
  if (tabId === appState.activeEditorTabId) return;

  syncActiveEditorTab();
  const targetTab = appState.editorTabs.find(tab => tab.id === tabId);
  if (!targetTab) return;

  appState.activeEditorTabId = targetTab.id;
  appState.currentFileName = targetTab.fileName;
  appState.isDirty = targetTab.isDirty;
  appState.latestParseResult = targetTab.latestParseResult;
  appState.latestParsedSource = targetTab.latestParsedSource;
  invalidateParserRequests(appState);

  setEditorModelForTab(targetTab);
  if (targetTab.viewState) {
    editor.restoreViewState(targetTab.viewState);
  }
  editor.focus();
  updateUndoRedoButtons();
  restoreTabOutput(targetTab);
  renderFileTabs();
  scheduleDraftSave();
}

function createNewEditorTab() {
  syncActiveEditorTab();
  if (appState.editorTabs.length >= MAX_EDITOR_TABS) {
    updateStatus(`Up to ${MAX_EDITOR_TABS} grammar tabs can be open at once`, 'loading');
    return;
  }

  const tabNumber = appState.nextEditorTabId;
  appState.nextEditorTabId += 1;
  const tab = createEditorTab({
    id: `tab-${tabNumber}`,
    fileName: `grammar-${tabNumber}.y`,
    content: '',
  });
  appState.editorTabs.push(tab);
  switchEditorTab(tab.id);
}

function closeEditorTab(tabId) {
  const tabIndex = appState.editorTabs.findIndex(tab => tab.id === tabId);
  if (tabIndex === -1) return;

  const tab = appState.editorTabs[tabIndex];
  if (tab.id === appState.activeEditorTabId) {
    syncActiveEditorTab();
  }

  if (tab.isDirty && !confirm(`Close "${tab.fileName}" with unsaved edits?`)) {
    return;
  }

  appState.editorTabs.splice(tabIndex, 1);
  if (appState.editorTabs.length === 0) {
    appState.editorTabs.push(createEditorTab({ content: getDefaultGrammarSource() }));
  }

  if (tab.id === appState.activeEditorTabId) {
    const nextTab = appState.editorTabs[Math.max(0, tabIndex - 1)];
    appState.activeEditorTabId = nextTab.id;
    appState.currentFileName = nextTab.fileName;
    appState.isDirty = nextTab.isDirty;
    appState.latestParseResult = nextTab.latestParseResult;
    appState.latestParsedSource = nextTab.latestParsedSource;
    invalidateParserRequests(appState);
    setEditorModelForTab(nextTab);
    if (nextTab.viewState) {
      editor.restoreViewState(nextTab.viewState);
    }
    editor.focus();
    updateUndoRedoButtons();
    restoreTabOutput(nextTab);
  }

  tab.model?.dispose();
  renderFileTabs();
  scheduleDraftSave();
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

function findRuleById(ruleId) {
  return appState.latestParseResult?.grammar?.rules?.find(rule => rule.id === ruleId);
}

function jumpToRuleById(ruleId) {
  const rule = findRuleById(ruleId);
  if (!rule) return false;
  jumpToLine(rule.location?.line || rule.line_number);
  return true;
}

function scrollToStateDetails(stateId) {
  const detail = outputEl.querySelector(`[data-state-detail-id="${stateId}"]`);
  if (!detail) return false;

  detail.open = true;
  detail.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
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
  appState.editingSymbolType = type;
  appState.editingSymbolIndex = index;
  appState.editingSymbolOriginalName = symbolData.name || null;

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
  appState.editingSymbolType = null;
  appState.editingSymbolIndex = null;
  appState.editingSymbolOriginalName = null;

  // Clear pending symbol if modal was cancelled (not saved)
  if (clearPending && appState.pendingSymbolToAdd) {
    appState.pendingSymbolToAdd = null;
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

  const oldName = appState.editingSymbolOriginalName;
  if (oldName && oldName !== name) {
    const referenceCount = countSymbolReferences(lines, oldName);
    const confirmed = confirm(
      `Rename "${oldName}" to "${name}" in ${referenceCount} grammar reference(s)?`
    );
    if (!confirmed) return;
  }

  if (appState.editingSymbolType === 'token') {
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
        if (appState.pendingSymbolToAdd) {
          appState.currentRuleSymbols.push(appState.pendingSymbolToAdd);
          updateRHSDisplay();
          appState.pendingSymbolToAdd = null;
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
  const oldName = appState.editingSymbolOriginalName;
  upsertTokenDeclaration(lines, name, type, tokenIdValue, oldName);
}

/**
 * Update nonterminal declaration
 */
function updateNonterminalDeclaration(lines, name, type) {
  const oldName = appState.editingSymbolOriginalName;
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
  appState.editingLineNumber = lineNumber;
  modalTitle.textContent = lineNumber ? 'Edit Rule' : 'Add New Rule';
  ruleLHS.value = lhs;
  appState.currentRuleSymbols = rhs.map(s => s.symbol || s);
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
  appState.currentRuleSymbols = [];
  appState.editingLineNumber = null;
  ruleInsertPositionGroup.style.display = 'block';
  updateRHSDisplay();
}

/**
 * Update RHS symbol display
 */
function updateRHSDisplay() {
  rhsSymbols.innerHTML = '';

  if (appState.currentRuleSymbols.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = 'No symbols yet (empty rule)';
    emptyMsg.style.color = 'var(--text-secondary)';
    emptyMsg.style.fontStyle = 'italic';
    rhsSymbols.appendChild(emptyMsg);
    return;
  }

  appState.currentRuleSymbols.forEach((symbol, index) => {
    const tag = document.createElement('div');
    tag.className = 'symbol-tag';

    const symbolText = document.createElement('span');
    symbolText.textContent = symbol;
    tag.appendChild(symbolText);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${symbol}`);
    removeBtn.addEventListener('click', () => {
      appState.currentRuleSymbols.splice(index, 1);
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
    appState.currentRuleSymbols.push(symbol);
    updateRHSDisplay();
    symbolInput.value = '';
    symbolInput.focus();
  } else {
    // Symbol is undefined - prompt user to register it
    appState.pendingSymbolToAdd = symbol;
    symbolInput.value = '';
    openSymbolTypeModal(symbol);
  }
}

/**
 * Check if symbol is defined in current grammar
 */
function isSymbolDefined(symbolName) {
  if (!appState.latestParseResult || !appState.latestParseResult.grammar) {
    // No parse result - allow any symbol
    return true;
  }

  const grammar = appState.latestParseResult.grammar;

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
  if (clearPending && appState.pendingSymbolToAdd) {
    appState.pendingSymbolToAdd = null;
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
  if (appState.pendingSymbolToAdd) {
    closeSymbolTypeModal(false); // Don't clear pending symbol
    openSymbolModal('token', null, { name: appState.pendingSymbolToAdd });
  }
}

/**
 * Handle register as nonterminal button
 */
function handleRegisterAsNonterminal() {
  if (appState.pendingSymbolToAdd) {
    closeSymbolTypeModal(false); // Don't clear pending symbol
    openSymbolModal('nonterminal', null, { name: appState.pendingSymbolToAdd });
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
  const rhs = appState.currentRuleSymbols.length > 0
    ? appState.currentRuleSymbols.join(' ')
    : '/* empty */';
  const ruleText = `${lhs}: ${rhs}\n    ;\n`;

  // Insert into editor
  if (editor) {
    const model = editor.getModel();
    const currentContent = model.getValue();

    if (appState.editingLineNumber) {
      // Edit existing rule
      const lines = currentContent.split('\n');
      let ruleStart = appState.editingLineNumber - 1;
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

  if (modKey && event.key.toLowerCase() === 't') {
    event.preventDefault();
    createNewEditorTab();
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
  setStatus(statusEl, message, type);
}

/**
 * Clear output area
 */
function clearOutput() {
  clearAnalysisOutput(outputEl, addRuleBtn);
}

/**
 * Show error
 */
function showError(message, location = null) {
  appendError(outputEl, message, location);
}

/**
 * Format and display JSON result
 */
function showResult(title, data) {
  appendJsonResult(outputEl, title, data);
}

function showDetailedResult(title, data, options = {}) {
  appendCollapsibleJsonResult(outputEl, title, data, options);
}

/**
 * Display structured parse result
 * @param {GrammarResult} data
 * @param {GrammarResult|null} previousResult
 */
function showStructuredResult(data, previousResult = null) {
  if (!data.success || !data.grammar) {
    showDetailedResult('Parse Result', data);
    return;
  }

  const grammar = data.grammar;
  const previousGrammar = previousResult?.grammar || null;

  // Title
  const titleEl = document.createElement('h3');
  titleEl.textContent = 'Grammar Structure';
  titleEl.style.marginBottom = '15px';
  titleEl.style.color = 'var(--text-primary)';
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

  if (grammar.resolved_conflicts && grammar.resolved_conflicts.length > 0) {
    outputEl.appendChild(createResolvedConflictsSection(grammar.resolved_conflicts));
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
    const firstFollowSection = createFirstFollowSection(
      grammar.first_sets,
      grammar.follow_sets,
      previousGrammar?.first_sets,
      previousGrammar?.follow_sets
    );
    outputEl.appendChild(firstFollowSection);
  }

  if (grammar.rules && grammar.rules.length > 0) {
    const dependencySection = createDependencyGraphSection(grammar.rules);
    if (dependencySection) {
      outputEl.appendChild(dependencySection);
    }
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
    tag.style.background = 'var(--accent-empty-bg)';
    tag.style.color = 'var(--accent-empty-text)';
    tag.style.border = '1px solid var(--accent-empty-border)';
    container.appendChild(tag);
  });

  section.appendChild(container);
  return section;
}

function hasLintFindings(lint) {
  return Object.values(lint).some(value => Array.isArray(value) && value.length > 0);
}

function createLintSection(lint) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = 'Grammar Lint';
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  Object.entries(LINT_LABELS).forEach(([key, label]) => {
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
      tag.style.background = 'var(--accent-warning-bg)';
      tag.style.color = 'var(--accent-warning-text)';
      tag.style.border = '1px solid var(--accent-warning-border)';
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
  titleEl.style.color = conflicts.some(c => c.severity === 'error')
    ? 'var(--accent-error-strong)'
    : 'var(--accent-warning-strong)';
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
      ? 'var(--accent-error-soft-bg)'
      : 'var(--accent-warning-soft-bg)';
    conflictCard.style.border = conflict.severity === 'error'
      ? '2px solid var(--accent-error-strong)'
      : '2px solid var(--accent-warning-strong)';
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
    severityTag.style.background = conflict.severity === 'error'
      ? 'var(--accent-error-strong)'
      : 'var(--accent-warning-strong)';
    severityTag.style.color = 'var(--text-inverse)';
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
        tokenSpan.style.background = 'var(--accent-error-bg)';
        tokenSpan.style.color = 'var(--accent-error-text)';
        tokenSpan.style.border = '1px solid var(--accent-error-border)';
        tokenSpan.style.fontWeight = 'bold';
        tokensDiv.appendChild(tokenSpan);
      });

      conflictCard.appendChild(tokensDiv);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '8px';
    actionsDiv.style.flexWrap = 'wrap';
    actionsDiv.style.marginTop = '12px';

    if (Number.isInteger(conflict.state)) {
      const stateBtn = document.createElement('button');
      stateBtn.type = 'button';
      stateBtn.className = 'secondary';
      stateBtn.textContent = `Open State ${conflict.state}`;
      stateBtn.setAttribute('aria-label', `Open state ${conflict.state} details`);
      stateBtn.style.padding = '5px 10px';
      stateBtn.style.fontSize = '12px';
      stateBtn.addEventListener('click', () => {
        if (!scrollToStateDetails(conflict.state)) {
          updateStatus(`State ${conflict.state} is not visible`, 'loading');
        }
      });
      actionsDiv.appendChild(stateBtn);
    }

    (conflict.rules || []).forEach(ruleId => {
      const ruleBtn = document.createElement('button');
      ruleBtn.type = 'button';
      ruleBtn.className = 'secondary';
      ruleBtn.textContent = `Jump Rule #${ruleId}`;
      ruleBtn.setAttribute('aria-label', `Jump to rule ${ruleId}`);
      ruleBtn.style.padding = '5px 10px';
      ruleBtn.style.fontSize = '12px';
      ruleBtn.addEventListener('click', () => {
        if (!jumpToRuleById(ruleId)) {
          updateStatus(`Rule #${ruleId} is not available`, 'loading');
        }
      });
      actionsDiv.appendChild(ruleBtn);
    });

    if (actionsDiv.childNodes.length > 0) {
      conflictCard.appendChild(actionsDiv);
    }

    section.appendChild(conflictCard);
  });

  return section;
}

function createResolvedConflictsSection(resolvedConflicts) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `Resolved Conflicts (${resolvedConflicts.length})`;
  titleEl.style.color = 'var(--status-ready-text)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  const descEl = document.createElement('p');
  descEl.textContent = 'Conflicts resolved by precedence or associativity before they become parser conflicts.';
  descEl.style.color = 'var(--text-secondary)';
  descEl.style.fontSize = '13px';
  descEl.style.marginBottom = '12px';
  section.appendChild(descEl);

  resolvedConflicts.forEach(conflict => {
    const card = document.createElement('div');
    card.style.background = 'var(--accent-success-soft-bg)';
    card.style.border = '1px solid var(--accent-success-border)';
    card.style.borderRadius = '6px';
    card.style.padding = '12px';
    card.style.marginBottom = '10px';

    const message = document.createElement('div');
    message.textContent = conflict.message || `Resolved as ${conflict.resolution}`;
    message.style.color = 'var(--text-primary)';
    message.style.fontSize = '13px';
    card.appendChild(message);

    const meta = document.createElement('div');
    meta.textContent = `State ${conflict.state}, Rule #${conflict.rule}, Symbol ${conflict.symbol || '-'}`;
    meta.style.color = 'var(--text-secondary)';
    meta.style.fontSize = '12px';
    meta.style.marginTop = '6px';
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.flexWrap = 'wrap';
    actions.style.marginTop = '10px';

    const stateBtn = document.createElement('button');
    stateBtn.type = 'button';
    stateBtn.className = 'secondary';
    stateBtn.textContent = `Open State ${conflict.state}`;
    stateBtn.setAttribute('aria-label', `Open state ${conflict.state} details`);
    stateBtn.style.padding = '5px 10px';
    stateBtn.style.fontSize = '12px';
    stateBtn.addEventListener('click', () => scrollToStateDetails(conflict.state));
    actions.appendChild(stateBtn);

    if (Number.isInteger(conflict.rule)) {
      const ruleBtn = document.createElement('button');
      ruleBtn.type = 'button';
      ruleBtn.className = 'secondary';
      ruleBtn.textContent = `Jump Rule #${conflict.rule}`;
      ruleBtn.setAttribute('aria-label', `Jump to rule ${conflict.rule}`);
      ruleBtn.style.padding = '5px 10px';
      ruleBtn.style.fontSize = '12px';
      ruleBtn.addEventListener('click', () => jumpToRuleById(conflict.rule));
      actions.appendChild(ruleBtn);
    }

    card.appendChild(actions);
    section.appendChild(card);
  });

  return section;
}

/**
 * Create First/Follow set section
 */
function createFirstFollowSection(firstSets, followSets, previousFirstSets = null, previousFollowSets = null) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  // Title
  const titleEl = document.createElement('h4');
  titleEl.textContent = 'First/Follow Sets';
  titleEl.style.color = 'var(--text-primary)';
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

  section.appendChild(createFirstFollowTable(firstSets, followSets, previousFirstSets, previousFollowSets));

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
          tokenSpan.style.background = 'var(--accent-empty-bg)';
          tokenSpan.style.color = 'var(--accent-empty-text)';
          tokenSpan.style.border = '1px solid var(--accent-empty-border)';
          tokenSpan.style.fontStyle = 'italic';
        } else {
          tokenSpan.style.background = 'var(--accent-terminal-bg)';
          tokenSpan.style.color = 'var(--accent-terminal-text)';
          tokenSpan.style.border = '1px solid var(--accent-terminal-border)';
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
          tokenSpan.style.background = 'var(--accent-error-bg)';
          tokenSpan.style.color = 'var(--accent-error-text)';
          tokenSpan.style.border = '1px solid var(--accent-error-border)';
          tokenSpan.style.fontWeight = 'bold';
        } else {
          tokenSpan.style.background = 'var(--accent-nonterminal-bg)';
          tokenSpan.style.color = 'var(--accent-nonterminal-text)';
          tokenSpan.style.border = '1px solid var(--accent-nonterminal-border)';
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

function createFirstFollowTable(firstSets, followSets, previousFirstSets = null, previousFollowSets = null) {
  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.style.marginBottom = '18px';

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.background = 'var(--bg-secondary)';
  table.style.border = '1px solid var(--border-color)';

  const headers = ['Symbol', 'FIRST', 'FOLLOW', 'Change'];
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.background = 'var(--btn-primary)';
  headerRow.style.color = 'var(--text-inverse)';
  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px 10px';
    th.style.textAlign = 'left';
    th.style.fontSize = '12px';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const symbols = [...new Set([...Object.keys(firstSets), ...Object.keys(followSets)])].sort();
  symbols.forEach((symbol, index) => {
    const row = document.createElement('tr');
    row.style.background = index % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)';

    [
      symbol,
      formatSetList(firstSets[symbol] || []),
      formatSetList(followSets[symbol] || []),
      formatFirstFollowDiff(
        firstSets[symbol] || [],
        followSets[symbol] || [],
        previousFirstSets?.[symbol],
        previousFollowSets?.[symbol]
      ),
    ].forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      td.style.padding = '7px 10px';
      td.style.borderBottom = '1px solid var(--border-color)';
      td.style.fontSize = '12px';
      td.style.color = 'var(--text-primary)';
      td.style.fontFamily = value === symbol ? "'Courier New', monospace" : '';
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  return tableWrap;
}

function formatSetList(values) {
  return values.length > 0 ? values.join(', ') : '(empty)';
}

function formatSetChange(current = [], previous = []) {
  if (!previous) return '';

  const currentSet = new Set(current);
  const previousSet = new Set(previous);
  const added = current.filter(value => !previousSet.has(value));
  const removed = previous.filter(value => !currentSet.has(value));
  return [
    ...added.map(value => `+${value}`),
    ...removed.map(value => `-${value}`),
  ].join(' ');
}

function formatFirstFollowDiff(first, follow, previousFirst, previousFollow) {
  if (!previousFirst && !previousFollow) return 'Initial';

  const firstChange = formatSetChange(first, previousFirst || []);
  const followChange = formatSetChange(follow, previousFollow || []);
  const parts = [];
  if (firstChange) parts.push(`FIRST ${firstChange}`);
  if (followChange) parts.push(`FOLLOW ${followChange}`);
  return parts.length > 0 ? parts.join(' | ') : 'No change';
}

function createDependencyGraphSection(rules) {
  const nonterminals = [...new Set(rules
    .map(rule => rule.lhs)
    .filter(name => name && !name.startsWith('$')))].sort();

  if (nonterminals.length === 0) return null;

  const nonterminalSet = new Set(nonterminals);
  const ruleLineByLhs = new Map();
  rules.forEach(rule => {
    if (rule.line_number && !ruleLineByLhs.has(rule.lhs)) {
      ruleLineByLhs.set(rule.lhs, rule.line_number);
    }
  });

  const edgeKeys = new Set();
  const edges = [];
  rules.forEach(rule => {
    if (!nonterminalSet.has(rule.lhs)) return;

    (rule.rhs || []).forEach(symbol => {
      if (symbol.type !== 'nonterminal') return;
      if (!nonterminalSet.has(symbol.symbol)) return;

      const key = `${rule.lhs}\u0000${symbol.symbol}`;
      if (edgeKeys.has(key)) return;

      edgeKeys.add(key);
      edges.push({ from: rule.lhs, to: symbol.symbol });
    });
  });

  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `Nonterminal Dependency Graph (${nonterminals.length})`;
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  const descEl = document.createElement('p');
  descEl.textContent = 'Rule-to-rule dependencies derived from nonterminals used on RHS.';
  descEl.style.color = 'var(--text-secondary)';
  descEl.style.fontSize = '13px';
  descEl.style.marginBottom = '15px';
  section.appendChild(descEl);

  const graphWrap = document.createElement('div');
  graphWrap.style.background = 'var(--bg-secondary)';
  graphWrap.style.border = '1px solid var(--border-color)';
  graphWrap.style.borderRadius = '6px';
  graphWrap.style.padding = '16px';
  graphWrap.style.overflow = 'auto';

  const svg = createDependencyGraph(nonterminals, edges, ruleLineByLhs);
  graphWrap.appendChild(svg);
  section.appendChild(graphWrap);

  if (edges.length > 0) {
    const list = document.createElement('details');
    list.style.marginTop = '10px';
    const summary = document.createElement('summary');
    summary.textContent = `Dependency edges (${edges.length})`;
    summary.style.cursor = 'pointer';
    summary.style.color = 'var(--btn-primary)';
    summary.style.fontWeight = 'bold';
    list.appendChild(summary);

    const edgeText = document.createElement('pre');
    edgeText.textContent = edges.map(edge => `${edge.from} -> ${edge.to}`).join('\n');
    edgeText.style.marginTop = '8px';
    edgeText.style.fontSize = '12px';
    list.appendChild(edgeText);
    section.appendChild(list);
  }

  return section;
}

function createDependencyGraph(nonterminals, edges, ruleLineByLhs) {
  const width = 900;
  const height = Math.max(320, Math.min(900, 240 + nonterminals.length * 24));
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = nonterminals.length === 1 ? 0 : Math.min(width, height) / 2 - 70;
  const nodeRadius = 22;
  const markerId = `dependency-arrowhead-${appState.svgIdCounter++}`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.background = 'var(--bg-primary)';
  svg.style.border = '1px solid var(--border-color)';
  svg.style.borderRadius = '4px';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.appendChild(createArrowMarker(markerId, STATE_GRAPH_COLORS.edge));
  svg.appendChild(defs);

  const positions = {};
  nonterminals.forEach((name, index) => {
    const angle = nonterminals.length === 1
      ? 0
      : (Math.PI * 2 * index) / nonterminals.length - Math.PI / 2;
    positions[name] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  edges.forEach(edge => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;
    drawDependencyEdge(svg, from, to, edge.from === edge.to, nodeRadius, markerId);
  });

  nonterminals.forEach(name => {
    const pos = positions[name];
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `Jump to ${name}`);
    group.style.cursor = ruleLineByLhs.has(name) ? 'pointer' : 'default';

    if (ruleLineByLhs.has(name)) {
      const jump = () => jumpToLine(ruleLineByLhs.get(name));
      group.addEventListener('click', jump);
      group.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        jump();
      });
    }

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', nodeRadius);
    circle.setAttribute('fill', 'var(--btn-primary)');
    circle.setAttribute('stroke', 'var(--text-primary)');
    circle.setAttribute('stroke-width', '2');
    group.appendChild(circle);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', pos.x);
    label.setAttribute('y', pos.y + nodeRadius + 16);
    label.setAttribute('font-size', '12');
    label.setAttribute('fill', 'var(--text-primary)');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = name;
    group.appendChild(label);

    const shortLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    shortLabel.setAttribute('x', pos.x);
    shortLabel.setAttribute('y', pos.y + 4);
    shortLabel.setAttribute('font-size', '12');
    shortLabel.setAttribute('font-weight', 'bold');
    shortLabel.setAttribute('fill', 'var(--text-inverse)');
    shortLabel.setAttribute('text-anchor', 'middle');
    shortLabel.textContent = String(nonterminals.indexOf(name) + 1);
    group.appendChild(shortLabel);

    svg.appendChild(group);
  });

  return svg;
}

function drawDependencyEdge(svg, from, to, isSelfLoop, nodeRadius, markerId) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  if (isSelfLoop) {
    const loopSize = 34;
    path.setAttribute(
      'd',
      `M ${from.x + nodeRadius} ${from.y} C ${from.x + loopSize} ${from.y - loopSize}, ${from.x - loopSize} ${from.y - loopSize}, ${from.x - nodeRadius} ${from.y}`
    );
  } else {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    const startX = from.x + Math.cos(angle) * nodeRadius;
    const startY = from.y + Math.sin(angle) * nodeRadius;
    const endX = to.x - Math.cos(angle) * (nodeRadius + 8);
    const endY = to.y - Math.sin(angle) * (nodeRadius + 8);
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    path.setAttribute('d', `M ${startX} ${startY} Q ${midX - dy / 12} ${midY + dx / 12} ${endX} ${endY}`);
  }

  path.setAttribute('stroke', STATE_GRAPH_COLORS.edge);
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('opacity', '0.7');
  path.setAttribute('marker-end', `url(#${markerId})`);
  svg.appendChild(path);
}

function jumpToLine(lineNumber) {
  if (!editor || !lineNumber) return;
  editor.setPosition({ lineNumber, column: 1 });
  editor.revealLineInCenter(lineNumber);
  editor.focus();
}

/**
 * Create table section
 */
function createSection(title, items, headers) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `${title} (${items.length})`;
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.background = 'var(--bg-secondary)';
  table.style.border = '1px solid var(--border-color)';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.background = 'var(--table-header-bg)';
  headerRow.style.color = 'var(--text-inverse)';

  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px 12px';
    th.style.textAlign = 'left';
    th.style.borderBottom = '2px solid var(--table-header-border)';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  items.forEach((item, index) => {
    const row = document.createElement('tr');
    row.style.background = index % 2 === 0 ? 'var(--table-row-alt-bg)' : 'var(--bg-secondary)';

    Object.values(item).forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      td.style.padding = '6px 12px';
      td.style.borderBottom = '1px solid var(--border-color)';
      td.style.color = 'var(--text-primary)';
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
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.fontSize = '16px';
  titleEl.style.margin = '0';
  headerDiv.appendChild(titleEl);

  const addBtn = document.createElement('button');
  addBtn.textContent = `+ Add ${symbolType === 'token' ? 'Token' : 'Nonterminal'}`;
  addBtn.setAttribute('aria-label', `Add ${symbolType === 'token' ? 'token' : 'nonterminal'}`);
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
  headerRow.style.background = 'var(--table-header-bg)';
  headerRow.style.color = 'var(--text-inverse)';

  [...headers, 'Actions'].forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px 12px';
    th.style.textAlign = 'left';
    th.style.borderBottom = '2px solid var(--table-header-border)';
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
    card.dataset.ruleId = String(rule.id);

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
        symSpan.textContent = sym.display_name || sym.symbol;
        if (sym.display_name && sym.display_name !== sym.symbol) {
          symSpan.title = sym.symbol;
        }
        rhsContainer.appendChild(symSpan);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'rule-symbol empty';
      emptySpan.textContent = rule.explicit_empty ? '%empty' : 'ε (empty)';
      rhsContainer.appendChild(emptySpan);
    }

    card.appendChild(rhsContainer);

    if (rule.action?.present) {
      const actionDetails = document.createElement('details');
      actionDetails.className = 'rule-card-action';
      const actionSummary = document.createElement('summary');
      actionSummary.textContent = 'Action';
      actionDetails.appendChild(actionSummary);
      const actionPreview = document.createElement('code');
      actionPreview.textContent = rule.action.preview || '(action code)';
      actionDetails.appendChild(actionPreview);
      card.appendChild(actionDetails);
    }

    // アクションボタン
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'rule-card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = '✏️ Edit';
    editBtn.setAttribute('aria-label', `Edit rule ${rule.id}`);
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
  titleEl.style.color = 'var(--text-primary)';
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
  graphContainer.style.overflow = 'hidden';
  graphContainer.style.position = 'relative';

  const toolbar = document.createElement('div');
  toolbar.style.marginBottom = '15px';
  toolbar.style.display = 'flex';
  toolbar.style.flexWrap = 'wrap';
  toolbar.style.alignItems = 'center';
  toolbar.style.gap = '8px';

  const svgExportBtn = document.createElement('button');
  svgExportBtn.textContent = 'Export SVG';
  svgExportBtn.setAttribute('aria-label', 'Export state transition diagram as SVG');
  svgExportBtn.className = 'secondary';
  svgExportBtn.style.padding = '6px 12px';
  svgExportBtn.style.fontSize = '12px';
  toolbar.appendChild(svgExportBtn);

  const pngExportBtn = document.createElement('button');
  pngExportBtn.textContent = 'Export PNG';
  pngExportBtn.setAttribute('aria-label', 'Export state transition diagram as PNG');
  pngExportBtn.className = 'secondary';
  pngExportBtn.style.padding = '6px 12px';
  pngExportBtn.style.fontSize = '12px';
  toolbar.appendChild(pngExportBtn);

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = 'Zoom Out';
  zoomOutBtn.setAttribute('aria-label', 'Zoom out state transition diagram');
  zoomOutBtn.className = 'secondary';
  zoomOutBtn.style.padding = '6px 12px';
  zoomOutBtn.style.fontSize = '12px';
  toolbar.appendChild(zoomOutBtn);

  const zoomInBtn = document.createElement('button');
  zoomInBtn.textContent = 'Zoom In';
  zoomInBtn.setAttribute('aria-label', 'Zoom in state transition diagram');
  zoomInBtn.className = 'secondary';
  zoomInBtn.style.padding = '6px 12px';
  zoomInBtn.style.fontSize = '12px';
  toolbar.appendChild(zoomInBtn);

  const fitBtn = document.createElement('button');
  fitBtn.textContent = 'Fit';
  fitBtn.setAttribute('aria-label', 'Fit state transition diagram');
  fitBtn.className = 'secondary';
  fitBtn.style.padding = '6px 12px';
  fitBtn.style.fontSize = '12px';
  toolbar.appendChild(fitBtn);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search states, symbols, rules, conflicts';
  searchInput.setAttribute('aria-label', 'Search states');
  searchInput.style.flex = '1 1 260px';
  searchInput.style.minWidth = '220px';
  searchInput.style.padding = '6px 10px';
  searchInput.style.border = '1px solid var(--border-color)';
  searchInput.style.borderRadius = '4px';
  searchInput.style.background = 'var(--bg-primary)';
  searchInput.style.color = 'var(--text-primary)';
  toolbar.appendChild(searchInput);

  const matchCount = document.createElement('span');
  matchCount.style.fontSize = '12px';
  matchCount.style.color = 'var(--text-secondary)';
  toolbar.appendChild(matchCount);

  graphContainer.appendChild(toolbar);

  const viewport = document.createElement('div');
  viewport.style.overflow = 'auto';
  viewport.style.maxHeight = '70vh';
  viewport.style.border = '1px solid var(--border-color)';
  viewport.style.borderRadius = '4px';
  viewport.style.background = 'var(--bg-primary)';

  const openStateDetails = (stateId) => {
    const detail = section.querySelector(`[data-state-detail-id="${stateId}"]`);
    if (!detail) return;
    detail.open = true;
    detail.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const svg = createStateTransitionGraph(stateTransitions, { onStateClick: openStateDetails });
  viewport.appendChild(svg);
  graphContainer.appendChild(viewport);

  let zoom = 1;
  const baseWidth = Number(svg.getAttribute('width')) || 1200;
  const baseHeight = Number(svg.getAttribute('height')) || 600;
  const setZoom = (nextZoom) => {
    zoom = Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, nextZoom));
    svg.style.width = `${baseWidth * zoom}px`;
    svg.style.height = `${baseHeight * zoom}px`;
  };

  zoomOutBtn.addEventListener('click', () => setZoom(zoom - GRAPH_ZOOM_STEP));
  zoomInBtn.addEventListener('click', () => setZoom(zoom + GRAPH_ZOOM_STEP));
  fitBtn.addEventListener('click', () => {
    const viewportWidth = Math.max(1, viewport.clientWidth - 16);
    const viewportHeight = Math.max(1, viewport.clientHeight - 16);
    setZoom(Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight, 1));
  });

  // Export button event listeners
  svgExportBtn.addEventListener('click', () => {
    downloadSVG(svg, 'state-transition-diagram.svg', { darkMode: isDarkMode });
    updateStatus('SVG exported: state-transition-diagram.svg', 'ready');
  });

  pngExportBtn.addEventListener('click', () => {
    downloadPNG(svg, 'state-transition-diagram.png', {
      darkMode: isDarkMode,
      onError: message => updateStatus(message, 'error'),
    });
    updateStatus('PNG export started: state-transition-diagram.png', 'ready');
  });

  section.appendChild(graphContainer);

  // State details table
  const detailsSection = createStateDetailsTable(stateTransitions);
  section.appendChild(detailsSection);

  const applySearch = () => {
    const query = searchInput.value;
    const matches = applyStateSearch(svg, stateTransitions, query);
    filterStateDetailCards(detailsSection, query);
    matchCount.textContent = query.trim()
      ? `${matches} matching states`
      : '';
  };
  searchInput.addEventListener('input', applySearch);
  applySearch();

  const parseTableSection = createParseTableSection(stateTransitions);
  section.appendChild(parseTableSection);

  return section;
}

/**
 * Create SVG for state transition graph
 */
function createStateTransitionGraph(stateTransitions, options = {}) {
  const nodeRadius = 30;
  const { width, height, positions } = calculateStateGraphLayout(stateTransitions, { nodeRadius });
  const markerId = `state-arrowhead-${appState.svgIdCounter++}`;

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.background = 'var(--bg-primary)';
  svg.style.border = '1px solid var(--border-color)';
  svg.style.borderRadius = '4px';

  // Arrow marker definition
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.appendChild(createArrowMarker(markerId, STATE_GRAPH_COLORS.edge));
  svg.appendChild(defs);

  // Draw edges (transitions)
  stateTransitions.forEach((state) => {
    const fromPos = positions[state.id];
    if (!fromPos) return;

    // Draw Shift transitions
    state.shifts.forEach(shift => {
      const toPos = positions[shift.to_state];
      if (toPos) {
        drawEdge(svg, fromPos, toPos, shift.symbol, STATE_GRAPH_COLORS.shift, nodeRadius, markerId);
      }
    });

    // Draw Goto transitions
    state.gotos.forEach(goto => {
      const toPos = positions[goto.to_state];
      if (toPos) {
        drawEdge(svg, fromPos, toPos, goto.symbol, STATE_GRAPH_COLORS.goto, nodeRadius, markerId);
      }
    });
  });

  // Draw nodes (states)
  stateTransitions.forEach((state) => {
    const pos = positions[state.id];
    if (!pos) return;

    const hasConflict = state.error || (state.conflicts && state.conflicts.length > 0);
    drawStateNode(svg, pos, state.id, hasConflict, nodeRadius, options.onStateClick);
  });

  addStateGraphLegend(svg, width);

  return svg;
}

function createArrowMarker(markerId, color) {
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 3, 0 6');
  polygon.setAttribute('fill', color);
  marker.appendChild(polygon);
  return marker;
}

function addStateGraphLegend(svg, width) {
  const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  legend.setAttribute('aria-label', 'State transition legend');
  const x = width - 210;
  const y = 18;

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', x - 12);
  bg.setAttribute('y', y - 12);
  bg.setAttribute('width', '194');
  bg.setAttribute('height', '106');
  bg.setAttribute('rx', '4');
  bg.setAttribute('fill', 'var(--bg-secondary)');
  bg.setAttribute('stroke', 'var(--border-color)');
  legend.appendChild(bg);

  [
    ['State', STATE_GRAPH_COLORS.state],
    ['Conflict', STATE_GRAPH_COLORS.conflict],
    ['Shift edge', STATE_GRAPH_COLORS.shift],
    ['Goto edge', STATE_GRAPH_COLORS.goto],
  ].forEach(([label, color], index) => {
    const itemY = y + index * 24;
    const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    swatch.setAttribute('cx', x);
    swatch.setAttribute('cy', itemY);
    swatch.setAttribute('r', '6');
    swatch.setAttribute('fill', color);
    legend.appendChild(swatch);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 14);
    text.setAttribute('y', itemY + 4);
    text.setAttribute('font-size', '12');
    text.setAttribute('fill', 'var(--text-primary)');
    text.textContent = label;
    legend.appendChild(text);
  });

  svg.appendChild(legend);
}

/**
 * Draw edge (transition)
 */
function drawEdge(svg, fromPos, toPos, label, color, nodeRadius, markerId) {
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
  path.setAttribute('marker-end', `url(#${markerId})`);
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
function drawStateNode(svg, pos, stateId, hasConflict, radius, onStateClick = null) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('data-state-id', String(stateId));
  group.setAttribute('tabindex', '0');
  group.setAttribute('role', 'button');
  group.setAttribute('aria-label', `Open state ${stateId} details`);
  group.style.cursor = 'pointer';

  const openDetails = () => {
    if (onStateClick) onStateClick(stateId);
  };
  group.addEventListener('click', openDetails);
  group.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openDetails();
  });

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = hasConflict ? `State ${stateId} has conflicts` : `State ${stateId}`;
  group.appendChild(title);

  // Draw circle
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', pos.x);
  circle.setAttribute('cy', pos.y);
  circle.setAttribute('r', radius);
  circle.setAttribute('fill', hasConflict ? STATE_GRAPH_COLORS.conflict : STATE_GRAPH_COLORS.state);
  circle.setAttribute('stroke', STATE_GRAPH_COLORS.nodeStroke);
  circle.setAttribute('stroke-width', '2');
  group.appendChild(circle);

  // Draw text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', pos.x);
  text.setAttribute('y', pos.y + 5);
  text.setAttribute('font-size', '14');
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('fill', 'var(--text-inverse)');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('pointer-events', 'none');
  text.textContent = stateId;
  group.appendChild(text);

  svg.appendChild(group);
}

function matchesStateQuery(state, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    `state ${state.id}`,
    String(state.id),
    state.error ? 'error conflict' : '',
    ...(state.items || []).map(item => `rule ${item.rule_id} ${item.display || ''}`),
    ...(state.shifts || []).map(shift => `shift ${shift.symbol} ${shift.to_state}`),
    ...(state.gotos || []).map(goto => `goto ${goto.symbol} ${goto.to_state}`),
    ...(state.reduces || []).map(reduce => `reduce ${reduce.symbol} rule ${reduce.rule_id}`),
    ...(state.conflicts || []).map(conflict => `conflict ${conflict.type} ${(conflict.tokens || []).join(' ')}`),
  ].join(' ').toLowerCase();

  return haystack.includes(normalized);
}

function applyStateSearch(svg, stateTransitions, query) {
  const queryText = query.trim();
  let matches = 0;

  stateTransitions.forEach(state => {
    const isMatch = matchesStateQuery(state, queryText);
    const node = svg.querySelector(`[data-state-id="${state.id}"]`);
    if (!node) return;

    if (isMatch) matches += 1;
    node.style.opacity = queryText && !isMatch ? '0.18' : '1';
    const circle = node.querySelector('circle');
    if (circle) {
      circle.setAttribute('stroke', queryText && isMatch ? STATE_GRAPH_COLORS.highlight : STATE_GRAPH_COLORS.nodeStroke);
      circle.setAttribute('stroke-width', queryText && isMatch ? '4' : '2');
    }
  });

  return queryText ? matches : stateTransitions.length;
}

function filterStateDetailCards(detailsSection, query) {
  const queryText = query.trim();
  detailsSection.querySelectorAll('[data-state-detail-id]').forEach(card => {
    const state = card._stateTransition;
    if (!state) return;
    const isMatch = matchesStateQuery(state, queryText);
    card.style.display = isMatch ? '' : 'none';
    if (queryText && isMatch) card.open = true;
  });
}

/**
 * Create state details table
 */
function createStateDetailsTable(stateTransitions) {
  const section = document.createElement('div');
  section.style.marginTop = '20px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.gap = '10px';
  header.style.marginBottom = '10px';

  const titleEl = document.createElement('h5');
  titleEl.textContent = 'State Details';
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.fontSize = '14px';
  titleEl.style.margin = '0';
  header.appendChild(titleEl);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';

  const expandAllBtn = document.createElement('button');
  expandAllBtn.type = 'button';
  expandAllBtn.className = 'secondary';
  expandAllBtn.textContent = 'Expand All';
  expandAllBtn.setAttribute('aria-label', 'Expand all state details');
  expandAllBtn.style.padding = '4px 10px';
  expandAllBtn.style.fontSize = '12px';
  actions.appendChild(expandAllBtn);

  const collapseAllBtn = document.createElement('button');
  collapseAllBtn.type = 'button';
  collapseAllBtn.className = 'secondary';
  collapseAllBtn.textContent = 'Collapse All';
  collapseAllBtn.setAttribute('aria-label', 'Collapse all state details');
  collapseAllBtn.style.padding = '4px 10px';
  collapseAllBtn.style.fontSize = '12px';
  actions.appendChild(collapseAllBtn);

  header.appendChild(actions);
  section.appendChild(header);

  const list = document.createElement('div');
  section.appendChild(list);

  stateTransitions.forEach((state, index) => {
    const stateCard = createStateDetailCard(state);
    stateCard.open = index < 10;
    list.appendChild(stateCard);
  });

  expandAllBtn.addEventListener('click', () => {
    list.querySelectorAll('details').forEach(card => {
      if (card.style.display !== 'none') card.open = true;
    });
  });

  collapseAllBtn.addEventListener('click', () => {
    list.querySelectorAll('details').forEach(card => {
      card.open = false;
    });
  });

  return section;
}

function createStateDetailCard(state) {
  const stateCard = document.createElement('details');
  stateCard.dataset.stateDetailId = String(state.id);
  stateCard._stateTransition = state;
  stateCard.style.marginBottom = '10px';
  stateCard.style.background = 'var(--bg-secondary)';
  stateCard.style.border = '1px solid var(--border-color)';
  stateCard.style.borderRadius = '4px';
  stateCard.style.padding = '10px';

  const summary = document.createElement('summary');
  summary.style.cursor = 'pointer';
  summary.style.fontWeight = 'bold';
  summary.style.color = state.conflicts && state.conflicts.length > 0
    ? 'var(--status-error-text)'
    : 'var(--btn-primary)';
  summary.textContent = `State ${state.id}`;
  if (state.conflicts && state.conflicts.length > 0) {
    const conflictLabel = document.createElement('span');
    conflictLabel.textContent = ` conflict x${state.conflicts.length}`;
    conflictLabel.style.marginLeft = '8px';
    conflictLabel.style.fontSize = '12px';
    conflictLabel.style.fontWeight = '600';
    summary.appendChild(conflictLabel);
  }
  stateCard.appendChild(summary);

  const content = document.createElement('div');
  content.style.marginTop = '10px';
  content.style.fontSize = '13px';

  if (state.error) {
    content.appendChild(createStateDetailLine('Error', state.error));
  }

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
      itemLine.tabIndex = 0;
      itemLine.setAttribute('role', 'button');
      itemLine.title = `Jump to rule ${item.rule_id}`;
      itemLine.style.cursor = 'pointer';
      const jump = () => jumpToRuleById(item.rule_id);
      itemLine.addEventListener('click', jump);
      itemLine.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        jump();
      });
      itemsDiv.appendChild(itemLine);
    });
    content.appendChild(itemsDiv);
  }

  if (state.shifts && state.shifts.length > 0) {
    content.appendChild(createStateDetailLine(
      'Shifts',
      state.shifts.map(s => `${s.symbol} -> ${s.to_state}`).join(', ')
    ));
  }

  if (state.gotos && state.gotos.length > 0) {
    content.appendChild(createStateDetailLine(
      'Gotos',
      state.gotos.map(g => `${g.symbol} -> ${g.to_state}`).join(', ')
    ));
  }

  if (state.reduces && state.reduces.length > 0) {
    content.appendChild(createStateDetailLine(
      'Reduces',
      state.reduces.map(r => `${r.symbol} -> Rule #${r.rule_id}`).join(', ')
    ));
  }

  if (state.conflicts && state.conflicts.length > 0) {
    content.appendChild(createStateDetailLine(
      'Conflicts',
      state.conflicts
        .map(conflict => `${conflict.type.replace(/_/g, '/')} (${(conflict.tokens || []).join(', ')})`)
        .join(', ')
    ));
  }

  stateCard.appendChild(content);
  return stateCard;
}

function createStateDetailLine(labelText, value) {
  const div = document.createElement('div');
  div.style.marginTop = '8px';
  const label = document.createElement('strong');
  label.textContent = `${labelText}: `;
  const text = document.createElement('span');
  text.textContent = value;
  div.append(label, text);
  return div;
}

function createParseTableSection(stateTransitions) {
  const section = document.createElement('div');
  section.style.marginTop = '22px';

  const titleEl = document.createElement('h5');
  titleEl.textContent = 'Parse Table';
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '14px';
  section.appendChild(titleEl);

  const wrap = document.createElement('div');
  wrap.style.overflowX = 'auto';
  wrap.style.border = '1px solid var(--border-color)';
  wrap.style.borderRadius = '4px';

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.background = 'var(--bg-secondary)';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.background = 'var(--btn-primary)';
  headerRow.style.color = 'var(--text-inverse)';
  ['State', 'ACTION', 'GOTO', 'Conflicts'].forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px 10px';
    th.style.textAlign = 'left';
    th.style.fontSize = '12px';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  stateTransitions.forEach((state, index) => {
    const row = document.createElement('tr');
    row.style.background = index % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)';

    const actions = [
      ...(state.shifts || []).map(shift => `${shift.symbol}: s${shift.to_state}`),
      ...(state.reduces || []).map(reduce => `${reduce.symbol}: r${reduce.rule_id}`),
    ];
    const gotos = (state.gotos || []).map(goto => `${goto.symbol}: ${goto.to_state}`);
    const conflicts = (state.conflicts || []).map(conflict => (
      `${conflict.type.replace(/_/g, '/')} ${(conflict.tokens || []).join(', ')}`
    ));

    [
      state.id,
      actions.length > 0 ? actions.join(', ') : '-',
      gotos.length > 0 ? gotos.join(', ') : '-',
      conflicts.length > 0 ? conflicts.join('; ') : '-',
    ].forEach((value, columnIndex) => {
      const td = document.createElement('td');
      td.textContent = value;
      td.style.padding = '7px 10px';
      td.style.borderBottom = '1px solid var(--border-color)';
      td.style.fontSize = '12px';
      td.style.color = columnIndex === 3 && conflicts.length > 0
        ? 'var(--status-error-text)'
        : 'var(--text-primary)';
      td.style.fontFamily = columnIndex === 0 ? "'Courier New', monospace" : '';
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
  return section;
}

/**
 * Create Syntax Diagrams section
 */
function createSyntaxDiagramsSection(syntaxDiagrams) {
  const section = document.createElement('div');
  section.style.marginBottom = '25px';

  const titleEl = document.createElement('h4');
  titleEl.textContent = `Syntax Diagrams (${Object.keys(syntaxDiagrams).length})`;
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontSize = '16px';
  section.appendChild(titleEl);

  const descEl = document.createElement('p');
  descEl.textContent = 'Visual railroad diagrams for each nonterminal production rule. Diagrams render when opened.';
  descEl.style.color = 'var(--text-secondary)';
  descEl.style.fontSize = '13px';
  descEl.style.marginBottom = '15px';
  section.appendChild(descEl);

  const symbols = Object.keys(syntaxDiagrams).sort();
  const toolbar = document.createElement('div');
  toolbar.style.display = 'flex';
  toolbar.style.alignItems = 'center';
  toolbar.style.gap = '10px';
  toolbar.style.marginBottom = '12px';

  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.placeholder = 'Filter diagrams by nonterminal';
  filterInput.setAttribute('aria-label', 'Filter syntax diagrams');
  filterInput.style.flex = '1 1 260px';
  filterInput.style.padding = '7px 10px';
  filterInput.style.border = '1px solid var(--border-color)';
  filterInput.style.borderRadius = '4px';
  filterInput.style.background = 'var(--bg-primary)';
  filterInput.style.color = 'var(--text-primary)';
  toolbar.appendChild(filterInput);

  const visibleCount = document.createElement('span');
  visibleCount.style.fontSize = '12px';
  visibleCount.style.color = 'var(--text-secondary)';
  toolbar.appendChild(visibleCount);
  section.appendChild(toolbar);

  const list = document.createElement('div');
  section.appendChild(list);

  symbols.forEach(symbol => {
    const diagramCard = document.createElement('details');
    diagramCard.dataset.diagramSymbol = symbol.toLowerCase();
    diagramCard.style.background = 'var(--bg-secondary)';
    diagramCard.style.border = '1px solid var(--border-color)';
    diagramCard.style.borderRadius = '6px';
    diagramCard.style.padding = '14px';
    diagramCard.style.marginBottom = '15px';
    diagramCard.style.overflow = 'auto';

    const summary = document.createElement('summary');
    summary.textContent = symbol;
    summary.style.cursor = 'pointer';
    summary.style.fontSize = '16px';
    summary.style.fontWeight = 'bold';
    summary.style.color = 'var(--btn-primary)';
    summary.style.fontFamily = "'Courier New', monospace";
    diagramCard.appendChild(summary);

    const content = document.createElement('div');
    content.style.marginTop = '15px';

    const header = document.createElement('div');
    header.style.marginBottom = '15px';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '2px solid var(--border-color)';
    header.style.display = 'flex';
    header.style.justifyContent = 'flex-end';
    header.style.alignItems = 'center';

    const exportButtons = document.createElement('div');
    exportButtons.style.display = 'flex';
    exportButtons.style.gap = '8px';

    const svgExportBtn = document.createElement('button');
    svgExportBtn.textContent = 'SVG';
    svgExportBtn.setAttribute('aria-label', `Export ${symbol} syntax diagram as SVG`);
    svgExportBtn.className = 'secondary';
    svgExportBtn.style.padding = '4px 10px';
    svgExportBtn.style.fontSize = '12px';
    svgExportBtn.title = 'Export as SVG';
    exportButtons.appendChild(svgExportBtn);

    const pngExportBtn = document.createElement('button');
    pngExportBtn.textContent = 'PNG';
    pngExportBtn.setAttribute('aria-label', `Export ${symbol} syntax diagram as PNG`);
    pngExportBtn.className = 'secondary';
    pngExportBtn.style.padding = '4px 10px';
    pngExportBtn.style.fontSize = '12px';
    pngExportBtn.title = 'Export as PNG';
    exportButtons.appendChild(pngExportBtn);

    header.appendChild(exportButtons);
    content.appendChild(header);

    const svgContainer = document.createElement('div');
    svgContainer.style.textAlign = 'center';
    svgContainer.style.padding = '15px';
    svgContainer.style.background = 'var(--bg-primary)';
    svgContainer.style.borderRadius = '4px';
    svgContainer.style.minHeight = '80px';
    svgContainer.style.display = 'flex';
    svgContainer.style.justifyContent = 'center';
    svgContainer.style.alignItems = 'center';

    const placeholder = document.createElement('span');
    placeholder.textContent = 'Open to render diagram.';
    placeholder.style.color = 'var(--text-secondary)';
    svgContainer.appendChild(placeholder);

    let renderedSvg = null;
    let renderAttempted = false;
    const renderDiagram = () => {
      if (renderAttempted) return renderedSvg;
      renderAttempted = true;
      svgContainer.replaceChildren();

      const svg = parseSanitizedSvg(syntaxDiagrams[symbol]);
      if (!svg) {
        svgExportBtn.disabled = true;
        pngExportBtn.disabled = true;
        const error = document.createElement('span');
        error.textContent = 'Diagram could not be rendered safely.';
        error.style.color = 'var(--status-error-text)';
        svgContainer.appendChild(error);
        return null;
      }

      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      svgContainer.appendChild(svg);
      renderedSvg = svg;
      return renderedSvg;
    };

    diagramCard.addEventListener('toggle', () => {
      if (diagramCard.open) renderDiagram();
    });

    svgExportBtn.addEventListener('click', () => {
      const svg = renderDiagram();
      if (!svg) return;
      const filename = `${symbol}-syntax-diagram.svg`;
      downloadSVG(svg, filename, { darkMode: isDarkMode });
      updateStatus(`SVG exported: ${filename}`, 'ready');
    });

    pngExportBtn.addEventListener('click', () => {
      const svg = renderDiagram();
      if (!svg) return;
      const filename = `${symbol}-syntax-diagram.png`;
      downloadPNG(svg, filename, {
        darkMode: isDarkMode,
        onError: message => updateStatus(message, 'error'),
      });
      updateStatus(`PNG export started: ${filename}`, 'ready');
    });

    content.appendChild(svgContainer);
    diagramCard.appendChild(content);
    list.appendChild(diagramCard);
  });

  const applyFilter = () => {
    const query = filterInput.value.trim().toLowerCase();
    let count = 0;
    list.querySelectorAll('[data-diagram-symbol]').forEach(card => {
      const visible = !query || card.dataset.diagramSymbol.includes(query);
      card.style.display = visible ? '' : 'none';
      if (visible) count += 1;
    });
    visibleCount.textContent = `${count} shown`;
  };
  filterInput.addEventListener('input', applyFilter);
  applyFilter();

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
  titleEl.style.color = 'var(--text-primary)';
  titleEl.style.fontSize = '16px';
  titleEl.style.margin = '0';
  headerDiv.appendChild(titleEl);

  // View toggle button
  const viewToggle = document.createElement('div');
  viewToggle.className = 'view-toggle';

  const cardViewBtn = document.createElement('button');
  cardViewBtn.textContent = '📋 Card View';
  cardViewBtn.setAttribute('aria-label', 'Show rules as cards');
  cardViewBtn.className = appState.rulesViewMode === 'card' ? 'active' : '';
  cardViewBtn.addEventListener('click', () => {
    appState.rulesViewMode = 'card';
    // Re-render
    const newContent = appState.rulesViewMode === 'card'
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
  terminalViewBtn.setAttribute('aria-label', 'Show rules as terminal text');
  terminalViewBtn.className = appState.rulesViewMode === 'terminal' ? 'active' : '';
  terminalViewBtn.addEventListener('click', () => {
    appState.rulesViewMode = 'terminal';
    // Re-render
    const newContent = appState.rulesViewMode === 'card'
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
  const rulesContent = appState.rulesViewMode === 'card'
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
  rulesContainer.style.background = 'var(--pre-bg)';
  rulesContainer.style.padding = '15px';
  rulesContainer.style.borderRadius = '4px';
  rulesContainer.style.color = 'var(--pre-text)';
  rulesContainer.style.fontFamily = "'Courier New', monospace";
  rulesContainer.style.fontSize = '13px';
  rulesContainer.style.lineHeight = '1.6';

  rules.forEach((rule) => {
    const ruleLine = document.createElement('div');
    ruleLine.dataset.ruleId = String(rule.id);
    ruleLine.style.marginBottom = '8px';

    // Make clickable if line number is available
    if (rule.line_number) {
      ruleLine.style.cursor = 'pointer';
      ruleLine.style.transition = 'background-color 0.2s';

      // Hover appearance
      ruleLine.addEventListener('mouseenter', () => {
        ruleLine.style.backgroundColor = 'var(--rule-hover-bg)';
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
    idSpan.style.color = 'var(--btn-secondary)';
    idSpan.style.marginRight = '8px';
    ruleLine.appendChild(idSpan);

    // LHS
    const lhsSpan = document.createElement('span');
    lhsSpan.textContent = rule.lhs;
    lhsSpan.style.color = 'var(--btn-primary)';
    lhsSpan.style.fontWeight = 'bold';
    ruleLine.appendChild(lhsSpan);

    // Colon
    const colonSpan = document.createElement('span');
    colonSpan.textContent = ' : ';
    colonSpan.style.color = 'var(--pre-text)';
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
        symSpan.textContent = sym.display_name || sym.symbol;
        if (sym.display_name && sym.display_name !== sym.symbol) {
          symSpan.title = sym.symbol;
        }
        symSpan.style.color = sym.type === 'terminal'
          ? 'var(--accent-terminal-text)'
          : 'var(--accent-error-strong)';
        ruleLine.appendChild(symSpan);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.textContent = rule.explicit_empty ? '%empty' : '/* empty */';
      emptySpan.style.color = 'var(--btn-secondary)';
      emptySpan.style.fontStyle = 'italic';
      ruleLine.appendChild(emptySpan);
    }

    if (rule.action?.present) {
      const actionSpan = document.createElement('span');
      actionSpan.textContent = ' { ... }';
      actionSpan.title = rule.action.preview || 'Action code';
      actionSpan.style.color = 'var(--accent-warning-strong)';
      ruleLine.appendChild(actionSpan);
    }

    // Line number
    if (rule.line_number) {
      const lineSpan = document.createElement('span');
      lineSpan.textContent = ` /* line ${rule.line_number} */`;
      lineSpan.style.color = 'var(--text-secondary)';
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
  const source = editor.getValue();
  const requestId = ++appState.parseRequestId;
  const previousParseResult = appState.latestParseResult;

  if (!source.trim()) {
    showError('Input is empty. Please enter .y file content.');
    return;
  }

  try {
    parseBtn.disabled = true;
    validateBtn.disabled = true;
    await ensureLramaReady();
    updateStatus('Parsing...', 'loading');

    const result = await lramaBridge.parse(source);
    if (requestId !== appState.parseRequestId) return;

    if (result.success) {
      updateStatus('Parse successful', 'ready');
      showStructuredResult(result, previousParseResult);
      setMobileView('output');
      // Show new rule add button
      addRuleBtn.style.display = 'block';
      // Save parse result and enable export button
      appState.latestParseResult = result;
      appState.latestParsedSource = source;
      exportBtn.disabled = false;
      setParseMarkers([]);
      syncActiveEditorTab();
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

      showDetailedResult('Error Details', result);
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
    appState.currentFileName = `${preset}.y`;
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
  const source = editor.getValue();
  const requestId = ++appState.validateRequestId;

  if (!source.trim()) {
    showError('Input is empty. Please enter .y file content.');
    return;
  }

  try {
    parseBtn.disabled = true;
    validateBtn.disabled = true;
    await ensureLramaReady();
    updateStatus('Validating...', 'loading');

    const result = await lramaBridge.validate(source);
    if (requestId !== appState.validateRequestId) return;

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
  clearParseState(appState);
  invalidateParserRequests(appState);
  exportBtn.disabled = true;
  setParseMarkers([]);
  syncActiveEditorTab();
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

  const grammar = appState.latestParseResult?.grammar;
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
    { id: 'new-tab', label: 'New Grammar Tab', run: createNewEditorTab, disabled: addFileTabBtn.disabled },
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
      button.setAttribute('aria-label', command.label);
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
  if (!appState.latestParseResult || !appState.latestParseResult.grammar) {
    alert('No parse result available. Please run Parse first.');
    return;
  }

  const grammar = appState.latestParseResult.grammar;
  const source = editor.getValue();
  if (source !== appState.latestParsedSource) {
    alert('The grammar changed after the last successful parse. Please run Parse again before exporting.');
    clearParseState(appState);
    exportBtn.disabled = true;
    syncActiveEditorTab();
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
  a.download = reportFileNameForGrammar(appState.currentFileName);
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateStatus('Report exported', 'ready');
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
  a.download = appState.currentFileName || DEFAULT_DOWNLOAD_FILENAME;
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
    appState.currentFileName = sanitizeDownloadFileName(file.name);
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
    appState.currentFileName = sanitizeDownloadFileName(file.name);
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

    updateStatus(appState.isDirty ? 'Draft restored - Click Parse button' : 'Ready - Click Parse button', 'ready');

    // Enable buttons
    parseBtn.disabled = false;
    validateBtn.disabled = false;
    resetVmBtn.disabled = false;
    uploadBtn.disabled = false;
    downloadBtn.disabled = false;

    const listen = appLifecycle.listen;

    // Set event listeners
    listen(parseBtn, 'click', handleParse);
    listen(validateBtn, 'click', handleValidate);
    listen(resetVmBtn, 'click', handleResetVM);
    listen(addFileTabBtn, 'click', createNewEditorTab);
    listen(presetSelect, 'change', handlePresetSelect);
    listen(uploadBtn, 'click', handleUpload);
    listen(downloadBtn, 'click', handleDownload);
    listen(exportBtn, 'click', handleExport);
    listen(fileInput, 'change', handleFileSelect);
    listen(themeToggle, 'click', toggleTheme);
    listen(undoBtn, 'click', handleUndo);
    listen(redoBtn, 'click', handleRedo);
    listen(autoParseToggle, 'change', scheduleAutoParse);

    // Symbol modal event listeners
    listen(symbolModalClose, 'click', () => closeSymbolModal(true));
    listen(symbolModalCancel, 'click', () => closeSymbolModal(true));
    listen(symbolForm, 'submit', handleSaveSymbol);

    // Close symbol modal on outside click
    listen(symbolModal, 'click', (e) => {
      if (e.target === symbolModal) {
        closeSymbolModal(true);
      }
    });

    // Rule modal event listeners
    listen(addRuleBtn, 'click', () => openRuleModal());
    listen(modalClose, 'click', closeRuleModal);
    listen(modalCancel, 'click', closeRuleModal);
    listen(ruleForm, 'submit', handleSaveRule);
    listen(addSymbolBtn, 'click', handleAddSymbol);

    // Add symbol on Enter key
    listen(symbolInput, 'keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSymbol();
      }
    });

    // Close modal on outside click
    listen(ruleModal, 'click', (e) => {
      if (e.target === ruleModal) {
        closeRuleModal();
      }
    });

    // Symbol type selection modal event listeners
    listen(symbolTypeModalClose, 'click', closeSymbolTypeModal);
    listen(symbolTypeModalCancel, 'click', closeSymbolTypeModal);
    listen(registerAsTokenBtn, 'click', handleRegisterAsToken);
    listen(registerAsNonterminalBtn, 'click', handleRegisterAsNonterminal);

    // Close symbol type modal on outside click
    listen(symbolTypeModal, 'click', (e) => {
      if (e.target === symbolTypeModal) {
        closeSymbolTypeModal();
      }
    });

    listen(commandPaletteClose, 'click', closeCommandPalette);
    listen(commandInput, 'input', renderCommandPalette);
    listen(commandInput, 'keydown', (event) => {
      if (event.key !== 'Enter') return;
      const firstCommand = commandList.querySelector('.command-item:not(:disabled)');
      if (!firstCommand) return;
      event.preventDefault();
      firstCommand.click();
    });
    listen(commandPalette, 'click', (event) => {
      if (event.target === commandPalette) {
        closeCommandPalette();
      }
    });
    listen(mobileEditorTab, 'click', () => setMobileView('editor'));
    listen(mobileOutputTab, 'click', () => setMobileView('output'));
    setMobileView('editor');

    // Drag and drop event listeners
    listen(editorContainer, 'dragover', handleDragOver);
    listen(editorContainer, 'dragleave', handleDragLeave);
    listen(editorContainer, 'drop', handleDrop);

    // Keyboard shortcuts
    listen(document, 'keydown', handleKeyboardShortcuts);
    appLifecycle.add(() => window.clearTimeout(draftSaveTimer));
    appLifecycle.add(() => window.clearTimeout(autoParseTimer));
    listen(window, 'pagehide', () => appLifecycle.dispose(), { once: true });

    console.log('Lrama Corral initialized successfully');
  } catch (error) {
    updateStatus('Initialization failed: ' + error.message, 'error');
    console.error('Initialization error:', error);
  }
}

// Start application
init();
