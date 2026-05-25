# frozen_string_literal: true

# Load the Lrama bundle (all Lrama code in one file)
require_relative 'lrama_bundle'

# Load railroad_diagrams bundle for syntax diagram generation
require_relative 'railroad_diagrams_bundle'

# Simple JSON generation (since json gem is not available in Wasm)
module SimpleJSON
  def self.generate(obj)
    case obj
    when Hash
      "{" + obj.map { |k, v| "\"#{escape_string(k.to_s)}\":#{generate(v)}" }.join(",") + "}"
    when Array
      "[" + obj.map { |v| generate(v) }.join(",") + "]"
    when String
      "\"#{escape_string(obj)}\""
    when Symbol
      "\"#{escape_string(obj.to_s)}\""
    when Numeric, TrueClass, FalseClass
      obj.to_s
    when NilClass
      "null"
    else
      "\"#{escape_string(obj.to_s)}\""
    end
  end

  def self.escape_string(str)
    replacements = {
      "\\" => "\\\\",
      '"' => '\"',
      "\b" => '\b',
      "\f" => '\f',
      "\n" => '\n',
      "\r" => '\r',
      "\t" => '\t'
    }

    str.gsub(/[\\\"\x00-\x1f]/) do |char|
      replacements.fetch(char) { "\\u%04x" % char.ord }
    end
  end
end

module LramaAPI
  class << self
    # Parse .y file content and return structure
    # @param source [String] .y file content
    # @return [String] Parse result in JSON format
    def parse(source)
      begin
        # Parse with Lrama parser
        parser = Lrama::Parser.new(source, "input.y")
        grammar = parser.parse

        # Extract grammar information
        result = {
          success: true,
          grammar: extract_grammar_info(grammar, source)
        }

        SimpleJSON.generate(result)
      rescue => e
        # Extract location information from error
        location = extract_error_location(e)

        SimpleJSON.generate({
          success: false,
          errors: [{
            message: e.message,
            backtrace: e.backtrace&.first(5),
            location: location,
            severity: 'error'
          }]
        })
      end
    end

    # Validate grammar
    # @param source [String] .y file content
    # @return [String] Validation result in JSON format
    def validate(source)
      begin
        parser = Lrama::Parser.new(source, "input.y")
        grammar = parser.parse

        # Validation success
        SimpleJSON.generate({
          success: true,
          valid: true,
          errors: []
        })
      rescue => e
        # Extract location information from error
        location = extract_error_location(e)

        SimpleJSON.generate({
          success: true,
          valid: false,
          errors: [{
            message: e.message,
            backtrace: e.backtrace&.first(5),
            location: location,
            severity: 'error'
          }]
        })
      end
    end

    # Entry point called from JavaScript
    # @param method_name [String] メソッド名 ("parse" or "validate")
    # @param source [String] .y file content
    # @return [String] Result in JSON format
    def call(method_name, source)
      case method_name
      when 'parse'
        parse(source)
      when 'validate'
        validate(source)
      else
        SimpleJSON.generate({
          success: false,
          errors: [{
            message: "Unknown method: #{method_name}",
            location: { line: 0, column: 0 },
            severity: 'error'
          }]
        })
      end
    end

    private

    # Extract necessary information from Grammar object
    def extract_grammar_info(grammar, source = nil)
      # Calculate First/Follow sets and conflicts
      first_sets = {}
      follow_sets = {}
      conflicts = []
      state_transitions = []
      nullable_symbols = []
      lint = {}
      analysis_warnings = []
      expectations = {}

      begin
        # Prepare Grammar (calculate First sets, etc.)
        # This process correctly registers nterms
        grammar.prepare

        # Extract after grammar.prepare
        tokens = extract_tokens(grammar)
        nonterminals = extract_nonterminals(grammar)
        rules = extract_rules(grammar, source)
        start_sym = extract_start_symbol(grammar, source)
        nullable_symbols = extract_nullable_symbols(grammar)

        # Extract First sets (nonterminals only)
        grammar.nterms.each do |nterm|
          name = nterm.id.s_value
          # first_set is a Set of Symbols, convert to array of symbol names
          first_symbols = nterm.first_set.map { |s| s.id.s_value }.sort
          first_sets[name] = first_symbols unless first_symbols.empty?
        end

        # Build States (LALR state machine)
        states = Lrama::States.new(grammar, trace_state: false)
        states.compute
        expectations = extract_expectations(grammar, states)

        # Extract Follow sets
        states.follow_sets.each do |(state_id, nterm_token_id), terms|
          # Get nonterminal from nterm_token_id
          nterm = grammar.nterms.find { |candidate| candidate.token_id == nterm_token_id }
          next unless nterm

          name = nterm.id.s_value
          follow_symbols = terms.map { |t| t.id.s_value }.sort.uniq
          follow_sets[name] ||= []
          follow_sets[name] = (follow_sets[name] + follow_symbols).sort.uniq
        end

        # Extract conflicts and state transitions
        states.states.each do |state|
          # Shift/Reduce コンフリクト
          state.sr_conflicts.each do |conflict|
            token_names = conflict.symbols.map { |s| s.id.s_value }
            conflicts << {
              type: 'shift_reduce',
              state: state.id,
              message: "Shift/Reduce conflict in state #{state.id} on token(s): #{token_names.join(', ')}",
              tokens: token_names,
              rules: [conflict.reduce.item.rule.id],
              severity: 'warning'
            }
          end

          # Reduce/Reduce コンフリクト
          state.rr_conflicts.each do |conflict|
            token_names = conflict.symbols.map { |s| s.id.s_value }
            conflicts << {
              type: 'reduce_reduce',
              state: state.id,
              message: "Reduce/Reduce conflict in state #{state.id} on token(s): #{token_names.join(', ')}",
              tokens: token_names,
              rules: [conflict.reduce1.item.rule.id, conflict.reduce2.item.rule.id],
              severity: 'error'
            }
          end

          # Extract state transitions
          state_data = extract_state_transitions(state, grammar)
          state_transitions << state_data if state_data
        end

        lint = analyze_grammar_lint(tokens, nonterminals, rules, start_sym)
      rescue => e
        analysis_warnings << {
          phase: 'analysis',
          message: e.message
        }

        # Return basic information only if error occurs in First/Follow calculation
        begin
          grammar.prepare if !grammar.respond_to?(:nterms) || grammar.nterms.nil?
        rescue => prepare_error
          analysis_warnings << {
            phase: 'prepare',
            message: prepare_error.message
          }
        end
        tokens = extract_tokens(grammar)
        nonterminals = extract_nonterminals(grammar)
          rules = extract_rules(grammar, source)
        start_sym = extract_start_symbol(grammar, source)
      end

      # Generate syntax diagrams for each nonterminal
      syntax_diagrams = {}
      begin
        syntax_diagrams = generate_syntax_diagrams(grammar)
      rescue => e
        analysis_warnings << {
          phase: 'syntax_diagrams',
          message: e.message
        }
        syntax_diagrams = { "_error" => "Failed to generate diagrams: #{e.message}" }
      end

      {
        tokens: tokens,
        nonterminals: nonterminals,
        rules: rules,
        start_symbol: start_sym,
        metadata: extract_metadata,
        nullable_symbols: nullable_symbols,
        first_sets: first_sets,
        follow_sets: follow_sets,
        conflicts: conflicts,
        expectations: expectations,
        lint: lint,
        analysis_warnings: analysis_warnings,
        syntax_diagrams: syntax_diagrams,
        state_transitions: state_transitions
      }
    end

    def extract_metadata
      {
        lrama_version: defined?(Lrama::VERSION) ? Lrama::VERSION : nil,
        capabilities: [
          'parse',
          'validate',
          'first_sets',
          'follow_sets',
          'nullable_symbols',
          'conflicts',
          'state_transitions',
          'syntax_diagrams',
          'grammar_lint'
        ]
      }
    end

    def extract_start_symbol(grammar, source)
      directive_start = extract_start_directive(source)
      return directive_start if directive_start

      return nil unless grammar.rules.any?

      first_user_rule = grammar.rules.find { |r| r.lhs.id.s_value != "$accept" }
      first_user_rule&.lhs&.id&.s_value
    end

    def extract_start_directive(source)
      return nil unless source

      source.each_line do |line|
        next unless line =~ /^\s*%start\s+([A-Za-z_][A-Za-z0-9_]*)/

        return Regexp.last_match(1)
      end

      nil
    end

    def extract_nullable_symbols(grammar)
      return [] unless grammar.nterms

      grammar.nterms
        .select { |nterm| nterm.nullable && !nterm.id.s_value.start_with?('$') }
        .map { |nterm| nterm.id.s_value }
        .sort
    end

    def extract_expectations(grammar, states)
      expected_sr = grammar.respond_to?(:expect) ? grammar.expect : nil
      actual_sr = states.respond_to?(:sr_conflicts_count) ? states.sr_conflicts_count : nil
      actual_rr = states.respond_to?(:rr_conflicts_count) ? states.rr_conflicts_count : nil

      {
        shift_reduce: {
          expected: expected_sr,
          actual: actual_sr,
          satisfied: expected_sr.nil? ? nil : expected_sr == actual_sr
        },
        reduce_reduce: {
          expected: 0,
          actual: actual_rr,
          satisfied: actual_rr.nil? ? nil : actual_rr == 0
        }
      }
    end

    def internal_symbol_name?(name)
      name.start_with?('$') || name.start_with?('YY')
    end

    def analyze_grammar_lint(tokens, nonterminals, rules, start_sym)
      token_names = tokens.map { |token| token[:name] }.reject { |name| internal_symbol_name?(name) }
      declared_nonterminals = nonterminals.map { |nterm| nterm[:name] }.to_set
      lhs_names = rules.map { |rule| rule[:lhs] }.reject { |name| internal_symbol_name?(name) }.to_set
      rhs_symbols = rules.flat_map { |rule| rule[:rhs].map { |sym| sym[:symbol] } }.reject { |name| internal_symbol_name?(name) }
      rhs_token_names = rules.flat_map { |rule|
        rule[:rhs].select { |sym| sym[:type] == 'terminal' }.map { |sym| sym[:symbol] }
      }.reject { |name| internal_symbol_name?(name) }.to_set
      rhs_nonterm_names = rules.flat_map { |rule|
        rule[:rhs].select { |sym| sym[:type] == 'nonterminal' }.map { |sym| sym[:symbol] }
      }.reject { |name| internal_symbol_name?(name) }.to_set

      undefined_symbols = rhs_symbols
        .reject { |name| token_names.include?(name) || lhs_names.include?(name) || name == 'error' }
        .uniq
        .sort

      unused_tokens = (token_names - rhs_token_names.to_a - ['error']).sort
      reachable_nonterminals = compute_reachable_nonterminals(rules, start_sym)
      unreachable_nonterminals = (lhs_names.to_a - reachable_nonterminals.to_a).sort
      unused_rules = rules
        .select { |rule| !rule[:lhs].start_with?('$') && !reachable_nonterminals.include?(rule[:lhs]) }
        .map { |rule| rule[:id] }
      non_productive_nonterminals = compute_non_productive_nonterminals(rules, token_names.to_set)

      {
        undefined_symbols: undefined_symbols,
        unused_tokens: unused_tokens,
        unreachable_nonterminals: unreachable_nonterminals,
        unused_rules: unused_rules,
        non_productive_nonterminals: non_productive_nonterminals.sort,
        referenced_nonterminals_without_rules: rhs_nonterm_names.reject { |name| lhs_names.include?(name) }.sort,
        declared_nonterminals_without_rules: declared_nonterminals.reject { |name| lhs_names.include?(name) }.sort
      }
    end

    def compute_reachable_nonterminals(rules, start_sym)
      reachable = Set.new
      return reachable unless start_sym

      rules_by_lhs = rules.group_by { |rule| rule[:lhs] }
      queue = [start_sym]

      until queue.empty?
        lhs = queue.shift
        next if reachable.include?(lhs)

        reachable.add(lhs)
        rules_by_lhs.fetch(lhs, []).each do |rule|
          rule[:rhs].each do |symbol|
            next unless symbol[:type] == 'nonterminal'
            next if symbol[:symbol].start_with?('$')
            next if reachable.include?(symbol[:symbol])

            queue << symbol[:symbol]
          end
        end
      end

      reachable
    end

    def compute_non_productive_nonterminals(rules, token_names)
      lhs_names = rules.map { |rule| rule[:lhs] }.reject { |name| internal_symbol_name?(name) }.to_set
      productive = Set.new

      loop do
        changed = false

        rules.each do |rule|
          lhs = rule[:lhs]
          next if lhs.start_with?('$') || productive.include?(lhs)

          derives_terminal_string = rule[:rhs].all? do |symbol|
            symbol[:type] == 'terminal' || productive.include?(symbol[:symbol]) || token_names.include?(symbol[:symbol])
          end

          if derives_terminal_string
            productive.add(lhs)
            changed = true
          end
        end

        break unless changed
      end

      lhs_names.reject { |name| productive.include?(name) }
    end

    def extract_location(location)
      return nil unless location

      {
        line: location.first_line,
        column: location.first_column + 1,
        end_line: location.last_line,
        end_column: location.last_column + 1
      }
    end

    def extract_symbol_location(symbol)
      extract_location(symbol.id.location) if symbol&.id&.respond_to?(:location)
    end

    def extract_tokens(grammar)
      return [] unless grammar.terms

      grammar.terms.map do |term|
        {
          name: term.id.s_value,
          alias: term.alias_name,
          display_name: term.display_name,
          type: term.tag&.name,
          token_id: term.token_id,
          location: extract_symbol_location(term)
        }
      end
    end

    def extract_nonterminals(grammar)
      return [] unless grammar.nterms

      # Exclude internal symbols ($accept, $end, etc.)
      grammar.nterms.reject { |nterm|
        nterm.id.s_value.start_with?('$')
      }.map do |nterm|
        {
          name: nterm.id.s_value,
          type: nterm.tag&.name,
          location: extract_symbol_location(nterm)
        }
      end
    end

    def extract_rules(grammar, source = nil)
      return [] unless grammar.rules

      source_lines = source ? source.lines : []
      grammar.rules.map do |rule|
        {
          id: rule.id,
          lhs: rule.lhs.id.s_value,
          rhs: extract_rhs(rule),
          line_number: rule.lineno,
          location: extract_location(rule.lhs.id.location),
          explicit_empty: explicit_empty_rule?(rule, source_lines),
          action: extract_rule_action(rule)
        }
      end
    end

    def extract_rhs(rule)
      return [] unless rule.rhs

      rhs_tokens = rule.respond_to?(:_rhs) ? rule._rhs : []
      rule.rhs.each_with_index.map do |symbol, index|
        {
          symbol: symbol.id.s_value,
          type: symbol.term? ? 'terminal' : 'nonterminal',
          display_name: symbol.display_name,
          location: extract_location(rhs_tokens[index]&.location)
        }
      end
    end

    def explicit_empty_rule?(rule, source_lines)
      return false unless rule.rhs.empty?
      line = source_lines[rule.lineno - 1]
      line&.include?('%empty') || false
    end

    def extract_rule_action(rule)
      token_code = rule.respond_to?(:token_code) ? rule.token_code : nil
      return nil unless token_code

      code = if token_code.respond_to?(:s_value)
        token_code.s_value
      elsif token_code.respond_to?(:code)
        token_code.code
      else
        token_code.to_s
      end

      {
        present: !code.to_s.empty?,
        preview: code.to_s.lines.first&.strip
      }
    end

    # Generate syntax diagrams for all nonterminals
    def generate_syntax_diagrams(grammar)
      diagrams = {}

      # Group rules by LHS (nonterminal)
      rules_by_lhs = grammar.rules.group_by { |rule| rule.lhs.id.s_value }

      # Skip internal symbols like $accept
      rules_by_lhs.each do |lhs, rules|
        next if lhs.start_with?('$')

        begin
          # Create diagram for this nonterminal
          diagram = create_diagram_for_nonterminal(lhs, rules, grammar)
          if diagram
            # Generate standalone SVG with embedded styles (css = true enables default styles)
            output = []
            diagram.write_standalone(->(str) { output << str }, true)
            # Minify SVG by removing newlines and extra spaces
            svg = output.join.gsub(/>\s+</, '><').gsub(/\n/, ' ').strip
            diagrams[lhs] = svg
          end
        rescue => e
          # Skip if diagram generation fails for this rule
        end
      end

      diagrams
    end

    # Create a railroad diagram for a nonterminal
    def create_diagram_for_nonterminal(lhs, rules, grammar)
      # If there's only one rule, create a simple sequence
      if rules.size == 1
        rule = rules.first
        elements = create_elements_from_rhs(rule.rhs, grammar)
        return RailroadDiagrams::Diagram.new(*elements)
      end

      # If there are multiple rules, create a choice
      choices = rules.map do |rule|
        elements = create_elements_from_rhs(rule.rhs, grammar)
        if elements.empty?
          RailroadDiagrams::Skip.new
        elsif elements.size == 1
          elements.first
        else
          RailroadDiagrams::Sequence.new(*elements)
        end
      end

      # Default choice index (0 = first option is default)
      RailroadDiagrams::Diagram.new(
        RailroadDiagrams::Choice.new(0, *choices)
      )
    end

    # Create railroad diagram elements from RHS symbols
    def create_elements_from_rhs(rhs, grammar)
      return [] if rhs.nil? || rhs.empty?

      rhs.map do |symbol|
        sym_name = symbol.id.s_value

        # Skip internal symbols
        next nil if sym_name.start_with?('$')

        if symbol.term?
          # Terminal symbol
          RailroadDiagrams::Terminal.new(sym_name)
        else
          # Nonterminal symbol
          RailroadDiagrams::NonTerminal.new(sym_name)
        end
      end.compact
    end

    # Extract state transition data
    def extract_state_transitions(state, grammar)
      shifts = []
      reduces = []
      gotos = []
      conflicts = []

      # Extract Shift transitions
      state.term_transitions.each do |shift, next_state|
        shifts << {
          symbol: shift.next_sym.id.s_value,
          to_state: next_state.id
        }
      end if state.respond_to?(:term_transitions) && state.term_transitions

      # Extract Goto transitions (nonterminal transitions)
      state.nterm_transitions.each do |shift, next_state|
        gotos << {
          symbol: shift.next_sym.id.s_value,
          to_state: next_state.id
        }
      end if state.respond_to?(:nterm_transitions) && state.nterm_transitions

      # Extract Reduce actions
      state.reduces.each do |reduce_action|
        lookaheads = reduce_action.selected_look_ahead
        lookaheads = [nil] if lookaheads.empty?
        lookaheads.each do |sym|
          reduces << {
            symbol: sym ? sym.id.s_value : '$default',
            rule_id: reduce_action.item.rule.id
          }
        end
      end if state.respond_to?(:reduces) && state.reduces

      # Extract state items
      items = []
      state.items.each do |item|
        items << {
          rule_id: item.rule.id,
          position: item.position,
          display: format_item(item)
        }
      end if state.respond_to?(:items) && state.items

      if state.respond_to?(:sr_conflicts) && state.sr_conflicts
        state.sr_conflicts.each do |conflict|
          conflicts << {
            type: 'shift_reduce',
            severity: 'warning',
            tokens: conflict.symbols.map { |s| s.id.s_value }
          }
        end
      end

      if state.respond_to?(:rr_conflicts) && state.rr_conflicts
        state.rr_conflicts.each do |conflict|
          conflicts << {
            type: 'reduce_reduce',
            severity: 'error',
            tokens: conflict.symbols.map { |s| s.id.s_value }
          }
        end
      end

      {
        id: state.id,
        items: items,
        shifts: shifts,
        gotos: gotos,
        reduces: reduces,
        conflicts: conflicts
      }
    rescue => e
      # Return basic information only if error occurs
      {
        id: state.id,
        items: [],
        shifts: [],
        gotos: [],
        reduces: [],
        conflicts: [],
        error: e.message
      }
    end

    # Format item for display
    def format_item(item)
      lhs = item.rule.lhs.id.s_value
      rhs = item.rule.rhs.map { |s| s.id.s_value }

      # Insert dot position
      rhs_with_dot = rhs.dup
      rhs_with_dot.insert(item.position, '•')

      "#{lhs} → #{rhs_with_dot.join(' ')}"
    end

    # Extract location information from error
    def extract_error_location(error)
      # Try to extract line number from Lrama error message
      # 例: "input.y:5:10: unexpected token"
      if error.message =~ /input\.y:(\d+):(\d+):/
        return { line: $1.to_i, column: $2.to_i }
      end

      # Look for "line X" pattern in error message
      if error.message =~ /line\s+(\d+)/i
        return { line: $1.to_i, column: 0 }
      end

      # Extract information from backtrace
      if error.backtrace && error.backtrace.any?
        first_trace = error.backtrace.first
        if first_trace =~ /:(\d+):/
          return { line: $1.to_i, column: 0 }
        end
      end

      # Default location if none found
      { line: 0, column: 0 }
    end
  end
end

# Expose globally to be called from JavaScript
# Note: JS gem might not be available in Wasm build
# We'll expose this from the JavaScript bridge instead
# JS.global[:LramaAPI] = LramaAPI if defined?(JS)
