/** @typedef {import('./grammar-types.js').Grammar} Grammar */

import { LINT_LABELS, formatLabel } from './grammar-labels.js';

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
    :root {
      --report-bg: #f5f5f5;
      --report-surface: #ffffff;
      --report-surface-subtle: #fbfcfd;
      --report-text: #2c3e50;
      --report-text-secondary: #6b7280;
      --report-header-bg: #2c3e50;
      --report-header-text: #ffffff;
      --report-header-muted: #ecf0f1;
      --report-accent: #3498db;
      --report-table-header-bg: #34495e;
      --report-border: #ddd;
      --report-card-border: #d8dee4;
      --report-row-alt: #f9f9f9;
      --report-shadow: rgba(0, 0, 0, 0.1);
      --report-terminal-bg: rgba(46, 204, 113, 0.15);
      --report-terminal-text: #196f3d;
      --report-terminal-border: rgba(46, 204, 113, 0.3);
      --report-nonterminal-bg: rgba(52, 152, 219, 0.15);
      --report-nonterminal-text: #1f618d;
      --report-nonterminal-border: rgba(52, 152, 219, 0.3);
      --report-empty-bg: rgba(155, 89, 182, 0.15);
      --report-empty-text: #6c3483;
      --report-empty-border: rgba(155, 89, 182, 0.3);
      --report-lint-bg: rgba(243, 156, 18, 0.15);
      --report-lint-text: #9a5f00;
      --report-lint-border: rgba(243, 156, 18, 0.3);
      --report-error-bg: rgba(231, 76, 60, 0.1);
      --report-error-border: #c0392b;
      --report-warning-bg: rgba(243, 156, 18, 0.1);
      --report-warning-border: #d68910;
      --report-warning-text: #1f1300;
      --report-success-bg: rgba(46, 204, 113, 0.1);
      --report-success-border: rgba(46, 204, 113, 0.4);
      --report-success-tag-bg: #1e8449;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: var(--report-bg); color: var(--report-text); }
    .container { max-width: 1200px; margin: 0 auto; background: var(--report-surface); border-radius: 8px; box-shadow: 0 2px 8px var(--report-shadow); overflow: hidden; }
    header { background: var(--report-header-bg); color: var(--report-header-text); padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: var(--report-header-muted); font-size: 14px; }
    .content { padding: 20px; }
    h2 { color: var(--report-text); font-size: 20px; margin: 22px 0 10px; padding-bottom: 8px; border-bottom: 2px solid var(--report-accent); }
    h3 { color: var(--report-table-header-bg); font-size: 16px; margin: 15px 0 10px; }
    p { line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: var(--report-table-header-bg); color: var(--report-header-text); padding: 8px 12px; text-align: left; }
    td { padding: 6px 12px; border-bottom: 1px solid var(--report-border); vertical-align: top; }
    tr:nth-child(even) { background: var(--report-row-alt); }
    code, .mono { font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; }
    pre { background: var(--report-header-bg); color: var(--report-header-muted); padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
    .token { padding: 3px 8px; border-radius: 3px; font-size: 12px; font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; display: inline-block; margin: 2px; }
    .token.terminal { background: var(--report-terminal-bg); color: var(--report-terminal-text); border: 1px solid var(--report-terminal-border); }
    .token.nonterminal { background: var(--report-nonterminal-bg); color: var(--report-nonterminal-text); border: 1px solid var(--report-nonterminal-border); }
    .token.empty { background: var(--report-empty-bg); color: var(--report-empty-text); border: 1px solid var(--report-empty-border); font-style: italic; }
    .token.lint { background: var(--report-lint-bg); color: var(--report-lint-text); border: 1px solid var(--report-lint-border); }
    .card { border-radius: 6px; padding: 14px; margin: 10px 0; border: 1px solid var(--report-card-border); background: var(--report-surface-subtle); }
    .conflict.error { background: var(--report-error-bg); border: 2px solid var(--report-error-border); }
    .conflict.warning { background: var(--report-warning-bg); border: 2px solid var(--report-warning-border); }
    .conflict.resolved { background: var(--report-success-bg); border: 1px solid var(--report-success-border); }
    .tag { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; margin-right: 6px; background: var(--report-text-secondary); color: var(--report-header-text); }
    .tag.error { background: var(--report-error-border); }
    .tag.warning { background: var(--report-warning-border); color: var(--report-warning-text); }
    .tag.resolved { background: var(--report-success-tag-bg); }
    .muted { color: var(--report-text-secondary); font-size: 12px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 18px; }
    .rule { margin: 10px 0; font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; line-height: 1.7; }
    .rule-id { color: var(--report-text-secondary); }
    .rule-lhs { color: var(--report-nonterminal-text); font-weight: 700; }
    .action-preview { margin-left: 8px; color: var(--report-text-secondary); font-size: 12px; }
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
