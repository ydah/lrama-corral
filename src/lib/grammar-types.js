/**
 * @typedef {Object} GrammarSymbol
 * @property {string} name
 * @property {string|null} [alias]
 * @property {string} [display_name]
 * @property {string|null} [type]
 * @property {number|null} [token_id]
 * @property {SourceLocation|null} [location]
 */

/**
 * @typedef {Object} SourceLocation
 * @property {number} line
 * @property {number} column
 * @property {number} end_line
 * @property {number} end_column
 */

/**
 * @typedef {Object} GrammarRuleSymbol
 * @property {string} symbol
 * @property {'terminal'|'nonterminal'|string} type
 * @property {string} [display_name]
 * @property {SourceLocation|null} [location]
 */

/**
 * @typedef {Object} GrammarRule
 * @property {number} id
 * @property {string} lhs
 * @property {GrammarRuleSymbol[]} rhs
 * @property {number|null} [line_number]
 * @property {SourceLocation|null} [location]
 * @property {boolean} [explicit_empty]
 * @property {{present:boolean, preview:string|null}|null} [action]
 */

/**
 * @typedef {Object} GrammarConflict
 * @property {'shift_reduce'|'reduce_reduce'|string} type
 * @property {number} state
 * @property {string} message
 * @property {string[]} tokens
 * @property {number[]} rules
 * @property {'warning'|'error'|string} severity
 */

/**
 * @typedef {Object} StateTransition
 * @property {number} id
 * @property {{rule_id:number, position:number, display:string}[]} items
 * @property {{symbol:string, to_state:number}[]} shifts
 * @property {{symbol:string, to_state:number}[]} gotos
 * @property {{symbol:string, rule_id:number}[]} reduces
 * @property {{type:string, severity:string, tokens:string[]}[]} conflicts
 * @property {string} [error]
 */

/**
 * @typedef {Object} Grammar
 * @property {GrammarSymbol[]} tokens
 * @property {GrammarSymbol[]} nonterminals
 * @property {GrammarRule[]} rules
 * @property {string|null} start_symbol
 * @property {Record<string, string[]>} first_sets
 * @property {Record<string, string[]>} follow_sets
 * @property {GrammarConflict[]} conflicts
 * @property {StateTransition[]} state_transitions
 * @property {Record<string, string>} syntax_diagrams
 */

/**
 * @typedef {Object} GrammarResult
 * @property {boolean} success
 * @property {Grammar} [grammar]
 * @property {{message:string, location?:{line:number,column:number}, severity?:string}[]} [errors]
 */

export {};
