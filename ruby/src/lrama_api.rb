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
    str.gsub('\\', '\\\\\\\\')
       .gsub('"', '\\"')
       .gsub("\n", '\\n')
       .gsub("\r", '\\r')
       .gsub("\t", '\\t')
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
          grammar: extract_grammar_info(grammar)
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
    def extract_grammar_info(grammar)
      # Calculate First/Follow sets and conflicts
      first_sets = {}
      follow_sets = {}
      conflicts = []
      state_transitions = []

      begin
        # Prepare Grammar (calculate First sets, etc.)
        # This process correctly registers nterms
        grammar.prepare
        grammar.compute_nullable
        grammar.compute_first_set

        # Extract after grammar.prepare
        tokens = extract_tokens(grammar)
        nonterminals = extract_nonterminals(grammar)
        rules = extract_rules(grammar)

        # The start symbol is the LHS of the first user rule
        # (the accept symbol's first RHS element, or first non-augmented rule)
        start_sym = if grammar.rules.any?
          # Find the first rule that's not the $accept rule
          first_user_rule = grammar.rules.find { |r| r.lhs.id.s_value != "$accept" }
          first_user_rule&.lhs&.id&.s_value
        else
          nil
        end

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

        # Extract Follow sets
        states.follow_sets.each do |(state_id, nterm_token_id), terms|
          # Get nonterminal from nterm_token_id
          nterm = grammar.find_symbol_by_token_id(nterm_token_id)
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
      rescue => e
        # Return basic information only if error occurs in First/Follow calculation
        grammar.prepare if !grammar.respond_to?(:nterms) || grammar.nterms.nil?
        tokens = extract_tokens(grammar)
        nonterminals = extract_nonterminals(grammar)
        rules = extract_rules(grammar)

        start_sym = if grammar.rules.any?
          first_user_rule = grammar.rules.find { |r| r.lhs.id.s_value != "$accept" }
          first_user_rule&.lhs&.id&.s_value
        else
          nil
        end
      end

      # Generate syntax diagrams for each nonterminal
      syntax_diagrams = {}
      begin
        syntax_diagrams = generate_syntax_diagrams(grammar)
      rescue => e
        # If diagram generation fails, log the error
        syntax_diagrams = { "_error" => "Failed to generate diagrams: #{e.message}" }
      end

      {
        tokens: tokens,
        nonterminals: nonterminals,
        rules: rules,
        start_symbol: start_sym,
        first_sets: first_sets,
        follow_sets: follow_sets,
        conflicts: conflicts,
        syntax_diagrams: syntax_diagrams,
        state_transitions: state_transitions
      }
    end

    def extract_tokens(grammar)
      return [] unless grammar.terms

      grammar.terms.map do |term|
        {
          name: term.id.s_value,
          type: term.tag&.name,
          token_id: term.token_id
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
          type: nterm.tag&.name
        }
      end
    end

    def extract_rules(grammar)
      return [] unless grammar.rules

      grammar.rules.map do |rule|
        {
          id: rule.id,
          lhs: rule.lhs.id.s_value,
          rhs: extract_rhs(rule),
          line_number: rule.lineno
        }
      end
    end

    def extract_rhs(rule)
      return [] unless rule.rhs

      rule.rhs.map do |symbol|
        {
          symbol: symbol.id.s_value,
          type: symbol.term? ? 'terminal' : 'nonterminal'
        }
      end
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

      # Extract Shift transitions
      state.shifts.each do |sym, next_state_id|
        shifts << {
          symbol: sym.id.s_value,
          to_state: next_state_id
        }
      end if state.respond_to?(:shifts) && state.shifts

      # Extract Goto transitions (nonterminal transitions)
      state.gotos.each do |sym, next_state_id|
        gotos << {
          symbol: sym.id.s_value,
          to_state: next_state_id
        }
      end if state.respond_to?(:gotos) && state.gotos

      # Extract Reduce actions
      state.reduces.each do |sym, reduce_action|
        reduces << {
          symbol: sym.id.s_value,
          rule_id: reduce_action.item.rule.id
        }
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

      {
        id: state.id,
        items: items,
        shifts: shifts,
        gotos: gotos,
        reduces: reduces
      }
    rescue => e
      # Return basic information only if error occurs
      {
        id: state.id,
        items: [],
        shifts: [],
        gotos: [],
        reduces: [],
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
