export const LINT_LABELS = Object.freeze({
  undefined_symbols: 'Undefined Symbols',
  unused_tokens: 'Unused Tokens',
  unreachable_nonterminals: 'Unreachable Nonterminals',
  unused_rules: 'Unused Rules',
  non_productive_nonterminals: 'Nonproductive Nonterminals',
  referenced_nonterminals_without_rules: 'Referenced Nonterminals Without Rules',
  declared_nonterminals_without_rules: 'Declared Nonterminals Without Rules',
});

export function formatLabel(value) {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, letter => letter.toUpperCase());
}
