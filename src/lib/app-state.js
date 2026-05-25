export function createAppState(overrides = {}) {
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
    svgIdCounter: 0,
    mobileViewMode: 'editor',
    ...overrides,
  };
}

export function clearParseState(state) {
  state.latestParseResult = null;
  state.latestParsedSource = '';
}

export function invalidateParserRequests(state) {
  state.parseRequestId += 1;
  state.validateRequestId += 1;
}
