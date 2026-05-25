/** @typedef {import('./grammar-types.js').Grammar} Grammar */

const LINT_LABELS = {
  undefined_symbols: 'Undefined Symbols',
  unused_tokens: 'Unused Tokens',
  unreachable_nonterminals: 'Unreachable Nonterminals',
  unused_rules: 'Unused Rules',
  non_productive_nonterminals: 'Nonproductive Nonterminals',
  referenced_nonterminals_without_rules: 'Referenced Nonterminals Without Rules',
  declared_nonterminals_without_rules: 'Declared Nonterminals Without Rules',
};

/**
 * Generate a standalone HTML report for a parsed grammar.
 *
 * @param {string} source
 * @param {Grammar} grammar
 * @returns {string}
 */
export function generateHTMLReport(source, grammar) {
  const now = new Date().toLocaleString();

  let html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lrama Grammar Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; color: #2c3e50; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
    header { background: #2c3e50; color: white; padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #ecf0f1; font-size: 14px; }
    .content { padding: 20px; }
    h2 { color: #2c3e50; font-size: 20px; margin: 22px 0 10px; padding-bottom: 8px; border-bottom: 2px solid #3498db; }
    h3 { color: #34495e; font-size: 16px; margin: 15px 0 10px; }
    p { line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #34495e; color: white; padding: 8px 12px; text-align: left; }
    td { padding: 6px 12px; border-bottom: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) { background: #f9f9f9; }
    code, .mono { font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; }
    pre { background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
    .token { padding: 3px 8px; border-radius: 3px; font-size: 12px; font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; display: inline-block; margin: 2px; }
    .token.terminal { background: rgba(46, 204, 113, 0.15); color: #196f3d; border: 1px solid rgba(46, 204, 113, 0.3); }
    .token.nonterminal { background: rgba(52, 152, 219, 0.15); color: #1f618d; border: 1px solid rgba(52, 152, 219, 0.3); }
    .token.empty { background: rgba(155, 89, 182, 0.15); color: #6c3483; border: 1px solid rgba(155, 89, 182, 0.3); font-style: italic; }
    .token.lint { background: rgba(243, 156, 18, 0.15); color: #9a5f00; border: 1px solid rgba(243, 156, 18, 0.3); }
    .card { border-radius: 6px; padding: 14px; margin: 10px 0; border: 1px solid #d8dee4; background: #fbfcfd; }
    .conflict.error { background: rgba(231, 76, 60, 0.1); border: 2px solid #c0392b; }
    .conflict.warning { background: rgba(243, 156, 18, 0.1); border: 2px solid #d68910; }
    .conflict.resolved { background: rgba(46, 204, 113, 0.1); border: 1px solid rgba(46, 204, 113, 0.4); }
    .tag { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; margin-right: 6px; background: #7f8c8d; color: white; }
    .tag.error { background: #c0392b; }
    .tag.warning { background: #d68910; color: #1f1300; }
    .tag.resolved { background: #1e8449; }
    .muted { color: #6b7280; font-size: 12px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 18px; }
    .rule { margin: 10px 0; font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; line-height: 1.7; }
    .rule-id { color: #6b7280; }
    .rule-lhs { color: #21618c; font-weight: 700; }
    .action-preview { margin-left: 8px; color: #6b7280; font-size: 12px; }
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

  if (grammar.start_symbol) {
    html += `<h2>Start Symbol</h2><p><code>${escapeHtml(grammar.start_symbol)}</code></p>`;
  }

  if (grammar.metadata || (grammar.analysis_warnings && grammar.analysis_warnings.length > 0)) {
    html += renderMetadata(grammar.metadata, grammar.analysis_warnings || []);
  }

  if (grammar.expectations) {
    html += renderExpectations(grammar.expectations);
  }

  if (grammar.tokens && grammar.tokens.length > 0) {
    html += `<h2>Tokens (${grammar.tokens.length})</h2><table><thead><tr><th>Name</th><th>Display</th><th>Type</th><th>ID</th><th>Source</th></tr></thead><tbody>`;
    grammar.tokens.forEach(token => {
      html += `<tr><td>${escapeHtml(token.name)}</td><td>${escapeHtml(token.display_name || token.alias || '-')}</td><td>${escapeHtml(token.type || '-')}</td><td>${escapeHtml(token.token_id ?? '-')}</td><td>${escapeHtml(locationLabel(token.location))}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  if (grammar.nonterminals && grammar.nonterminals.length > 0) {
    html += `<h2>Nonterminals (${grammar.nonterminals.length})</h2><table><thead><tr><th>Name</th><th>Type</th><th>Source</th></tr></thead><tbody>`;
    grammar.nonterminals.forEach(nonterminal => {
      html += `<tr><td>${escapeHtml(nonterminal.name)}</td><td>${escapeHtml(nonterminal.type || '-')}</td><td>${escapeHtml(locationLabel(nonterminal.location))}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  if (grammar.conflicts && grammar.conflicts.length > 0) {
    html += `<h2>Potential Conflicts (${grammar.conflicts.length})</h2>`;
    grammar.conflicts.forEach(conflict => {
      const severity = conflict.severity === 'error' ? 'error' : 'warning';
      html += `<div class="card conflict ${severity}">
        <span class="tag ${severity}">${severity.toUpperCase()}</span>
        <span class="tag">${escapeHtml(formatLabel(conflict.type))}</span>
        ${Number.isInteger(conflict.state) ? `<span class="tag">STATE ${escapeHtml(conflict.state)}</span>` : ''}
        <p>${escapeHtml(conflict.message)}</p>
        ${arrayHasValues(conflict.rules) ? `<p class="muted"><strong>Rules:</strong> ${escapeHtml(conflict.rules.map(rule => `#${rule}`).join(', '))}</p>` : ''}
        ${arrayHasValues(conflict.tokens) ? `<p class="muted"><strong>Tokens:</strong> ${conflict.tokens.map(token => renderToken(token, 'terminal')).join(' ')}</p>` : ''}
      </div>`;
    });
  }

  if (grammar.resolved_conflicts && grammar.resolved_conflicts.length > 0) {
    html += `<h2>Resolved Conflicts (${grammar.resolved_conflicts.length})</h2>`;
    grammar.resolved_conflicts.forEach(conflict => {
      html += `<div class="card conflict resolved">
        <span class="tag resolved">${escapeHtml(String(conflict.resolution || 'resolved').toUpperCase())}</span>
        ${Number.isInteger(conflict.state) ? `<span class="tag">STATE ${escapeHtml(conflict.state)}</span>` : ''}
        ${conflict.same_precedence ? '<span class="tag">SAME PRECEDENCE</span>' : ''}
        <p>${escapeHtml(conflict.message || 'Resolved by precedence or associativity')}</p>
        <p class="muted"><strong>State:</strong> ${escapeHtml(conflict.state ?? '-')} <strong>Rule:</strong> ${escapeHtml(Number.isInteger(conflict.rule) ? `#${conflict.rule}` : '-')} <strong>Symbol:</strong> ${escapeHtml(conflict.symbol || '-')}</p>
      </div>`;
    });
  }

  if (grammar.nullable_symbols && grammar.nullable_symbols.length > 0) {
    html += `<h2>Nullable Nonterminals (${grammar.nullable_symbols.length})</h2><p>`;
    html += grammar.nullable_symbols.map(symbol => renderToken(symbol, 'nonterminal')).join(' ');
    html += `</p>`;
  }

  if (grammar.lint && hasLintFindings(grammar.lint)) {
    html += `<h2>Grammar Lint</h2>`;
    Object.entries(grammar.lint).forEach(([key, values]) => {
      if (!Array.isArray(values) || values.length === 0) return;
      html += `<h3>${escapeHtml(LINT_LABELS[key] || formatLabel(key))}</h3><p>${values.map(value => renderToken(value, 'lint')).join(' ')}</p>`;
    });
  }

  if (grammar.first_sets && grammar.follow_sets) {
    html += `<h2>First/Follow Sets</h2>`;
    const symbols = Object.keys(grammar.first_sets).sort();
    symbols.forEach(symbol => {
      html += `<h3>${escapeHtml(symbol)}</h3>`;
      html += `<p><strong>FIRST:</strong> ${renderTokenList(grammar.first_sets[symbol], 'terminal')}</p>`;
      html += `<p><strong>FOLLOW:</strong> ${renderTokenList(grammar.follow_sets[symbol], 'terminal')}</p>`;
    });
  }

  if (grammar.rules && grammar.rules.length > 0) {
    html += `<h2>Rules (${grammar.rules.length})</h2>`;
    grammar.rules.forEach(rule => {
      html += `<div class="rule">`;
      html += `<span class="rule-id">[${escapeHtml(rule.id)}]</span> `;
      html += `<span class="rule-lhs">${escapeHtml(rule.lhs)}</span> : `;

      if (rule.rhs && rule.rhs.length > 0) {
        rule.rhs.forEach(symbol => {
          html += `${renderRuleSymbol(symbol)} `;
        });
      } else {
        html += `<span class="token empty">${escapeHtml(rule.explicit_empty ? '%empty' : '(empty)')}</span>`;
      }

      if (rule.action?.present && rule.action.preview) {
        html += `<span class="action-preview">{ ${escapeHtml(rule.action.preview)} }</span>`;
      }

      if (rule.line_number) {
        html += ` <span class="muted">line ${escapeHtml(rule.line_number)}</span>`;
      }
      html += `</div>`;
    });
  }

  if (grammar.state_transitions && grammar.state_transitions.length > 0) {
    html += renderParseTable(grammar.state_transitions);
  }

  html += `<h2>Source Code</h2><pre>${escapeHtml(source)}</pre>`;

  html += `
    </div>
  </div>
</body>
</html>`;

  return html;
}

function renderMetadata(metadata, warnings) {
  let html = `<h2>Parser Runtime</h2>`;
  if (metadata && Object.keys(metadata).length > 0) {
    html += `<div class="meta-grid">`;
    Object.entries(metadata).forEach(([key, value]) => {
      html += `<p><strong>${escapeHtml(formatLabel(key))}:</strong> ${escapeHtml(value ?? '-')}</p>`;
    });
    html += `</div>`;
  }

  if (warnings.length > 0) {
    html += `<h3>Analysis Warnings</h3><ul>`;
    warnings.forEach(warning => {
      html += `<li>${escapeHtml(warning.phase || 'analysis')}: ${escapeHtml(warning.message || warning)}</li>`;
    });
    html += `</ul>`;
  }

  return html;
}

function renderExpectations(expectations) {
  const rows = [
    ['Shift/Reduce', expectations.shift_reduce],
    ['Reduce/Reduce', expectations.reduce_reduce],
  ].filter(([, value]) => value);

  if (rows.length === 0) return '';

  let html = `<h2>Conflict Expectations</h2><table><thead><tr><th>Type</th><th>Actual</th><th>Expected</th><th>Status</th></tr></thead><tbody>`;
  rows.forEach(([label, data]) => {
    const status = data.satisfied === null
      ? 'not declared'
      : data.satisfied ? 'satisfied' : 'mismatch';
    html += `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(data.actual ?? '-')}</td><td>${escapeHtml(data.expected ?? '-')}</td><td>${escapeHtml(status)}</td></tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

function renderParseTable(stateTransitions) {
  let html = `<h2>Parse Table</h2><table><thead><tr><th>State</th><th>ACTION</th><th>GOTO</th><th>Conflicts</th></tr></thead><tbody>`;
  stateTransitions.forEach(state => {
    const actions = [
      ...(state.shifts || []).map(shift => `${shift.symbol}: s${shift.to_state}`),
      ...(state.reduces || []).map(reduce => `${reduce.symbol}: r${reduce.rule_id}`),
    ];
    const gotos = (state.gotos || []).map(goto => `${goto.symbol}: ${goto.to_state}`);
    const conflicts = (state.conflicts || []).map(conflict => (
      `${String(conflict.type || '').replace(/_/g, '/')} ${(conflict.tokens || []).join(', ')}`
    ));

    html += `<tr><td>${escapeHtml(state.id)}</td><td>${escapeHtml(actions.length > 0 ? actions.join(', ') : '-')}</td><td>${escapeHtml(gotos.length > 0 ? gotos.join(', ') : '-')}</td><td>${escapeHtml(conflicts.length > 0 ? conflicts.join('; ') : '-')}</td></tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

function renderRuleSymbol(symbol) {
  const display = symbol.display_name || symbol.symbol;
  const kind = symbol.type === 'nonterminal' ? 'nonterminal' : 'terminal';
  return renderToken(display, kind);
}

function renderTokenList(values, kind) {
  if (!Array.isArray(values) || values.length === 0) {
    return `<em>(empty)</em>`;
  }
  return values.map(value => renderToken(value, value === '\u03b5' ? 'empty' : kind)).join(' ');
}

function renderToken(value, kind) {
  const className = ['terminal', 'nonterminal', 'empty', 'lint'].includes(kind) ? kind : 'terminal';
  return `<span class="token ${className}">${escapeHtml(value)}</span>`;
}

function hasLintFindings(lint) {
  return Object.values(lint).some(value => Array.isArray(value) && value.length > 0);
}

function arrayHasValues(value) {
  return Array.isArray(value) && value.length > 0;
}

function locationLabel(location) {
  if (!location) return '-';
  if (location.end_line && location.end_line !== location.line) {
    return `line ${location.line}:${location.column}-line ${location.end_line}:${location.end_column}`;
  }
  return `line ${location.line}:${location.column}`;
}

function formatLabel(value) {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function escapeHtml(value) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(value ?? '').replace(/[&<>"']/g, match => map[match]);
}
