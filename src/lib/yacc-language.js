import { findRuleEndLine } from './source-transforms.js';

export function registerYaccLanguage(monaco, options = {}) {
  const getGrammar = typeof options.getGrammar === 'function' ? options.getGrammar : () => null;

  monaco.languages.register({ id: 'yacc' });

  monaco.languages.setMonarchTokensProvider('yacc', {
    keywords: [
      'left', 'right', 'nonassoc', 'token', 'prec', 'type', 'start',
      'union', 'define', 'pure', 'parse', 'lex', 'param', 'locations',
      'error', 'destructor', 'printer', 'expect', 'expect-rr'
    ],

    tokenizer: {
      root: [
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
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
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, 'string', '@string_single'],
        [/\{/, 'delimiter.curly', '@action'],
        [/[a-zA-Z_][\w]*/, 'identifier'],
        [/[0-9]+/, 'number'],
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

  monaco.languages.registerCompletionItemProvider('yacc', {
    provideCompletionItems: () => {
      const suggestions = [];

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

      const snippets = [
        { label: '%%', insertText: '%%\n\n$0\n\n%%', detail: 'Rule section delimiter', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        {
          label: 'rule',
          insertText: '${1:nonterminal}: ${2:symbols}\n    {\n      $0\n    }\n    ;',
          detail: 'Rule template',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        },
      ];

      snippets.forEach(snippet => {
        suggestions.push({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.insertText,
          insertTextRules: snippet.insertTextRules,
          detail: snippet.detail,
          documentation: snippet.detail,
        });
      });

      const grammar = getGrammar();
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
      const grammar = getGrammar();
      if (!symbol || !grammar) return null;

      const token = grammar.tokens?.find(item => item.name === symbol);
      if (token) {
        const location = token.location ? `Line ${token.location.line}` : 'Declaration line unknown';
        const alias = token.alias ? `, Alias: \`${token.alias}\`` : '';
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [
            { value: `**Token** \`${token.name}\`` },
            { value: `Type: \`${token.type || '-'}\`, ID: \`${token.token_id ?? '-'}\`${alias}` },
            { value: location },
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
          { value: nonterminal.location ? `Declaration: Line ${nonterminal.location.line}` : 'Declaration: rule-derived' },
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
      const grammar = getGrammar();
      if (!symbol || !grammar) return null;

      const definition = getSymbolDefinition(symbol, grammar);
      if (!definition) return null;

      return {
        uri: model.uri,
        range: locationToMonacoRange(definition, model, monaco),
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

function getSymbolDefinition(symbol, grammar) {
  if (!symbol || !grammar) return null;

  const token = grammar.tokens?.find(item => item.name === symbol);
  if (token?.location) return token.location;

  const nonterminal = grammar.nonterminals?.find(item => item.name === symbol);
  if (nonterminal?.location) return nonterminal.location;

  const rule = grammar.rules?.find(item => item.lhs === symbol && (item.location || item.line_number));
  return rule?.location || (rule?.line_number ? { line: rule.line_number, column: 1 } : null);
}

function locationToMonacoRange(location, model, monaco) {
  const line = Math.max(1, location.line || 1);
  const column = Math.max(1, location.column || 1);
  const endLine = Math.max(line, location.end_line || line);
  const endColumn = location.end_column || model.getLineMaxColumn(endLine);
  return new monaco.Range(line, column, endLine, Math.max(column + 1, endColumn));
}
