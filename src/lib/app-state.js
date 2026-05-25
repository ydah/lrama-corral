export function createEditorTab(overrides = {}) {
  return {
    id: 'tab-1',
    fileName: 'grammar.y',
    content: '',
    isDirty: false,
    latestParseResult: null,
    latestParsedSource: '',
    ...overrides,
  };
}

export function createAppState(overrides = {}) {
  const initialTab = createEditorTab();

  return {
    rulesViewMode: 'card',
    currentRuleSymbols: [],
    editingLineNumber: null,
    editingSymbolType: null,
    editingSymbolIndex: null,
    editingSymbolOriginalName: null,
    pendingSymbolToAdd: null,
    latestParseResult: null,
    latestParsedSource: '',
    parseRequestId: 0,
    validateRequestId: 0,
    currentFileName: 'grammar.y',
    isDirty: false,
    editorTabs: [initialTab],
    activeEditorTabId: initialTab.id,
    nextEditorTabId: 2,
    svgIdCounter: 0,
    mobileViewMode: 'editor',
    ...overrides,
  };
}

export function clearParseState(state) {
  state.latestParseResult = null;
  state.latestParsedSource = '';
}

export function getActiveEditorTab(state) {
  return state.editorTabs.find(tab => tab.id === state.activeEditorTabId) || null;
}

export function invalidateParserRequests(state) {
  state.parseRequestId += 1;
  state.validateRequestId += 1;
}
