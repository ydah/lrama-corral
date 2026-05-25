# frozen_string_literal: true

# Lrama Bundle - Auto-generated on 2025-12-24 13:03:10 +0900
# Source: Lrama gem version 0.7.0
# https://github.com/ruby/lrama
#
# This file contains the entire Lrama codebase bundled into a single file
# for use with Ruby Wasm in the browser.

# === Minimal stdlib implementations for Wasm ===

# Remove autoloaded stdlib constants before defining our own implementations
# Ruby Wasm may have set up autoload for Set, Forwardable, etc.
Object.send(:remove_const, :Set) if Object.const_defined?(:Set, false)
Object.send(:remove_const, :Forwardable) if Object.const_defined?(:Forwardable, false)
Object.send(:remove_const, :ERB) if Object.const_defined?(:ERB, false)

# ERB class (minimal implementation for Lrama templates)
class ERB
  def initialize(template, safe_level = nil, trim_mode = nil, eoutvar = '_erbout')
    @template = template
    @trim_mode = trim_mode
  end

  def result(b = TOPLEVEL_BINDING)
    # Simple ERB processing: evaluate embedded Ruby code
    output = @template.dup
    
    # Process <%= %> tags (output)
    output.gsub!(/<%= (.+?) %>/m) do
      eval($1, b).to_s
    end
    
    # Process <% %> tags (code)
    output.gsub!(/<% (.+?) %>/m) do
      eval($1, b)
      ''
    end
    
    output
  end
end

# Forwardable module
module Forwardable
  def def_delegators(accessor, *methods)
    methods.each do |method|
      define_method(method) do |*args, **kwargs, &block|
        # Handle both instance variable (@var) and method (var) accessors
        target = if accessor.to_s.start_with?('@')
                   instance_variable_get(accessor)
                 else
                   send(accessor)
                 end
        target.send(method, *args, **kwargs, &block)
      end
    end
  end

  def def_delegator(accessor, method, ali = method)
    define_method(ali) do |*args, **kwargs, &block|
      # Handle both instance variable (@var) and method (var) accessors
      target = if accessor.to_s.start_with?('@')
                 instance_variable_get(accessor)
               else
                 send(accessor)
               end
      target.send(method, *args, **kwargs, &block)
    end
  end
end

# Set class
class Set
  include Enumerable

  def initialize(enum = nil)
    @hash = {}
    enum.each { |o| add(o) } if enum
  end

  def add(o)
    @hash[o] = true
    self
  end
  alias << add

  def delete(o)
    @hash.delete(o)
    self
  end

  def include?(o)
    @hash.key?(o)
  end

  def each(&block)
    @hash.each_key(&block)
  end

  def size
    @hash.size
  end
  alias length size

  def empty?
    @hash.empty?
  end

  def to_a
    @hash.keys
  end

  def merge(other)
    dup.merge!(other)
  end

  def merge!(other)
    other.each { |o| add(o) }
    self
  end
end


# === BEGIN: lrama.rb ===


# require_relative "lrama/bitmap"

# === BEGIN: lrama/bitmap.rb ===

# rbs_inline: enabled

module Lrama
  module Bitmap
    # @rbs (Array[Integer] ary) -> Integer
    def self.from_array(ary)
      bit = 0

      ary.each do |int|
        bit |= (1 << int)
      end

      bit
    end

    # @rbs (Integer int) -> Array[Integer]
    def self.to_array(int)
      a = [] #: Array[Integer]
      i = 0

      while int > 0 do
        if int & 1 == 1
          a << i
        end

        i += 1
        int >>= 1
      end

      a
    end
  end
end

# === END: lrama/bitmap.rb ===
# require_relative "lrama/command"

# === BEGIN: lrama/command.rb ===


module Lrama
  class Command
    LRAMA_LIB = File.realpath(File.join(File.dirname(__FILE__)))
    STDLIB_FILE_PATH = File.join(LRAMA_LIB, 'grammar', 'stdlib.y')

    def run(argv)
      begin
        options = OptionParser.new.parse(argv)
      rescue => e
        message = e.message
        message = message.gsub(/.+/, "\e[1m\\&\e[m") if Exception.to_tty?
        abort message
      end

      Report::Duration.enable if options.trace_opts[:time]

      text = options.y.read
      options.y.close if options.y != STDIN
      begin
        grammar = Lrama::Parser.new(text, options.grammar_file, options.debug, options.define).parse
        unless grammar.no_stdlib
          stdlib_grammar = Lrama::Parser.new(File.read(STDLIB_FILE_PATH), STDLIB_FILE_PATH, options.debug).parse
          grammar.insert_before_parameterizing_rules(stdlib_grammar.parameterizing_rules)
        end
        grammar.prepare
        grammar.validate!
      rescue => e
        raise e if options.debug
        message = e.message
        message = message.gsub(/.+/, "\e[1m\\&\e[m") if Exception.to_tty?
        abort message
      end
      states = Lrama::States.new(grammar, trace_state: (options.trace_opts[:automaton] || options.trace_opts[:closure]))
      states.compute
      states.compute_ielr if grammar.ielr_defined?
      context = Lrama::Context.new(states)

      if options.report_file
        reporter = Lrama::StatesReporter.new(states)
        File.open(options.report_file, "w+") do |f|
          reporter.report(f, **options.report_opts)
        end
      end

      reporter = Lrama::TraceReporter.new(grammar)
      reporter.report(**options.trace_opts)

      File.open(options.outfile, "w+") do |f|
        Lrama::Output.new(
          out: f,
          output_file_path: options.outfile,
          template_name: options.skeleton,
          grammar_file_path: options.grammar_file,
          header_file_path: options.header_file,
          context: context,
          grammar: grammar,
          error_recovery: options.error_recovery,
        ).render
      end

      logger = Lrama::Logger.new
      exit false unless Lrama::GrammarValidator.new(grammar, states, logger).valid?
      Lrama::Diagnostics.new(grammar, states, logger).run(options.diagnostic)
    end
  end
end

# === END: lrama/command.rb ===
# require_relative "lrama/context"

# === BEGIN: lrama/context.rb ===


# require_relative "report/duration"

# === BEGIN: lrama/report/duration.rb ===


module Lrama
  class Report
    module Duration
      def self.enable
        @_report_duration_enabled = true
      end

      def self.enabled?
        !!@_report_duration_enabled
      end

      def report_duration(method_name)
        time1 = Time.now.to_f
        result = yield
        time2 = Time.now.to_f

        if Duration.enabled?
          puts sprintf("%s %10.5f s", method_name, time2 - time1)
        end

        return result
      end
    end
  end
end

# === END: lrama/report/duration.rb ===

module Lrama
  # This is passed to a template
  class Context
    include Report::Duration

    ErrorActionNumber = -Float::INFINITY
    BaseMin = -Float::INFINITY

    # TODO: It might be better to pass `states` to Output directly?
    attr_reader :states, :yylast, :yypact_ninf, :yytable_ninf, :yydefact, :yydefgoto

    def initialize(states)
      @states = states
      @yydefact = nil
      @yydefgoto = nil
      # Array of array
      @_actions = []

      compute_tables
    end

    # enum yytokentype
    def yytokentype
      @states.terms.reject do |term|
        0 < term.token_id && term.token_id < 128
      end.map do |term|
        [term.id.s_value, term.token_id, term.display_name]
      end.unshift(["YYEMPTY", -2, nil])
    end

    # enum yysymbol_kind_t
    def yysymbol_kind_t
      @states.symbols.map do |sym|
        [sym.enum_name, sym.number, sym.comment]
      end.unshift(["YYSYMBOL_YYEMPTY", -2, nil])
    end

    # State number of final (accepted) state
    def yyfinal
      @states.states.find do |state|
        state.items.find do |item|
          item.lhs.accept_symbol? && item.end_of_rule?
        end
      end.id
    end

    # Number of terms
    def yyntokens
      @states.terms.count
    end

    # Number of nterms
    def yynnts
      @states.nterms.count
    end

    # Number of rules
    def yynrules
      @states.rules.count
    end

    # Number of states
    def yynstates
      @states.states.count
    end

    # Last token number
    def yymaxutok
      @states.terms.map(&:token_id).max
    end

    # YYTRANSLATE
    #
    # yytranslate is a mapping from token id to symbol number
    def yytranslate
      # 2 is YYSYMBOL_YYUNDEF
      a = Array.new(yymaxutok, 2)

      @states.terms.each do |term|
        a[term.token_id] = term.number
      end

      return a
    end

    def yytranslate_inverted
      a = Array.new(@states.symbols.count, @states.undef_symbol.token_id)

      @states.terms.each do |term|
        a[term.number] = term.token_id
      end

      return a
    end

    # Mapping from rule number to line number of the rule is defined.
    # Dummy rule is appended as the first element whose value is 0
    # because 0 means error in yydefact.
    def yyrline
      a = [0]

      @states.rules.each do |rule|
        a << rule.lineno
      end

      return a
    end

    # Mapping from symbol number to its name
    def yytname
      @states.symbols.sort_by(&:number).map do |sym|
        sym.display_name
      end
    end

    def yypact
      @base[0...yynstates]
    end

    def yypgoto
      @base[yynstates..-1]
    end

    def yytable
      @table
    end

    def yycheck
      @check
    end

    def yystos
      @states.states.map do |state|
        state.accessing_symbol.number
      end
    end

    # Mapping from rule number to symbol number of LHS.
    # Dummy rule is appended as the first element whose value is 0
    # because 0 means error in yydefact.
    def yyr1
      a = [0]

      @states.rules.each do |rule|
        a << rule.lhs.number
      end

      return a
    end

    # Mapping from rule number to length of RHS.
    # Dummy rule is appended as the first element whose value is 0
    # because 0 means error in yydefact.
    def yyr2
      a = [0]

      @states.rules.each do |rule|
        a << rule.rhs.count
      end

      return a
    end

    private

    # Compute these
    #
    # See also: "src/tables.c" of Bison.
    #
    # * yydefact
    # * yydefgoto
    # * yypact and yypgoto
    # * yytable
    # * yycheck
    # * yypact_ninf
    # * yytable_ninf
    def compute_tables
      report_duration(:compute_yydefact) { compute_yydefact }
      report_duration(:compute_yydefgoto) { compute_yydefgoto }
      report_duration(:sort_actions) { sort_actions }
      # debug_sorted_actions
      report_duration(:compute_packed_table) { compute_packed_table }
    end

    def vectors_count
      @states.states.count + @states.nterms.count
    end

    # In compressed table, rule 0 is appended as an error case
    # and reduce is represented as minus number.
    def rule_id_to_action_number(rule_id)
      (rule_id + 1) * -1
    end

    # Symbol number is assigned to term first then nterm.
    # This method calculates sequence_number for nterm.
    def nterm_number_to_sequence_number(nterm_number)
      nterm_number - @states.terms.count
    end

    # Vector is states + nterms
    def nterm_number_to_vector_number(nterm_number)
      @states.states.count + (nterm_number - @states.terms.count)
    end

    def compute_yydefact
      # Default action (shift/reduce/error) for each state.
      # Index is state id, value is `rule id + 1` of a default reduction.
      @yydefact = Array.new(@states.states.count, 0)

      @states.states.each do |state|
        # Action number means
        #
        # * number = 0, default action
        # * number = -Float::INFINITY, error by %nonassoc
        # * number > 0, shift then move to state "number"
        # * number < 0, reduce by "-number" rule. Rule "number" is already added by 1.
        actions = Array.new(@states.terms.count, 0)

        if state.reduces.map(&:selected_look_ahead).any? {|la| !la.empty? }
          # Iterate reduces with reverse order so that first rule is used.
          state.reduces.reverse_each do |reduce|
            reduce.look_ahead.each do |term|
              actions[term.number] = rule_id_to_action_number(reduce.rule.id)
            end
          end
        end

        # Shift is selected when S/R conflict exists.
        state.selected_term_transitions.each do |shift, next_state|
          actions[shift.next_sym.number] = next_state.id
        end

        state.resolved_conflicts.select do |conflict|
          conflict.which == :error
        end.each do |conflict|
          actions[conflict.symbol.number] = ErrorActionNumber
        end

        # If default_reduction_rule, replace default_reduction_rule in
        # actions with zero.
        if state.default_reduction_rule
          actions.map! do |e|
            if e == rule_id_to_action_number(state.default_reduction_rule.id)
              0
            else
              e
            end
          end
        end

        # If no default_reduction_rule, default behavior is an
        # error then replace ErrorActionNumber with zero.
        unless state.default_reduction_rule
          actions.map! do |e|
            if e == ErrorActionNumber
              0
            else
              e
            end
          end
        end

        s = actions.each_with_index.map do |n, i|
          [i, n]
        end.reject do |i, n|
          # Remove default_reduction_rule entries
          n == 0
        end

        if s.count != 0
          # Entry of @_actions is an array of
          #
          # * State id
          # * Array of tuple, [from, to] where from is term number and to is action.
          # * The number of "Array of tuple" used by sort_actions
          # * "width" used by sort_actions
          @_actions << [state.id, s, s.count, s.last[0] - s.first[0] + 1]
        end

        @yydefact[state.id] = state.default_reduction_rule ? state.default_reduction_rule.id + 1 : 0
      end
    end

    def compute_yydefgoto
      # Default GOTO (nterm transition) for each nterm.
      # Index is sequence number of nterm, value is state id
      # of a default nterm transition destination.
      @yydefgoto = Array.new(@states.nterms.count, 0)
      # Mapping from nterm to next_states
      nterm_to_next_states = {}

      @states.states.each do |state|
        state.nterm_transitions.each do |shift, next_state|
          key = shift.next_sym
          nterm_to_next_states[key] ||= []
          nterm_to_next_states[key] << [state, next_state] # [from_state, to_state]
        end
      end

      @states.nterms.each do |nterm|
        if (states = nterm_to_next_states[nterm])
          default_state = states.map(&:last).group_by {|s| s }.max_by {|_, v| v.count }.first
          default_goto = default_state.id
          not_default_gotos = []
          states.each do |from_state, to_state|
            next if to_state.id == default_goto
            not_default_gotos << [from_state.id, to_state.id]
          end
        else
          default_goto = 0
          not_default_gotos = []
        end

        k = nterm_number_to_sequence_number(nterm.number)
        @yydefgoto[k] = default_goto

        if not_default_gotos.count != 0
          v = nterm_number_to_vector_number(nterm.number)

          # Entry of @_actions is an array of
          #
          # * Nterm number as vector number
          # * Array of tuple, [from, to] where from is state number and to is state number.
          # * The number of "Array of tuple" used by sort_actions
          # * "width" used by sort_actions
          @_actions << [v, not_default_gotos, not_default_gotos.count, not_default_gotos.last[0] - not_default_gotos.first[0] + 1]
        end
      end
    end

    def sort_actions
      # This is not same with #sort_actions
      #
      # @sorted_actions = @_actions.sort_by do |_, _, count, width|
      #   [-width, -count]
      # end

      @sorted_actions = []

      @_actions.each do |action|
        if @sorted_actions.empty?
          @sorted_actions << action
          next
        end

        j = @sorted_actions.count - 1
        _state_id, _froms_and_tos, count, width = action

        while (j >= 0) do
          case
          when @sorted_actions[j][3] < width
            j -= 1
          when @sorted_actions[j][3] == width && @sorted_actions[j][2] < count
            j -= 1
          else
            break
          end
        end

        @sorted_actions.insert(j + 1, action)
      end
    end

    def debug_sorted_actions
      ary = Array.new
      @sorted_actions.each do |state_id, froms_and_tos, count, width|
        ary[state_id] = [state_id, froms_and_tos, count, width]
      end

      print sprintf("table_print:\n\n")

      print sprintf("order [\n")
      vectors_count.times do |i|
        print sprintf("%d, ", @sorted_actions[i] ? @sorted_actions[i][0] : 0)
        print "\n" if i % 10 == 9
      end
      print sprintf("]\n\n")

      print sprintf("width [\n")
      vectors_count.times do |i|
        print sprintf("%d, ", ary[i] ? ary[i][3] : 0)
        print "\n" if i % 10 == 9
      end
      print sprintf("]\n\n")

      print sprintf("tally [\n")
      vectors_count.times do |i|
        print sprintf("%d, ", ary[i] ? ary[i][2] : 0)
        print "\n" if i % 10 == 9
      end
      print sprintf("]\n\n")
    end

    def compute_packed_table
      # yypact and yypgoto
      @base = Array.new(vectors_count, BaseMin)
      # yytable
      @table = []
      # yycheck
      @check = []
      # Key is froms_and_tos, value is index position
      pushed = {}
      used_res = {}
      lowzero = 0
      high = 0

      @sorted_actions.each do |state_id, froms_and_tos, _, _|
        if (res = pushed[froms_and_tos])
          @base[state_id] = res
          next
        end

        res = lowzero - froms_and_tos.first[0]

        while true do
          ok = true

          froms_and_tos.each do |from, to|
            loc = res + from

            if @table[loc]
              # If the cell of table is set, can not use the cell.
              ok = false
              break
            end
          end

          if ok && used_res[res]
            ok = false
          end

          if ok
            break
          else
            res += 1
          end
        end

        loc = 0

        froms_and_tos.each do |from, to|
          loc = res + from

          @table[loc] = to
          @check[loc] = from
        end

        while (@table[lowzero]) do
          lowzero += 1
        end

        high = loc if high < loc

        @base[state_id] = res
        pushed[froms_and_tos] = res
        used_res[res] = true
      end

      @yylast = high

      # replace_ninf
      @yypact_ninf = (@base.reject {|i| i == BaseMin } + [0]).min - 1
      @base.map! do |i|
        case i
        when BaseMin
          @yypact_ninf
        else
          i
        end
      end

      @yytable_ninf = (@table.compact.reject {|i| i == ErrorActionNumber } + [0]).min - 1
      @table.map! do |i|
        case i
        when nil
          0
        when ErrorActionNumber
          @yytable_ninf
        else
          i
        end
      end

      @check.map! do |i|
        case i
        when nil
          -1
        else
          i
        end
      end
    end
  end
end

# === END: lrama/context.rb ===
# require_relative "lrama/counterexamples"

# === BEGIN: lrama/counterexamples.rb ===


# require "set" # Commented out for Wasm compatibility

# require_relative "counterexamples/derivation"

# === BEGIN: lrama/counterexamples/derivation.rb ===


module Lrama
  class Counterexamples
    class Derivation
      attr_reader :item, :left, :right
      attr_writer :right

      def initialize(item, left, right = nil)
        @item = item
        @left = left
        @right = right
      end

      def to_s
        "#<Derivation(#{item.display_name})>"
      end
      alias :inspect :to_s

      def render_strings_for_report
        result = [] #: Array[String]
        _render_for_report(self, 0, result, 0)
        result.map(&:rstrip)
      end

      def render_for_report
        render_strings_for_report.join("\n")
      end

      private

      def _render_for_report(derivation, offset, strings, index)
        item = derivation.item
        if strings[index]
          strings[index] << " " * (offset - strings[index].length)
        else
          strings[index] = " " * offset
        end
        str = strings[index]
        str << "#{item.rule_id}: #{item.symbols_before_dot.map(&:display_name).join(" ")} "

        if derivation.left
          len = str.length
          str << "#{item.next_sym.display_name}"
          length = _render_for_report(derivation.left, len, strings, index + 1)
          # I want String#ljust!
          str << " " * (length - str.length) if length > str.length
        else
          str << " • #{item.symbols_after_dot.map(&:display_name).join(" ")} "
          return str.length
        end

        if derivation.right&.left
          left = derivation.right&.left #: Derivation
          length = _render_for_report(left, str.length, strings, index + 1)
          str << "#{item.symbols_after_dot[1..-1].map(&:display_name).join(" ")} " # steep:ignore
          str << " " * (length - str.length) if length > str.length
        elsif item.next_next_sym
          str << "#{item.symbols_after_dot[1..-1].map(&:display_name).join(" ")} " # steep:ignore
        end

        return str.length
      end
    end
  end
end

# === END: lrama/counterexamples/derivation.rb ===
# require_relative "counterexamples/example"

# === BEGIN: lrama/counterexamples/example.rb ===


module Lrama
  class Counterexamples
    class Example
      attr_reader :path1, :path2, :conflict, :conflict_symbol

      # path1 is shift conflict when S/R conflict
      # path2 is always reduce conflict
      def initialize(path1, path2, conflict, conflict_symbol, counterexamples)
        @path1 = path1
        @path2 = path2
        @conflict = conflict
        @conflict_symbol = conflict_symbol
        @counterexamples = counterexamples
      end

      def type
        @conflict.type
      end

      def path1_item
        @path1.last.to.item
      end

      def path2_item
        @path2.last.to.item
      end

      def derivations1
        @derivations1 ||= _derivations(path1)
      end

      def derivations2
        @derivations2 ||= _derivations(path2)
      end

      private

      def _derivations(paths)
        derivation = nil #: Derivation
        current = :production
        last_path = paths.last #: Path
        lookahead_sym = last_path.to.item.end_of_rule? ? @conflict_symbol : nil

        paths.reverse_each do |path|
          item = path.to.item

          case current
          when :production
            case path
            when StartPath
              derivation = Derivation.new(item, derivation)
              current = :start
            when TransitionPath
              derivation = Derivation.new(item, derivation)
              current = :transition
            when ProductionPath
              derivation = Derivation.new(item, derivation)
              current = :production
            else
              raise "Unexpected. #{path}"
            end

            if lookahead_sym && item.next_next_sym && item.next_next_sym.first_set.include?(lookahead_sym)
              state_item = @counterexamples.transitions[[path.to, item.next_sym]]
              derivation2 = find_derivation_for_symbol(state_item, lookahead_sym)
              derivation.right = derivation2 # steep:ignore
              lookahead_sym = nil
            end

          when :transition
            case path
            when StartPath
              derivation = Derivation.new(item, derivation)
              current = :start
            when TransitionPath
              # ignore
              current = :transition
            when ProductionPath
              # ignore
              current = :production
            end
          else
            raise "BUG: Unknown #{current}"
          end

          break if current == :start
        end

        derivation
      end

      def find_derivation_for_symbol(state_item, sym)
        queue = [] #: Array[Array[StateItem]]
        queue << [state_item]

        while (sis = queue.shift)
          si = sis.last
          next_sym = si.item.next_sym

          if next_sym == sym
            derivation = nil

            sis.reverse_each do |si|
              derivation = Derivation.new(si.item, derivation)
            end

            return derivation
          end

          if next_sym.nterm? && next_sym.first_set.include?(sym)
            @counterexamples.productions[si].each do |next_item|
              next if next_item.empty_rule?
              next_si = StateItem.new(si.state, next_item)
              next if sis.include?(next_si)
              queue << (sis + [next_si])
            end

            if next_sym.nullable
              next_si = @counterexamples.transitions[[si, next_sym]]
              queue << (sis + [next_si])
            end
          end
        end
      end
    end
  end
end

# === END: lrama/counterexamples/example.rb ===
# require_relative "counterexamples/path"

# === BEGIN: lrama/counterexamples/path.rb ===


module Lrama
  class Counterexamples
    class Path
      def initialize(from_state_item, to_state_item)
        @from_state_item = from_state_item
        @to_state_item = to_state_item
      end

      def from
        @from_state_item
      end

      def to
        @to_state_item
      end

      def to_s
        "#<Path(#{type})>"
      end
      alias :inspect :to_s

      def type
        raise NotImplementedError
      end
    end
  end
end

# === END: lrama/counterexamples/path.rb ===
# require_relative "counterexamples/production_path"

# === BEGIN: lrama/counterexamples/production_path.rb ===


module Lrama
  class Counterexamples
    class ProductionPath < Path
      def type
        :production
      end

      def transition?
        false
      end

      def production?
        true
      end
    end
  end
end

# === END: lrama/counterexamples/production_path.rb ===
# require_relative "counterexamples/start_path"

# === BEGIN: lrama/counterexamples/start_path.rb ===


module Lrama
  class Counterexamples
    class StartPath < Path
      def initialize(to_state_item)
        super nil, to_state_item
      end

      def type
        :start
      end

      def transition?
        false
      end

      def production?
        false
      end
    end
  end
end

# === END: lrama/counterexamples/start_path.rb ===
# require_relative "counterexamples/state_item"

# === BEGIN: lrama/counterexamples/state_item.rb ===


module Lrama
  class Counterexamples
    class StateItem < Struct.new(:state, :item)
    end
  end
end

# === END: lrama/counterexamples/state_item.rb ===
# require_relative "counterexamples/transition_path"

# === BEGIN: lrama/counterexamples/transition_path.rb ===


module Lrama
  class Counterexamples
    class TransitionPath < Path
      def type
        :transition
      end

      def transition?
        true
      end

      def production?
        false
      end
    end
  end
end

# === END: lrama/counterexamples/transition_path.rb ===
# require_relative "counterexamples/triple"

# === BEGIN: lrama/counterexamples/triple.rb ===


module Lrama
  class Counterexamples
    # s: state
    # itm: item within s
    # l: precise lookahead set
    class Triple < Struct.new(:s, :itm, :l)
      alias :state :s
      alias :item :itm
      alias :precise_lookahead_set :l

      def state_item
        StateItem.new(state, item)
      end

      def inspect
        "#{state.inspect}. #{item.display_name}. #{l.map(&:id).map(&:s_value)}"
      end
      alias :to_s :inspect
    end
  end
end

# === END: lrama/counterexamples/triple.rb ===

module Lrama
  # See: https://www.cs.cornell.edu/andru/papers/cupex/cupex.pdf
  #      4. Constructing Nonunifying Counterexamples
  class Counterexamples
    attr_reader :transitions, :productions

    def initialize(states)
      @states = states
      setup_transitions
      setup_productions
    end

    def to_s
      "#<Counterexamples>"
    end
    alias :inspect :to_s

    def compute(conflict_state)
      conflict_state.conflicts.flat_map do |conflict|
        case conflict.type
        when :shift_reduce
          # @type var conflict: State::ShiftReduceConflict
          shift_reduce_example(conflict_state, conflict)
        when :reduce_reduce
          # @type var conflict: State::ReduceReduceConflict
          reduce_reduce_examples(conflict_state, conflict)
        end
      end.compact
    end

    private

    def setup_transitions
      # Hash [StateItem, Symbol] => StateItem
      @transitions = {}
      # Hash [StateItem, Symbol] => Set(StateItem)
      @reverse_transitions = {}

      @states.states.each do |src_state|
        trans = {} #: Hash[Grammar::Symbol, State]

        src_state.transitions.each do |shift, next_state|
          trans[shift.next_sym] = next_state
        end

        src_state.items.each do |src_item|
          next if src_item.end_of_rule?
          sym = src_item.next_sym
          dest_state = trans[sym]

          dest_state.kernels.each do |dest_item|
            next unless (src_item.rule == dest_item.rule) && (src_item.position + 1 == dest_item.position)
            src_state_item = StateItem.new(src_state, src_item)
            dest_state_item = StateItem.new(dest_state, dest_item)

            @transitions[[src_state_item, sym]] = dest_state_item

            # @type var key: [StateItem, Grammar::Symbol]
            key = [dest_state_item, sym]
            @reverse_transitions[key] ||= Set.new
            @reverse_transitions[key] << src_state_item
          end
        end
      end
    end

    def setup_productions
      # Hash [StateItem] => Set(Item)
      @productions = {}
      # Hash [State, Symbol] => Set(Item). Symbol is nterm
      @reverse_productions = {}

      @states.states.each do |state|
        # LHS => Set(Item)
        h = {} #: Hash[Grammar::Symbol, Set[States::Item]]

        state.closure.each do |item|
          sym = item.lhs

          h[sym] ||= Set.new
          h[sym] << item
        end

        state.items.each do |item|
          next if item.end_of_rule?
          next if item.next_sym.term?

          sym = item.next_sym
          state_item = StateItem.new(state, item)
          # @type var key: [State, Grammar::Symbol]
          key = [state, sym]

          @productions[state_item] = h[sym]

          @reverse_productions[key] ||= Set.new
          @reverse_productions[key] << item
        end
      end
    end

    def shift_reduce_example(conflict_state, conflict)
      conflict_symbol = conflict.symbols.first
      # @type var shift_conflict_item: ::Lrama::States::Item
      shift_conflict_item = conflict_state.items.find { |item| item.next_sym == conflict_symbol }
      path2 = shortest_path(conflict_state, conflict.reduce.item, conflict_symbol)
      path1 = find_shift_conflict_shortest_path(path2, conflict_state, shift_conflict_item)

      Example.new(path1, path2, conflict, conflict_symbol, self)
    end

    def reduce_reduce_examples(conflict_state, conflict)
      conflict_symbol = conflict.symbols.first
      path1 = shortest_path(conflict_state, conflict.reduce1.item, conflict_symbol)
      path2 = shortest_path(conflict_state, conflict.reduce2.item, conflict_symbol)

      Example.new(path1, path2, conflict, conflict_symbol, self)
    end

    def find_shift_conflict_shortest_path(reduce_path, conflict_state, conflict_item)
      state_items = find_shift_conflict_shortest_state_items(reduce_path, conflict_state, conflict_item)
      build_paths_from_state_items(state_items)
    end

    def find_shift_conflict_shortest_state_items(reduce_path, conflict_state, conflict_item)
      target_state_item = StateItem.new(conflict_state, conflict_item)
      result = [target_state_item]
      reversed_reduce_path = reduce_path.to_a.reverse
      # Index for state_item
      i = 0

      while (path = reversed_reduce_path[i])
        # Index for prev_state_item
        j = i + 1
        _j = j

        while (prev_path = reversed_reduce_path[j])
          if prev_path.production?
            j += 1
          else
            break
          end
        end

        state_item = path.to
        prev_state_item = prev_path&.to

        if target_state_item == state_item || target_state_item.item.start_item?
          result.concat(
            reversed_reduce_path[_j..-1] #: Array[StartPath|TransitionPath|ProductionPath]
              .map(&:to))
          break
        end

        if target_state_item.item.beginning_of_rule?
          queue = [] #: Array[Array[StateItem]]
          queue << [target_state_item]

          # Find reverse production
          while (sis = queue.shift)
            si = sis.last

            # Reach to start state
            if si.item.start_item?
              sis.shift
              result.concat(sis)
              target_state_item = si
              break
            end

            if si.item.beginning_of_rule?
              # @type var key: [State, Grammar::Symbol]
              key = [si.state, si.item.lhs]
              @reverse_productions[key].each do |item|
                state_item = StateItem.new(si.state, item)
                queue << (sis + [state_item])
              end
            else
              # @type var key: [StateItem, Grammar::Symbol]
              key = [si, si.item.previous_sym]
              @reverse_transitions[key].each do |prev_target_state_item|
                next if prev_target_state_item.state != prev_state_item&.state
                sis.shift
                result.concat(sis)
                result << prev_target_state_item
                target_state_item = prev_target_state_item
                i = j
                queue.clear
                break
              end
            end
          end
        else
          # Find reverse transition
          # @type var key: [StateItem, Grammar::Symbol]
          key = [target_state_item, target_state_item.item.previous_sym]
          @reverse_transitions[key].each do |prev_target_state_item|
            next if prev_target_state_item.state != prev_state_item&.state
            result << prev_target_state_item
            target_state_item = prev_target_state_item
            i = j
            break
          end
        end
      end

      result.reverse
    end

    def build_paths_from_state_items(state_items)
      state_items.zip([nil] + state_items).map do |si, prev_si|
        case
        when prev_si.nil?
          StartPath.new(si)
        when si.item.beginning_of_rule?
          ProductionPath.new(prev_si, si)
        else
          TransitionPath.new(prev_si, si)
        end
      end
    end

    def shortest_path(conflict_state, conflict_reduce_item, conflict_term)
      # queue: is an array of [Triple, [Path]]
      queue = [] #: Array[[Triple, Array[StartPath|TransitionPath|ProductionPath]]]
      visited = {} #: Hash[Triple, true]
      start_state = @states.states.first #: Lrama::State
      raise "BUG: Start state should be just one kernel." if start_state.kernels.count != 1

      start = Triple.new(start_state, start_state.kernels.first, Set.new([@states.eof_symbol]))

      queue << [start, [StartPath.new(start.state_item)]]

      while true
        triple, paths = queue.shift

        next if visited[triple]
        visited[triple] = true

        # Found
        if triple.state == conflict_state && triple.item == conflict_reduce_item && triple.l.include?(conflict_term)
          return paths
        end

        # transition
        triple.state.transitions.each do |shift, next_state|
          next unless triple.item.next_sym && triple.item.next_sym == shift.next_sym
          next_state.kernels.each do |kernel|
            next if kernel.rule != triple.item.rule
            t = Triple.new(next_state, kernel, triple.l)
            queue << [t, paths + [TransitionPath.new(triple.state_item, t.state_item)]]
          end
        end

        # production step
        triple.state.closure.each do |item|
          next unless triple.item.next_sym && triple.item.next_sym == item.lhs
          l = follow_l(triple.item, triple.l)
          t = Triple.new(triple.state, item, l)
          queue << [t, paths + [ProductionPath.new(triple.state_item, t.state_item)]]
        end

        break if queue.empty?
      end

      return nil
    end

    def follow_l(item, current_l)
      # 1. follow_L (A -> X1 ... Xn-1 • Xn) = L
      # 2. follow_L (A -> X1 ... Xk • Xk+1 Xk+2 ... Xn) = {Xk+2} if Xk+2 is a terminal
      # 3. follow_L (A -> X1 ... Xk • Xk+1 Xk+2 ... Xn) = FIRST(Xk+2) if Xk+2 is a nonnullable nonterminal
      # 4. follow_L (A -> X1 ... Xk • Xk+1 Xk+2 ... Xn) = FIRST(Xk+2) + follow_L (A -> X1 ... Xk+1 • Xk+2 ... Xn) if Xk+2 is a nullable nonterminal
      case
      when item.number_of_rest_symbols == 1
        current_l
      when item.next_next_sym.term?
        Set.new([item.next_next_sym])
      when !item.next_next_sym.nullable
        item.next_next_sym.first_set
      else
        item.next_next_sym.first_set + follow_l(item.new_by_next_position, current_l)
      end
    end
  end
end

# === END: lrama/counterexamples.rb ===
# require_relative "lrama/diagnostics"

# === BEGIN: lrama/diagnostics.rb ===


module Lrama
  class Diagnostics
    def initialize(grammar, states, logger)
      @grammar = grammar
      @states = states
      @logger = logger
    end

    def run(diagnostic)
      if diagnostic
        diagnose_conflict
        diagnose_parameterizing_redefined
      end
    end

    private

    def diagnose_conflict
      if @states.sr_conflicts_count != 0
        @logger.warn("shift/reduce conflicts: #{@states.sr_conflicts_count} found")
      end

      if  @states.rr_conflicts_count != 0
        @logger.warn("reduce/reduce conflicts: #{@states.rr_conflicts_count} found")
      end
    end

    def diagnose_parameterizing_redefined
      @grammar.parameterizing_rule_resolver.redefined_rules.each do |rule|
        @logger.warn("parameterizing rule redefined: #{rule}")
      end
    end
  end
end

# === END: lrama/diagnostics.rb ===
# require_relative "lrama/digraph"

# === BEGIN: lrama/digraph.rb ===

# rbs_inline: enabled

module Lrama
  # Algorithm Digraph of https://dl.acm.org/doi/pdf/10.1145/69622.357187 (P. 625)
  #
  # @rbs generic X < Object -- Type of a member of `sets`
  # @rbs generic Y < _Or    -- Type of sets assigned to a member of `sets`
  class Digraph
    # TODO: rbs-inline 0.10.0 doesn't support instance variables.
    #       Move these type declarations above instance variable definitions, once it's supported.
    #
    # @rbs!
    #   interface _Or
    #     def |: (self) -> self
    #   end
    #   @sets: Array[X]
    #   @relation: Hash[X, Array[X]]
    #   @base_function: Hash[X, Y]
    #   @stack: Array[X]
    #   @h: Hash[X, (Integer|Float)?]
    #   @result: Hash[X, Y]

    # @rbs sets: Array[X]
    # @rbs relation: Hash[X, Array[X]]
    # @rbs base_function: Hash[X, Y]
    # @rbs return: void
    def initialize(sets, relation, base_function)

      # X in the paper
      @sets = sets

      # R in the paper
      @relation = relation

      # F' in the paper
      @base_function = base_function

      # S in the paper
      @stack = []

      # N in the paper
      @h = Hash.new(0)

      # F in the paper
      @result = {}
    end

    # @rbs () -> Hash[X, Y]
    def compute
      @sets.each do |x|
        next if @h[x] != 0
        traverse(x)
      end

      return @result
    end

    private

    # @rbs (X x) -> void
    def traverse(x)
      @stack.push(x)
      d = @stack.count
      @h[x] = d
      @result[x] = @base_function[x] # F x = F' x

      @relation[x]&.each do |y|
        traverse(y) if @h[y] == 0
        @h[x] = [@h[x], @h[y]].min
        @result[x] |= @result[y] # F x = F x + F y
      end

      if @h[x] == d
        while (z = @stack.pop) do
          @h[z] = Float::INFINITY
          break if z == x
          @result[z] = @result[x] # F (Top of S) = F x
        end
      end
    end
  end
end

# === END: lrama/digraph.rb ===
# require_relative "lrama/grammar"

# === BEGIN: lrama/grammar.rb ===


# require "forwardable" # Commented out for Wasm compatibility
# require_relative "grammar/auxiliary"

# === BEGIN: lrama/grammar/auxiliary.rb ===


module Lrama
  class Grammar
    # Grammar file information not used by States but by Output
    class Auxiliary < Struct.new(:prologue_first_lineno, :prologue, :epilogue_first_lineno, :epilogue, keyword_init: true)
    end
  end
end

# === END: lrama/grammar/auxiliary.rb ===
# require_relative "grammar/binding"

# === BEGIN: lrama/grammar/binding.rb ===

# rbs_inline: enabled

module Lrama
  class Grammar
    class Binding
      # @rbs @actual_args: Array[Lexer::Token]
      # @rbs @param_to_arg: Hash[String, Lexer::Token]

      # @rbs (Array[Lexer::Token] params, Array[Lexer::Token] actual_args) -> void
      def initialize(params, actual_args)
        @actual_args = actual_args
        @param_to_arg = map_params_to_args(params, @actual_args)
      end

      # @rbs (Lexer::Token sym) -> Lexer::Token
      def resolve_symbol(sym)
        if sym.is_a?(Lexer::Token::InstantiateRule)
          Lrama::Lexer::Token::InstantiateRule.new(
            s_value: sym.s_value, location: sym.location, args: resolved_args(sym), lhs_tag: sym.lhs_tag
          )
        else
          param_to_arg(sym)
        end
      end

      # @rbs (Lexer::Token::InstantiateRule token) -> String
      def concatenated_args_str(token)
        "#{token.rule_name}_#{token_to_args_s_values(token).join('_')}"
      end

      private

      # @rbs (Array[Lexer::Token] params, Array[Lexer::Token] actual_args) -> Hash[String, Lexer::Token]
      def map_params_to_args(params, actual_args)
        params.zip(actual_args).map do |param, arg|
          [param.s_value, arg]
        end.to_h
      end

      # @rbs (Lexer::Token::InstantiateRule sym) -> Array[Lexer::Token]
      def resolved_args(sym)
        sym.args.map { |arg| resolve_symbol(arg) }
      end

      # @rbs (Lexer::Token sym) -> Lexer::Token
      def param_to_arg(sym)
        if (arg = @param_to_arg[sym.s_value].dup)
          arg.alias_name = sym.alias_name
        end
        arg || sym
      end

      # @rbs (Lexer::Token::InstantiateRule token) -> Array[String]
      def token_to_args_s_values(token)
        token.args.flat_map do |arg|
          resolved = resolve_symbol(arg)
          if resolved.is_a?(Lexer::Token::InstantiateRule)
            [resolved.s_value] + resolved.args.map(&:s_value)
          else
            [resolved.s_value]
          end
        end
      end
    end
  end
end

# === END: lrama/grammar/binding.rb ===
# require_relative "grammar/code"

# === BEGIN: lrama/grammar/code.rb ===


# require "forwardable" # Commented out for Wasm compatibility
# require_relative "code/destructor_code"

# === BEGIN: lrama/grammar/code/destructor_code.rb ===


module Lrama
  class Grammar
    class Code
      class DestructorCode < Code
        def initialize(type:, token_code:, tag:)
          super(type: type, token_code: token_code)
          @tag = tag
        end

        private

        # * ($$) *yyvaluep
        # * (@$) *yylocationp
        # * ($:$) error
        # * ($1) error
        # * (@1) error
        # * ($:1) error
        def reference_to_c(ref)
          case
          when ref.type == :dollar && ref.name == "$" # $$
            member = @tag.member
            "((*yyvaluep).#{member})"
          when ref.type == :at && ref.name == "$" # @$
            "(*yylocationp)"
          when ref.type == :index && ref.name == "$" # $:$
            raise "$:#{ref.value} can not be used in #{type}."
          when ref.type == :dollar # $n
            raise "$#{ref.value} can not be used in #{type}."
          when ref.type == :at # @n
            raise "@#{ref.value} can not be used in #{type}."
          when ref.type == :index # $:n
            raise "$:#{ref.value} can not be used in #{type}."
          else
            raise "Unexpected. #{self}, #{ref}"
          end
        end
      end
    end
  end
end

# === END: lrama/grammar/code/destructor_code.rb ===
# require_relative "code/initial_action_code"

# === BEGIN: lrama/grammar/code/initial_action_code.rb ===


module Lrama
  class Grammar
    class Code
      class InitialActionCode < Code
        private

        # * ($$) yylval
        # * (@$) yylloc
        # * ($:$) error
        # * ($1) error
        # * (@1) error
        # * ($:1) error
        def reference_to_c(ref)
          case
          when ref.type == :dollar && ref.name == "$" # $$
            "yylval"
          when ref.type == :at && ref.name == "$" # @$
            "yylloc"
          when ref.type == :index && ref.name == "$" # $:$
            raise "$:#{ref.value} can not be used in initial_action."
          when ref.type == :dollar # $n
            raise "$#{ref.value} can not be used in initial_action."
          when ref.type == :at # @n
            raise "@#{ref.value} can not be used in initial_action."
          when ref.type == :index # $:n
            raise "$:#{ref.value} can not be used in initial_action."
          else
            raise "Unexpected. #{self}, #{ref}"
          end
        end
      end
    end
  end
end

# === END: lrama/grammar/code/initial_action_code.rb ===
# require_relative "code/no_reference_code"

# === BEGIN: lrama/grammar/code/no_reference_code.rb ===


module Lrama
  class Grammar
    class Code
      class NoReferenceCode < Code
        private

        # * ($$) error
        # * (@$) error
        # * ($:$) error
        # * ($1) error
        # * (@1) error
        # * ($:1) error
        def reference_to_c(ref)
          case
          when ref.type == :dollar # $$, $n
            raise "$#{ref.value} can not be used in #{type}."
          when ref.type == :at # @$, @n
            raise "@#{ref.value} can not be used in #{type}."
          when ref.type == :index # $:$, $:n
            raise "$:#{ref.value} can not be used in #{type}."
          else
            raise "Unexpected. #{self}, #{ref}"
          end
        end
      end
    end
  end
end

# === END: lrama/grammar/code/no_reference_code.rb ===
# require_relative "code/printer_code"

# === BEGIN: lrama/grammar/code/printer_code.rb ===


module Lrama
  class Grammar
    class Code
      class PrinterCode < Code
        def initialize(type:, token_code:, tag:)
          super(type: type, token_code: token_code)
          @tag = tag
        end

        private

        # * ($$) *yyvaluep
        # * (@$) *yylocationp
        # * ($:$) error
        # * ($1) error
        # * (@1) error
        # * ($:1) error
        def reference_to_c(ref)
          case
          when ref.type == :dollar && ref.name == "$" # $$
            member = @tag.member
            "((*yyvaluep).#{member})"
          when ref.type == :at && ref.name == "$" # @$
            "(*yylocationp)"
          when ref.type == :index && ref.name == "$" # $:$
            raise "$:#{ref.value} can not be used in #{type}."
          when ref.type == :dollar # $n
            raise "$#{ref.value} can not be used in #{type}."
          when ref.type == :at # @n
            raise "@#{ref.value} can not be used in #{type}."
          when ref.type == :index # $:n
            raise "$:#{ref.value} can not be used in #{type}."
          else
            raise "Unexpected. #{self}, #{ref}"
          end
        end
      end
    end
  end
end

# === END: lrama/grammar/code/printer_code.rb ===
# require_relative "code/rule_action"

# === BEGIN: lrama/grammar/code/rule_action.rb ===


module Lrama
  class Grammar
    class Code
      class RuleAction < Code
        def initialize(type:, token_code:, rule:)
          super(type: type, token_code: token_code)
          @rule = rule
        end

        private

        # * ($$) yyval
        # * (@$) yyloc
        # * ($:$) error
        # * ($1) yyvsp[i]
        # * (@1) yylsp[i]
        # * ($:1) i - 1
        #
        #
        # Consider a rule like
        #
        #   class: keyword_class { $1 } tSTRING { $2 + $3 } keyword_end { $class = $1 + $keyword_end }
        #
        # For the semantic action of original rule:
        #
        # "Rule"                class: keyword_class { $1 } tSTRING { $2 + $3 } keyword_end { $class = $1 + $keyword_end }
        # "Position in grammar"                   $1     $2      $3          $4          $5
        # "Index for yyvsp"                       -4     -3      -2          -1           0
        # "$:n"                                  $:1    $:2     $:3         $:4         $:5
        # "index of $:n"                          -5     -4      -3          -2          -1
        #
        #
        # For the first midrule action:
        #
        # "Rule"                class: keyword_class { $1 } tSTRING { $2 + $3 } keyword_end { $class = $1 + $keyword_end }
        # "Position in grammar"                   $1
        # "Index for yyvsp"                        0
        # "$:n"                                  $:1
        def reference_to_c(ref)
          case
          when ref.type == :dollar && ref.name == "$" # $$
            tag = ref.ex_tag || lhs.tag
            raise_tag_not_found_error(ref) unless tag
            # @type var tag: Lexer::Token::Tag
            "(yyval.#{tag.member})"
          when ref.type == :at && ref.name == "$" # @$
            "(yyloc)"
          when ref.type == :index && ref.name == "$" # $:$
            raise "$:$ is not supported"
          when ref.type == :dollar # $n
            i = -position_in_rhs + ref.index
            tag = ref.ex_tag || rhs[ref.index - 1].tag
            raise_tag_not_found_error(ref) unless tag
            # @type var tag: Lexer::Token::Tag
            "(yyvsp[#{i}].#{tag.member})"
          when ref.type == :at # @n
            i = -position_in_rhs + ref.index
            "(yylsp[#{i}])"
          when ref.type == :index # $:n
            i = -position_in_rhs + ref.index
            "(#{i} - 1)"
          else
            raise "Unexpected. #{self}, #{ref}"
          end
        end

        def position_in_rhs
          # If rule is not derived rule, User Code is only action at
          # the end of rule RHS. In such case, the action is located on
          # `@rule.rhs.count`.
          @rule.position_in_original_rule_rhs || @rule.rhs.count
        end

        # If this is midrule action, RHS is an RHS of the original rule.
        def rhs
          (@rule.original_rule || @rule).rhs
        end

        # Unlike `rhs`, LHS is always an LHS of the rule.
        def lhs
          @rule.lhs
        end

        def raise_tag_not_found_error(ref)
          raise "Tag is not specified for '$#{ref.value}' in '#{@rule.display_name}'"
        end
      end
    end
  end
end

# === END: lrama/grammar/code/rule_action.rb ===

module Lrama
  class Grammar
    class Code
      extend Forwardable

      def_delegators "token_code", :s_value, :line, :column, :references

      attr_reader :type, :token_code

      def initialize(type:, token_code:)
        @type = type
        @token_code = token_code
      end

      def ==(other)
        self.class == other.class &&
        self.type == other.type &&
        self.token_code == other.token_code
      end

      # $$, $n, @$, @n are translated to C code
      def translated_code
        t_code = s_value.dup

        references.reverse_each do |ref|
          first_column = ref.first_column
          last_column = ref.last_column

          str = reference_to_c(ref)

          t_code[first_column...last_column] = str
        end

        return t_code
      end

      private

      def reference_to_c(ref)
        raise NotImplementedError.new("#reference_to_c is not implemented")
      end
    end
  end
end

# === END: lrama/grammar/code.rb ===
# require_relative "grammar/counter"

# === BEGIN: lrama/grammar/counter.rb ===


module Lrama
  class Grammar
    class Counter
      def initialize(number)
        @number = number
      end

      def increment
        n = @number
        @number += 1
        n
      end
    end
  end
end

# === END: lrama/grammar/counter.rb ===
# require_relative "grammar/destructor"

# === BEGIN: lrama/grammar/destructor.rb ===


module Lrama
  class Grammar
    class Destructor < Struct.new(:ident_or_tags, :token_code, :lineno, keyword_init: true)
      def translated_code(tag)
        Code::DestructorCode.new(type: :destructor, token_code: token_code, tag: tag).translated_code
      end
    end
  end
end

# === END: lrama/grammar/destructor.rb ===
# require_relative "grammar/error_token"

# === BEGIN: lrama/grammar/error_token.rb ===


module Lrama
  class Grammar
    class ErrorToken < Struct.new(:ident_or_tags, :token_code, :lineno, keyword_init: true)
      def translated_code(tag)
        Code::PrinterCode.new(type: :error_token, token_code: token_code, tag: tag).translated_code
      end
    end
  end
end

# === END: lrama/grammar/error_token.rb ===
# require_relative "grammar/parameterizing_rule"

# === BEGIN: lrama/grammar/parameterizing_rule.rb ===


# require_relative 'parameterizing_rule/resolver'

# === BEGIN: lrama/grammar/parameterizing_rule/resolver.rb ===


module Lrama
  class Grammar
    class ParameterizingRule
      class Resolver
        attr_accessor :rules, :created_lhs_list

        def initialize
          @rules = []
          @created_lhs_list = []
        end

        def add_parameterizing_rule(rule)
          @rules << rule
        end

        def find_rule(token)
          select_rules(@rules, token).last
        end

        def find_inline(token)
          @rules.reverse.find { |rule| rule.name == token.s_value && rule.is_inline }
        end

        def created_lhs(lhs_s_value)
          @created_lhs_list.reverse.find { |created_lhs| created_lhs.s_value == lhs_s_value }
        end

        def redefined_rules
          @rules.select { |rule| @rules.count { |r| r.name == rule.name && r.required_parameters_count == rule.required_parameters_count } > 1 }
        end

        private

        def select_rules(rules, token)
          rules = select_not_inline_rules(rules)
          rules = select_rules_by_name(rules, token.rule_name)
          rules = rules.select { |rule| rule.required_parameters_count == token.args_count }
          if rules.empty?
            raise "Invalid number of arguments. `#{token.rule_name}`"
          else
            rules
          end
        end

        def select_not_inline_rules(rules)
          rules.select { |rule| !rule.is_inline }
        end

        def select_rules_by_name(rules, rule_name)
          rules = rules.select { |rule| rule.name == rule_name }
          if rules.empty?
            raise "Parameterizing rule does not exist. `#{rule_name}`"
          else
            rules
          end
        end
      end
    end
  end
end

# === END: lrama/grammar/parameterizing_rule/resolver.rb ===
# require_relative 'parameterizing_rule/rhs'

# === BEGIN: lrama/grammar/parameterizing_rule/rhs.rb ===


module Lrama
  class Grammar
    class ParameterizingRule
      class Rhs
        attr_accessor :symbols, :user_code, :precedence_sym

        def initialize
          @symbols = []
          @user_code = nil
          @precedence_sym = nil
        end

        def resolve_user_code(bindings)
          return unless user_code

          resolved = Lexer::Token::UserCode.new(s_value: user_code.s_value, location: user_code.location)
          var_to_arg = {} #: Hash[String, String]
          symbols.each do |sym|
            resolved_sym = bindings.resolve_symbol(sym)
            if resolved_sym != sym
              var_to_arg[sym.s_value] = resolved_sym.s_value
            end
          end

          var_to_arg.each do |var, arg|
            resolved.references.each do |ref|
              if ref.name == var
                ref.name = arg
              end
            end
          end

          return resolved
        end
      end
    end
  end
end

# === END: lrama/grammar/parameterizing_rule/rhs.rb ===
# require_relative 'parameterizing_rule/rule'

# === BEGIN: lrama/grammar/parameterizing_rule/rule.rb ===


module Lrama
  class Grammar
    class ParameterizingRule
      class Rule
        attr_reader :name, :parameters, :rhs_list, :required_parameters_count, :tag, :is_inline

        def initialize(name, parameters, rhs_list, tag: nil, is_inline: false)
          @name = name
          @parameters = parameters
          @rhs_list = rhs_list
          @tag = tag
          @is_inline = is_inline
          @required_parameters_count = parameters.count
        end

        def to_s
          "#{@name}(#{@parameters.map(&:s_value).join(', ')})"
        end
      end
    end
  end
end

# === END: lrama/grammar/parameterizing_rule/rule.rb ===

# === END: lrama/grammar/parameterizing_rule.rb ===
# require_relative "grammar/percent_code"

# === BEGIN: lrama/grammar/percent_code.rb ===


module Lrama
  class Grammar
    class PercentCode
      attr_reader :name, :code

      def initialize(name, code)
        @name = name
        @code = code
      end
    end
  end
end

# === END: lrama/grammar/percent_code.rb ===
# require_relative "grammar/precedence"

# === BEGIN: lrama/grammar/precedence.rb ===


module Lrama
  class Grammar
    class Precedence < Struct.new(:type, :precedence, keyword_init: true)
      include Comparable

      def <=>(other)
        self.precedence <=> other.precedence
      end
    end
  end
end

# === END: lrama/grammar/precedence.rb ===
# require_relative "grammar/printer"

# === BEGIN: lrama/grammar/printer.rb ===


module Lrama
  class Grammar
    class Printer < Struct.new(:ident_or_tags, :token_code, :lineno, keyword_init: true)
      def translated_code(tag)
        Code::PrinterCode.new(type: :printer, token_code: token_code, tag: tag).translated_code
      end
    end
  end
end

# === END: lrama/grammar/printer.rb ===
# require_relative "grammar/reference"

# === BEGIN: lrama/grammar/reference.rb ===


module Lrama
  class Grammar
    # type: :dollar or :at
    # name: String (e.g. $$, $foo, $expr.right)
    # number: Integer (e.g. $1)
    # index: Integer
    # ex_tag: "$<tag>1" (Optional)
    class Reference < Struct.new(:type, :name, :number, :index, :ex_tag, :first_column, :last_column, keyword_init: true)
      def value
        name || number
      end
    end
  end
end

# === END: lrama/grammar/reference.rb ===
# require_relative "grammar/rule"

# === BEGIN: lrama/grammar/rule.rb ===


module Lrama
  class Grammar
    # _rhs holds original RHS element. Use rhs to refer to Symbol.
    class Rule < Struct.new(:id, :_lhs, :lhs, :lhs_tag, :_rhs, :rhs, :token_code, :position_in_original_rule_rhs, :nullable, :precedence_sym, :lineno, keyword_init: true)
      attr_accessor :original_rule

      def ==(other)
        self.class == other.class &&
        self.lhs == other.lhs &&
        self.lhs_tag == other.lhs_tag &&
        self.rhs == other.rhs &&
        self.token_code == other.token_code &&
        self.position_in_original_rule_rhs == other.position_in_original_rule_rhs &&
        self.nullable == other.nullable &&
        self.precedence_sym == other.precedence_sym &&
        self.lineno == other.lineno
      end

      def display_name
        l = lhs.id.s_value
        r = empty_rule? ? "ε" : rhs.map {|r| r.id.s_value }.join(" ")
        "#{l} -> #{r}"
      end

      def display_name_without_action
        l = lhs.id.s_value
        r = empty_rule? ? "ε" : rhs.map do |r|
          r.id.s_value if r.first_set.any?
        end.compact.join(" ")

        "#{l} -> #{r}"
      end

      # Used by #user_actions
      def as_comment
        l = lhs.id.s_value
        r = empty_rule? ? "%empty" : rhs.map(&:display_name).join(" ")

        "#{l}: #{r}"
      end

      def with_actions
        "#{display_name} {#{token_code&.s_value}}"
      end

      # opt_nl: ε     <-- empty_rule
      #       | '\n'  <-- not empty_rule
      def empty_rule?
        rhs.empty?
      end

      def precedence
        precedence_sym&.precedence
      end

      def initial_rule?
        id == 0
      end

      def translated_code
        return nil unless token_code

        Code::RuleAction.new(type: :rule_action, token_code: token_code, rule: self).translated_code
      end

      def contains_at_reference?
        return false unless token_code

        token_code.references.any? {|r| r.type == :at }
      end
    end
  end
end

# === END: lrama/grammar/rule.rb ===
# require_relative "grammar/rule_builder"

# === BEGIN: lrama/grammar/rule_builder.rb ===


module Lrama
  class Grammar
    class RuleBuilder
      attr_accessor :lhs, :line
      attr_reader :lhs_tag, :rhs, :user_code, :precedence_sym

      def initialize(rule_counter, midrule_action_counter, parameterizing_rule_resolver, position_in_original_rule_rhs = nil, lhs_tag: nil, skip_preprocess_references: false)
        @rule_counter = rule_counter
        @midrule_action_counter = midrule_action_counter
        @parameterizing_rule_resolver = parameterizing_rule_resolver
        @position_in_original_rule_rhs = position_in_original_rule_rhs
        @skip_preprocess_references = skip_preprocess_references

        @lhs = nil
        @lhs_tag = lhs_tag
        @rhs = []
        @user_code = nil
        @precedence_sym = nil
        @line = nil
        @rules = []
        @rule_builders_for_parameterizing_rules = []
        @rule_builders_for_derived_rules = []
        @parameterizing_rules = []
        @midrule_action_rules = []
      end

      def add_rhs(rhs)
        @line ||= rhs.line

        flush_user_code

        @rhs << rhs
      end

      def user_code=(user_code)
        @line ||= user_code&.line

        flush_user_code

        @user_code = user_code
      end

      def precedence_sym=(precedence_sym)
        flush_user_code

        @precedence_sym = precedence_sym
      end

      def complete_input
        freeze_rhs
      end

      def setup_rules
        preprocess_references unless @skip_preprocess_references
        process_rhs
        build_rules
      end

      def rules
        @parameterizing_rules + @midrule_action_rules + @rules
      end

      def has_inline_rules?
        rhs.any? { |token| @parameterizing_rule_resolver.find_inline(token) }
      end

      def resolve_inline_rules
        resolved_builders = [] #: Array[RuleBuilder]
        rhs.each_with_index do |token, i|
          if (inline_rule = @parameterizing_rule_resolver.find_inline(token))
            inline_rule.rhs_list.each do |inline_rhs|
              rule_builder = RuleBuilder.new(@rule_counter, @midrule_action_counter, @parameterizing_rule_resolver, lhs_tag: lhs_tag)
              if token.is_a?(Lexer::Token::InstantiateRule)
                resolve_inline_rhs(rule_builder, inline_rhs, i, Binding.new(inline_rule.parameters, token.args))
              else
                resolve_inline_rhs(rule_builder, inline_rhs, i)
              end
              rule_builder.lhs = lhs
              rule_builder.line = line
              rule_builder.precedence_sym = precedence_sym
              rule_builder.user_code = replace_inline_user_code(inline_rhs, i)
              resolved_builders << rule_builder
            end
            break
          end
        end
        resolved_builders
      end

      private

      def freeze_rhs
        @rhs.freeze
      end

      def preprocess_references
        numberize_references
      end

      def build_rules
        tokens = @replaced_rhs

        rule = Rule.new(
          id: @rule_counter.increment, _lhs: lhs, _rhs: tokens, lhs_tag: lhs_tag, token_code: user_code,
          position_in_original_rule_rhs: @position_in_original_rule_rhs, precedence_sym: precedence_sym, lineno: line
        )
        @rules = [rule]
        @parameterizing_rules = @rule_builders_for_parameterizing_rules.map do |rule_builder|
          rule_builder.rules
        end.flatten
        @midrule_action_rules = @rule_builders_for_derived_rules.map do |rule_builder|
          rule_builder.rules
        end.flatten
        @midrule_action_rules.each do |r|
          r.original_rule = rule
        end
      end

      # rhs is a mixture of variety type of tokens like `Ident`, `InstantiateRule`, `UserCode` and so on.
      # `#process_rhs` replaces some kind of tokens to `Ident` so that all `@replaced_rhs` are `Ident` or `Char`.
      def process_rhs
        return if @replaced_rhs

        @replaced_rhs = []

        rhs.each_with_index do |token, i|
          case token
          when Lrama::Lexer::Token::Char
            @replaced_rhs << token
          when Lrama::Lexer::Token::Ident
            @replaced_rhs << token
          when Lrama::Lexer::Token::InstantiateRule
            parameterizing_rule = @parameterizing_rule_resolver.find_rule(token)
            raise "Unexpected token. #{token}" unless parameterizing_rule

            bindings = Binding.new(parameterizing_rule.parameters, token.args)
            lhs_s_value = bindings.concatenated_args_str(token)
            if (created_lhs = @parameterizing_rule_resolver.created_lhs(lhs_s_value))
              @replaced_rhs << created_lhs
            else
              lhs_token = Lrama::Lexer::Token::Ident.new(s_value: lhs_s_value, location: token.location)
              @replaced_rhs << lhs_token
              @parameterizing_rule_resolver.created_lhs_list << lhs_token
              parameterizing_rule.rhs_list.each do |r|
                rule_builder = RuleBuilder.new(@rule_counter, @midrule_action_counter, @parameterizing_rule_resolver, lhs_tag: token.lhs_tag || parameterizing_rule.tag)
                rule_builder.lhs = lhs_token
                r.symbols.each { |sym| rule_builder.add_rhs(bindings.resolve_symbol(sym)) }
                rule_builder.line = line
                rule_builder.precedence_sym = r.precedence_sym
                rule_builder.user_code = r.resolve_user_code(bindings)
                rule_builder.complete_input
                rule_builder.setup_rules
                @rule_builders_for_parameterizing_rules << rule_builder
              end
            end
          when Lrama::Lexer::Token::UserCode
            prefix = token.referred ? "@" : "$@"
            tag = token.tag || lhs_tag
            new_token = Lrama::Lexer::Token::Ident.new(s_value: prefix + @midrule_action_counter.increment.to_s)
            @replaced_rhs << new_token

            rule_builder = RuleBuilder.new(@rule_counter, @midrule_action_counter, @parameterizing_rule_resolver, i, lhs_tag: tag, skip_preprocess_references: true)
            rule_builder.lhs = new_token
            rule_builder.user_code = token
            rule_builder.complete_input
            rule_builder.setup_rules

            @rule_builders_for_derived_rules << rule_builder
          else
            raise "Unexpected token. #{token}"
          end
        end
      end

      def resolve_inline_rhs(rule_builder, inline_rhs, index, bindings = nil)
        rhs.each_with_index do |token, i|
          if index == i
            inline_rhs.symbols.each { |sym| rule_builder.add_rhs(bindings.nil? ? sym : bindings.resolve_symbol(sym)) }
          else
            rule_builder.add_rhs(token)
          end
        end
      end

      def replace_inline_user_code(inline_rhs, index)
        return user_code if inline_rhs.user_code.nil?
        return user_code if user_code.nil?

        code = user_code.s_value.gsub(/\$#{index + 1}/, inline_rhs.user_code.s_value)
        user_code.references.each do |ref|
          next if ref.index.nil? || ref.index <= index # nil is a case for `$$`
          code = code.gsub(/\$#{ref.index}/, "$#{ref.index + (inline_rhs.symbols.count-1)}")
          code = code.gsub(/@#{ref.index}/, "@#{ref.index + (inline_rhs.symbols.count-1)}")
        end
        Lrama::Lexer::Token::UserCode.new(s_value: code, location: user_code.location)
      end

      def numberize_references
        # Bison n'th component is 1-origin
        (rhs + [user_code]).compact.each.with_index(1) do |token, i|
          next unless token.is_a?(Lrama::Lexer::Token::UserCode)

          token.references.each do |ref|
            ref_name = ref.name

            if ref_name
              if ref_name == '$'
                ref.name = '$'
              else
                candidates = ([lhs] + rhs).each_with_index.select {|token, _i| token.referred_by?(ref_name) }

                if candidates.size >= 2
                  token.invalid_ref(ref, "Referring symbol `#{ref_name}` is duplicated.")
                end

                unless (referring_symbol = candidates.first)
                  token.invalid_ref(ref, "Referring symbol `#{ref_name}` is not found.")
                end

                if referring_symbol[1] == 0 # Refers to LHS
                  ref.name = '$'
                else
                  ref.number = referring_symbol[1]
                end
              end
            end

            if ref.number
              ref.index = ref.number
            end

            # TODO: Need to check index of @ too?
            next if ref.type == :at

            if ref.index
              # TODO: Prohibit $0 even so Bison allows it?
              # See: https://www.gnu.org/software/bison/manual/html_node/Actions.html
              token.invalid_ref(ref, "Can not refer following component. #{ref.index} >= #{i}.") if ref.index >= i
              rhs[ref.index - 1].referred = true
            end
          end
        end
      end

      def flush_user_code
        if (c = @user_code)
          @rhs << c
          @user_code = nil
        end
      end
    end
  end
end

# === END: lrama/grammar/rule_builder.rb ===
# require_relative "grammar/symbol"

# === BEGIN: lrama/grammar/symbol.rb ===


# Symbol is both of nterm and term
# `number` is both for nterm and term
# `token_id` is tokentype for term, internal sequence number for nterm
#
# TODO: Add validation for ASCII code range for Token::Char

module Lrama
  class Grammar
    class Symbol
      attr_accessor :id, :alias_name, :tag, :number, :token_id, :nullable, :precedence,
                    :printer, :destructor, :error_token, :first_set, :first_set_bitmap
      attr_reader :term
      attr_writer :eof_symbol, :error_symbol, :undef_symbol, :accept_symbol

      def initialize(id:, term:, alias_name: nil, number: nil, tag: nil, token_id: nil, nullable: nil, precedence: nil, printer: nil, destructor: nil)
        @id = id
        @alias_name = alias_name
        @number = number
        @tag = tag
        @term = term
        @token_id = token_id
        @nullable = nullable
        @precedence = precedence
        @printer = printer
        @destructor = destructor
      end

      def term?
        term
      end

      def nterm?
        !term
      end

      def eof_symbol?
        !!@eof_symbol
      end

      def error_symbol?
        !!@error_symbol
      end

      def undef_symbol?
        !!@undef_symbol
      end

      def accept_symbol?
        !!@accept_symbol
      end

      def display_name
        alias_name || id.s_value
      end

      # name for yysymbol_kind_t
      #
      # See: b4_symbol_kind_base
      # @type var name: String
      def enum_name
        case
        when accept_symbol?
          name = "YYACCEPT"
        when eof_symbol?
          name = "YYEOF"
        when term? && id.is_a?(Lrama::Lexer::Token::Char)
          name = number.to_s + display_name
        when term? && id.is_a?(Lrama::Lexer::Token::Ident)
          name = id.s_value
        when nterm? && (id.s_value.include?("$") || id.s_value.include?("@"))
          name = number.to_s + id.s_value
        when nterm?
          name = id.s_value
        else
          raise "Unexpected #{self}"
        end

        "YYSYMBOL_" + name.gsub(/\W+/, "_")
      end

      # comment for yysymbol_kind_t
      def comment
        case
        when accept_symbol?
          # YYSYMBOL_YYACCEPT
          id.s_value
        when eof_symbol?
          # YYEOF
          alias_name
        when (term? && 0 < token_id && token_id < 128)
          # YYSYMBOL_3_backslash_, YYSYMBOL_14_
          alias_name || id.s_value
        when id.s_value.include?("$") || id.s_value.include?("@")
          # YYSYMBOL_21_1
          id.s_value
        else
          # YYSYMBOL_keyword_class, YYSYMBOL_strings_1
          alias_name || id.s_value
        end
      end
    end
  end
end

# === END: lrama/grammar/symbol.rb ===
# require_relative "grammar/symbols"

# === BEGIN: lrama/grammar/symbols.rb ===


# require_relative "symbols/resolver"

# === BEGIN: lrama/grammar/symbols/resolver.rb ===


module Lrama
  class Grammar
    class Symbols
      class Resolver
        attr_reader :terms, :nterms

        def initialize
          @terms = []
          @nterms = []
        end

        def symbols
          @symbols ||= (@terms + @nterms)
        end

        def sort_by_number!
          symbols.sort_by!(&:number)
        end

        def add_term(id:, alias_name: nil, tag: nil, token_id: nil, replace: false)
          if token_id && (sym = find_symbol_by_token_id(token_id))
            if replace
              sym.id = id
              sym.alias_name = alias_name
              sym.tag = tag
            end

            return sym
          end

          if (sym = find_symbol_by_id(id))
            return sym
          end

          @symbols = nil
          term = Symbol.new(
            id: id, alias_name: alias_name, number: nil, tag: tag,
            term: true, token_id: token_id, nullable: false
          )
          @terms << term
          term
        end

        def add_nterm(id:, alias_name: nil, tag: nil)
          if (sym = find_symbol_by_id(id))
            return sym
          end

          @symbols = nil
          nterm = Symbol.new(
            id: id, alias_name: alias_name, number: nil, tag: tag,
            term: false, token_id: nil, nullable: nil,
          )
          @nterms << nterm
          nterm
        end

        def find_term_by_s_value(s_value)
          terms.find { |s| s.id.s_value == s_value }
        end

        def find_symbol_by_s_value(s_value)
          symbols.find { |s| s.id.s_value == s_value }
        end

        def find_symbol_by_s_value!(s_value)
          find_symbol_by_s_value(s_value) || (raise "Symbol not found. value: `#{s_value}`")
        end

        def find_symbol_by_id(id)
          symbols.find do |s|
            s.id == id || s.alias_name == id.s_value
          end
        end

        def find_symbol_by_id!(id)
          find_symbol_by_id(id) || (raise "Symbol not found. #{id}")
        end

        def find_symbol_by_token_id(token_id)
          symbols.find {|s| s.token_id == token_id }
        end

        def find_symbol_by_number!(number)
          sym = symbols[number]

          raise "Symbol not found. number: `#{number}`" unless sym
          raise "[BUG] Symbol number mismatch. #{number}, #{sym}" if sym.number != number

          sym
        end

        def fill_symbol_number
          # YYEMPTY = -2
          # YYEOF   =  0
          # YYerror =  1
          # YYUNDEF =  2
          @number = 3
          fill_terms_number
          fill_nterms_number
        end

        def fill_nterm_type(types)
          types.each do |type|
            nterm = find_nterm_by_id!(type.id)
            nterm.tag = type.tag
          end
        end

        def fill_printer(printers)
          symbols.each do |sym|
            printers.each do |printer|
              printer.ident_or_tags.each do |ident_or_tag|
                case ident_or_tag
                when Lrama::Lexer::Token::Ident
                  sym.printer = printer if sym.id == ident_or_tag
                when Lrama::Lexer::Token::Tag
                  sym.printer = printer if sym.tag == ident_or_tag
                else
                  raise "Unknown token type. #{printer}"
                end
              end
            end
          end
        end

        def fill_destructor(destructors)
          symbols.each do |sym|
            destructors.each do |destructor|
              destructor.ident_or_tags.each do |ident_or_tag|
                case ident_or_tag
                when Lrama::Lexer::Token::Ident
                  sym.destructor = destructor if sym.id == ident_or_tag
                when Lrama::Lexer::Token::Tag
                  sym.destructor = destructor if sym.tag == ident_or_tag
                else
                  raise "Unknown token type. #{destructor}"
                end
              end
            end
          end
        end

        def fill_error_token(error_tokens)
          symbols.each do |sym|
            error_tokens.each do |token|
              token.ident_or_tags.each do |ident_or_tag|
                case ident_or_tag
                when Lrama::Lexer::Token::Ident
                  sym.error_token = token if sym.id == ident_or_tag
                when Lrama::Lexer::Token::Tag
                  sym.error_token = token if sym.tag == ident_or_tag
                else
                  raise "Unknown token type. #{token}"
                end
              end
            end
          end
        end

        def token_to_symbol(token)
          case token
          when Lrama::Lexer::Token
            find_symbol_by_id!(token)
          else
            raise "Unknown class: #{token}"
          end
        end

        def validate!
          validate_number_uniqueness!
          validate_alias_name_uniqueness!
        end

        private

        def find_nterm_by_id!(id)
          @nterms.find do |s|
            s.id == id
          end || (raise "Symbol not found. #{id}")
        end

        def fill_terms_number
          # Character literal in grammar file has
          # token id corresponding to ASCII code by default,
          # so start token_id from 256.
          token_id = 256

          @terms.each do |sym|
            while used_numbers[@number] do
              @number += 1
            end

            if sym.number.nil?
              sym.number = @number
              used_numbers[@number] = true
              @number += 1
            end

            # If id is Token::Char, it uses ASCII code
            if sym.token_id.nil?
              if sym.id.is_a?(Lrama::Lexer::Token::Char)
                # Ignore ' on the both sides
                case sym.id.s_value[1..-2]
                when "\\b"
                  sym.token_id = 8
                when "\\f"
                  sym.token_id = 12
                when "\\n"
                  sym.token_id = 10
                when "\\r"
                  sym.token_id = 13
                when "\\t"
                  sym.token_id = 9
                when "\\v"
                  sym.token_id = 11
                when "\""
                  sym.token_id = 34
                when "'"
                  sym.token_id = 39
                when "\\\\"
                  sym.token_id = 92
                when /\A\\(\d+)\z/
                  unless (id = Integer($1, 8)).nil?
                    sym.token_id = id
                  else
                    raise "Unknown Char s_value #{sym}"
                  end
                when /\A(.)\z/
                  unless (id = $1&.bytes&.first).nil?
                    sym.token_id = id
                  else
                    raise "Unknown Char s_value #{sym}"
                  end
                else
                  raise "Unknown Char s_value #{sym}"
                end
              else
                sym.token_id = token_id
                token_id += 1
              end
            end
          end
        end

        def fill_nterms_number
          token_id = 0

          @nterms.each do |sym|
            while used_numbers[@number] do
              @number += 1
            end

            if sym.number.nil?
              sym.number = @number
              used_numbers[@number] = true
              @number += 1
            end

            if sym.token_id.nil?
              sym.token_id = token_id
              token_id += 1
            end
          end
        end

        def used_numbers
          return @used_numbers if defined?(@used_numbers)

          @used_numbers = {}
          symbols.map(&:number).each do |n|
            @used_numbers[n] = true
          end
          @used_numbers
        end

        def validate_number_uniqueness!
          invalid = symbols.group_by(&:number).select do |number, syms|
            syms.count > 1
          end

          return if invalid.empty?

          raise "Symbol number is duplicated. #{invalid}"
        end

        def validate_alias_name_uniqueness!
          invalid = symbols.select(&:alias_name).group_by(&:alias_name).select do |alias_name, syms|
            syms.count > 1
          end

          return if invalid.empty?

          raise "Symbol alias name is duplicated. #{invalid}"
        end
      end
    end
  end
end

# === END: lrama/grammar/symbols/resolver.rb ===

# === END: lrama/grammar/symbols.rb ===
# require_relative "grammar/type"

# === BEGIN: lrama/grammar/type.rb ===


module Lrama
  class Grammar
    class Type
      attr_reader :id, :tag

      def initialize(id:, tag:)
        @id = id
        @tag = tag
      end

      def ==(other)
        self.class == other.class &&
        self.id == other.id &&
        self.tag == other.tag
      end
    end
  end
end

# === END: lrama/grammar/type.rb ===
# require_relative "grammar/union"

# === BEGIN: lrama/grammar/union.rb ===


module Lrama
  class Grammar
    class Union < Struct.new(:code, :lineno, keyword_init: true)
      def braces_less_code
        # Braces is already removed by lexer
        code.s_value
      end
    end
  end
end

# === END: lrama/grammar/union.rb ===
# require_relative "lexer"

# === BEGIN: lrama/lexer.rb ===


require "strscan"

# require_relative "lexer/grammar_file"

# === BEGIN: lrama/lexer/grammar_file.rb ===

# rbs_inline: enabled

module Lrama
  class Lexer
    class GrammarFile
      class Text < String
        # @rbs () -> String
        def inspect
          length <= 50 ? super : "#{self[0..47]}...".inspect
        end
      end

      attr_reader :path #: String
      attr_reader :text #: String

      # @rbs (String path, String text) -> void
      def initialize(path, text)
        @path = path
        @text = Text.new(text).freeze
      end

      # @rbs () -> String
      def inspect
        "<#{self.class}: @path=#{path}, @text=#{text.inspect}>"
      end

      # @rbs (GrammarFile other) -> bool
      def ==(other)
        self.class == other.class &&
        self.path == other.path
      end

      # @rbs () -> Array[String]
      def lines
        @lines ||= text.split("\n")
      end
    end
  end
end

# === END: lrama/lexer/grammar_file.rb ===
# require_relative "lexer/location"

# === BEGIN: lrama/lexer/location.rb ===

# rbs_inline: enabled

module Lrama
  class Lexer
    class Location
      attr_reader :grammar_file #: GrammarFile
      attr_reader :first_line #: Integer
      attr_reader :first_column #: Integer
      attr_reader :last_line #: Integer
      attr_reader :last_column #: Integer

      # @rbs (grammar_file: GrammarFile, first_line: Integer, first_column: Integer, last_line: Integer, last_column: Integer) -> void
      def initialize(grammar_file:, first_line:, first_column:, last_line:, last_column:)
        @grammar_file = grammar_file
        @first_line = first_line
        @first_column = first_column
        @last_line = last_line
        @last_column = last_column
      end

      # @rbs (Location other) -> bool
      def ==(other)
        self.class == other.class &&
        self.grammar_file == other.grammar_file &&
        self.first_line == other.first_line &&
        self.first_column == other.first_column &&
        self.last_line == other.last_line &&
        self.last_column == other.last_column
      end

      # @rbs (Integer left, Integer right) -> Location
      def partial_location(left, right)
        offset = -first_column
        new_first_line = -1
        new_first_column = -1
        new_last_line = -1
        new_last_column = -1

        _text.each.with_index do |line, index|
          new_offset = offset + line.length + 1

          if offset <= left && left <= new_offset
            new_first_line = first_line + index
            new_first_column = left - offset
          end

          if offset <= right && right <= new_offset
            new_last_line = first_line + index
            new_last_column = right - offset
          end

          offset = new_offset
        end

        Location.new(
          grammar_file: grammar_file,
          first_line: new_first_line, first_column: new_first_column,
          last_line: new_last_line, last_column: new_last_column
        )
      end

      # @rbs () -> String
      def to_s
        "#{path} (#{first_line},#{first_column})-(#{last_line},#{last_column})"
      end

      # @rbs (String error_message) -> String
      def generate_error_message(error_message)
        <<~ERROR.chomp
          #{path}:#{first_line}:#{first_column}: #{error_message}
          #{line_with_carets}
        ERROR
      end

      # @rbs () -> String
      def line_with_carets
        <<~TEXT
          #{text}
          #{carets}
        TEXT
      end

      private

      # @rbs () -> String
      def path
        grammar_file.path
      end

      # @rbs () -> String
      def blanks
        (text[0...first_column] or raise "#{first_column} is invalid").gsub(/[^\t]/, ' ')
      end

      # @rbs () -> String
      def carets
        blanks + '^' * (last_column - first_column)
      end

      # @rbs () -> String
      def text
        @text ||= _text.join("\n")
      end

      # @rbs () -> Array[String]
      def _text
        @_text ||=begin
          range = (first_line - 1)...last_line
          grammar_file.lines[range] or raise "#{range} is invalid"
        end
      end
    end
  end
end

# === END: lrama/lexer/location.rb ===
# require_relative "lexer/token"

# === BEGIN: lrama/lexer/token.rb ===

# rbs_inline: enabled

# require_relative 'token/char'

# === BEGIN: lrama/lexer/token/char.rb ===

# rbs_inline: enabled

module Lrama
  class Lexer
    class Token
      class Char < Token
      end
    end
  end
end

# === END: lrama/lexer/token/char.rb ===
# require_relative 'token/ident'

# === BEGIN: lrama/lexer/token/ident.rb ===

# rbs_inline: enabled

module Lrama
  class Lexer
    class Token
      class Ident < Token
      end
    end
  end
end

# === END: lrama/lexer/token/ident.rb ===
# require_relative 'token/instantiate_rule'

# === BEGIN: lrama/lexer/token/instantiate_rule.rb ===

# rbs_inline: enabled

module Lrama
  class Lexer
    class Token
      class InstantiateRule < Token
        attr_reader :args #: Array[Lexer::Token]
        attr_reader :lhs_tag #: Lexer::Token::Tag?

        # @rbs (s_value: String, ?alias_name: String, ?location: Location, ?args: Array[Lexer::Token], ?lhs_tag: Lexer::Token::Tag?) -> void
        def initialize(s_value:, alias_name: nil, location: nil, args: [], lhs_tag: nil)
          super s_value: s_value, alias_name: alias_name, location: location
          @args = args
          @lhs_tag = lhs_tag
        end

        # @rbs () -> String
        def rule_name
          s_value
        end

        # @rbs () -> Integer
        def args_count
          args.count
        end
      end
    end
  end
end

# === END: lrama/lexer/token/instantiate_rule.rb ===
# require_relative 'token/tag'

# === BEGIN: lrama/lexer/token/tag.rb ===

# rbs_inline: enabled

module Lrama
  class Lexer
    class Token
      class Tag < Token
        # @rbs () -> String
        def member
          # Omit "<>"
          s_value[1..-2] or raise "Unexpected Tag format (#{s_value})"
        end
      end
    end
  end
end

# === END: lrama/lexer/token/tag.rb ===
# require_relative 'token/user_code'

# === BEGIN: lrama/lexer/token/user_code.rb ===

# rbs_inline: enabled

require "strscan"

module Lrama
  class Lexer
    class Token
      class UserCode < Token
        attr_accessor :tag #: Lexer::Token::Tag

        # @rbs () -> Array[Lrama::Grammar::Reference]
        def references
          @references ||= _references
        end

        private

        # @rbs () -> Array[Lrama::Grammar::Reference]
        def _references
          scanner = StringScanner.new(s_value)
          references = [] #: Array[Grammar::Reference]

          until scanner.eos? do
            case
            when reference = scan_reference(scanner)
              references << reference
            when scanner.scan(/\/\*/)
              scanner.scan_until(/\*\//)
            else
              scanner.getch
            end
          end

          references
        end

        # @rbs (StringScanner scanner) -> Lrama::Grammar::Reference?
        def scan_reference(scanner)
          start = scanner.pos
          case
          # $ references
          # It need to wrap an identifier with brackets to use ".-" for identifiers
          when scanner.scan(/\$(<[a-zA-Z0-9_]+>)?\$/) # $$, $<long>$
            tag = scanner[1] ? Lrama::Lexer::Token::Tag.new(s_value: scanner[1]) : nil
            return Lrama::Grammar::Reference.new(type: :dollar, name: "$", ex_tag: tag, first_column: start, last_column: scanner.pos)
          when scanner.scan(/\$(<[a-zA-Z0-9_]+>)?(\d+)/) # $1, $2, $<long>1
            tag = scanner[1] ? Lrama::Lexer::Token::Tag.new(s_value: scanner[1]) : nil
            return Lrama::Grammar::Reference.new(type: :dollar, number: Integer(scanner[2]), index: Integer(scanner[2]), ex_tag: tag, first_column: start, last_column: scanner.pos)
          when scanner.scan(/\$(<[a-zA-Z0-9_]+>)?([a-zA-Z_][a-zA-Z0-9_]*)/) # $foo, $expr, $<long>program (named reference without brackets)
            tag = scanner[1] ? Lrama::Lexer::Token::Tag.new(s_value: scanner[1]) : nil
            return Lrama::Grammar::Reference.new(type: :dollar, name: scanner[2], ex_tag: tag, first_column: start, last_column: scanner.pos)
          when scanner.scan(/\$(<[a-zA-Z0-9_]+>)?\[([a-zA-Z_.][-a-zA-Z0-9_.]*)\]/) # $[expr.right], $[expr-right], $<long>[expr.right] (named reference with brackets)
            tag = scanner[1] ? Lrama::Lexer::Token::Tag.new(s_value: scanner[1]) : nil
            return Lrama::Grammar::Reference.new(type: :dollar, name: scanner[2], ex_tag: tag, first_column: start, last_column: scanner.pos)

          # @ references
          # It need to wrap an identifier with brackets to use ".-" for identifiers
          when scanner.scan(/@\$/) # @$
            return Lrama::Grammar::Reference.new(type: :at, name: "$", first_column: start, last_column: scanner.pos)
          when scanner.scan(/@(\d+)/) # @1
            return Lrama::Grammar::Reference.new(type: :at, number: Integer(scanner[1]), index: Integer(scanner[1]), first_column: start, last_column: scanner.pos)
          when scanner.scan(/@([a-zA-Z][a-zA-Z0-9_]*)/) # @foo, @expr (named reference without brackets)
            return Lrama::Grammar::Reference.new(type: :at, name: scanner[1], first_column: start, last_column: scanner.pos)
          when scanner.scan(/@\[([a-zA-Z_.][-a-zA-Z0-9_.]*)\]/) # @[expr.right], @[expr-right]  (named reference with brackets)
            return Lrama::Grammar::Reference.new(type: :at, name: scanner[1], first_column: start, last_column: scanner.pos)

          # $: references
          when scanner.scan(/\$:\$/) # $:$
            return Lrama::Grammar::Reference.new(type: :index, name: "$", first_column: start, last_column: scanner.pos)
          when scanner.scan(/\$:(\d+)/) # $:1
            return Lrama::Grammar::Reference.new(type: :index, number: Integer(scanner[1]), first_column: start, last_column: scanner.pos)
          when scanner.scan(/\$:([a-zA-Z_][a-zA-Z0-9_]*)/) # $:foo, $:expr (named reference without brackets)
            return Lrama::Grammar::Reference.new(type: :index, name: scanner[1], first_column: start, last_column: scanner.pos)
          when scanner.scan(/\$:\[([a-zA-Z_.][-a-zA-Z0-9_.]*)\]/) # $:[expr.right], $:[expr-right] (named reference with brackets)
            return Lrama::Grammar::Reference.new(type: :index, name: scanner[1], first_column: start, last_column: scanner.pos)

          end
        end
      end
    end
  end
end

# === END: lrama/lexer/token/user_code.rb ===

module Lrama
  class Lexer
    class Token
      attr_reader :s_value #: String
      attr_reader :location #: Location
      attr_accessor :alias_name #: String
      attr_accessor :referred #: bool

      # @rbs (s_value: String, ?alias_name: String, ?location: Location) -> void
      def initialize(s_value:, alias_name: nil, location: nil)
        s_value.freeze
        @s_value = s_value
        @alias_name = alias_name
        @location = location
      end

      # @rbs () -> String
      def to_s
        "value: `#{s_value}`, location: #{location}"
      end

      # @rbs (String string) -> bool
      def referred_by?(string)
        [self.s_value, self.alias_name].compact.include?(string)
      end

      # @rbs (Token other) -> bool
      def ==(other)
        self.class == other.class && self.s_value == other.s_value
      end

      # @rbs () -> Integer
      def first_line
        location.first_line
      end
      alias :line :first_line

      # @rbs () -> Integer
      def first_column
        location.first_column
      end
      alias :column :first_column

      # @rbs () -> Integer
      def last_line
        location.last_line
      end

      # @rbs () -> Integer
      def last_column
        location.last_column
      end

      # @rbs (Lrama::Grammar::Reference ref, String message) -> bot
      def invalid_ref(ref, message)
        location = self.location.partial_location(ref.first_column, ref.last_column)
        raise location.generate_error_message(message)
      end
    end
  end
end

# === END: lrama/lexer/token.rb ===

module Lrama
  class Lexer
    attr_reader :head_line, :head_column, :line
    attr_accessor :status, :end_symbol

    SYMBOLS = ['%{', '%}', '%%', '{', '}', '\[', '\]', '\(', '\)', '\,', ':', '\|', ';'].freeze
    PERCENT_TOKENS = %w(
      %union
      %token
      %type
      %nterm
      %left
      %right
      %nonassoc
      %expect
      %define
      %require
      %printer
      %destructor
      %lex-param
      %parse-param
      %initial-action
      %precedence
      %prec
      %error-token
      %before-reduce
      %after-reduce
      %after-shift-error-token
      %after-shift
      %after-pop-stack
      %empty
      %code
      %rule
      %no-stdlib
      %inline
      %locations
    ).freeze

    def initialize(grammar_file)
      @grammar_file = grammar_file
      @scanner = StringScanner.new(grammar_file.text)
      @head_column = @head = @scanner.pos
      @head_line = @line = 1
      @status = :initial
      @end_symbol = nil
    end

    def next_token
      case @status
      when :initial
        lex_token
      when :c_declaration
        lex_c_code
      end
    end

    def column
      @scanner.pos - @head
    end

    def location
      Location.new(
        grammar_file: @grammar_file,
        first_line: @head_line, first_column: @head_column,
        last_line: line, last_column: column
      )
    end

    def lex_token
      until @scanner.eos? do
        case
        when @scanner.scan(/\n/)
          newline
        when @scanner.scan(/\s+/)
          # noop
        when @scanner.scan(/\/\*/)
          lex_comment
        when @scanner.scan(/\/\/.*(?<newline>\n)?/)
          newline if @scanner[:newline]
        else
          break
        end
      end

      reset_first_position

      case
      when @scanner.eos?
        return
      when @scanner.scan(/#{SYMBOLS.join('|')}/)
        return [@scanner.matched, @scanner.matched]
      when @scanner.scan(/#{PERCENT_TOKENS.join('|')}/)
        return [@scanner.matched, @scanner.matched]
      when @scanner.scan(/[\?\+\*]/)
        return [@scanner.matched, @scanner.matched]
      when @scanner.scan(/<\w+>/)
        return [:TAG, Lrama::Lexer::Token::Tag.new(s_value: @scanner.matched, location: location)]
      when @scanner.scan(/'.'/)
        return [:CHARACTER, Lrama::Lexer::Token::Char.new(s_value: @scanner.matched, location: location)]
      when @scanner.scan(/'\\\\'|'\\b'|'\\t'|'\\f'|'\\r'|'\\n'|'\\v'|'\\13'/)
        return [:CHARACTER, Lrama::Lexer::Token::Char.new(s_value: @scanner.matched, location: location)]
      when @scanner.scan(/".*?"/)
        return [:STRING, %Q(#{@scanner.matched})]
      when @scanner.scan(/\d+/)
        return [:INTEGER, Integer(@scanner.matched)]
      when @scanner.scan(/([a-zA-Z_.][-a-zA-Z0-9_.]*)/)
        token = Lrama::Lexer::Token::Ident.new(s_value: @scanner.matched, location: location)
        type =
          if @scanner.check(/\s*(\[\s*[a-zA-Z_.][-a-zA-Z0-9_.]*\s*\])?\s*:/)
            :IDENT_COLON
          else
            :IDENTIFIER
          end
        return [type, token]
      else
        raise ParseError, "Unexpected token: #{@scanner.peek(10).chomp}."
      end
    end

    def lex_c_code
      nested = 0
      code = ''
      reset_first_position

      until @scanner.eos? do
        case
        when @scanner.scan(/{/)
          code += @scanner.matched
          nested += 1
        when @scanner.scan(/}/)
          if nested == 0 && @end_symbol == '}'
            @scanner.unscan
            return [:C_DECLARATION, Lrama::Lexer::Token::UserCode.new(s_value: code, location: location)]
          else
            code += @scanner.matched
            nested -= 1
          end
        when @scanner.check(/#{@end_symbol}/)
          return [:C_DECLARATION, Lrama::Lexer::Token::UserCode.new(s_value: code, location: location)]
        when @scanner.scan(/\n/)
          code += @scanner.matched
          newline
        when @scanner.scan(/".*?"/)
          code += %Q(#{@scanner.matched})
          @line += @scanner.matched.count("\n")
        when @scanner.scan(/'.*?'/)
          code += %Q(#{@scanner.matched})
        when @scanner.scan(/[^\"'\{\}\n]+/)
          code += @scanner.matched
        when @scanner.scan(/#{Regexp.escape(@end_symbol)}/)
          code += @scanner.matched
        else
          code += @scanner.getch
        end
      end
      raise ParseError, "Unexpected code: #{code}."
    end

    private

    def lex_comment
      until @scanner.eos? do
        case
        when @scanner.scan_until(/[\s\S]*?\*\//)
          @scanner.matched.count("\n").times { newline }
          return
        when @scanner.scan_until(/\n/)
          newline
        end
      end
    end

    def reset_first_position
      @head_line = line
      @head_column = column
    end

    def newline
      @line += 1
      @head = @scanner.pos
    end
  end
end

# === END: lrama/lexer.rb ===

module Lrama
  # Grammar is the result of parsing an input grammar file
  class Grammar
    extend Forwardable

    attr_reader :percent_codes, :eof_symbol, :error_symbol, :undef_symbol, :accept_symbol, :aux, :parameterizing_rule_resolver
    attr_accessor :union, :expect, :printers, :error_tokens, :lex_param, :parse_param, :initial_action,
                  :after_shift, :before_reduce, :after_reduce, :after_shift_error_token, :after_pop_stack,
                  :symbols_resolver, :types, :rules, :rule_builders, :sym_to_rules, :no_stdlib, :locations, :define

    def_delegators "@symbols_resolver", :symbols, :nterms, :terms, :add_nterm, :add_term, :find_term_by_s_value,
                                        :find_symbol_by_number!, :find_symbol_by_id!, :token_to_symbol,
                                        :find_symbol_by_s_value!, :fill_symbol_number, :fill_nterm_type,
                                        :fill_printer, :fill_destructor, :fill_error_token, :sort_by_number!

    def initialize(rule_counter, define = {})
      @rule_counter = rule_counter

      # Code defined by "%code"
      @percent_codes = []
      @printers = []
      @destructors = []
      @error_tokens = []
      @symbols_resolver = Grammar::Symbols::Resolver.new
      @types = []
      @rule_builders = []
      @rules = []
      @sym_to_rules = {}
      @parameterizing_rule_resolver = ParameterizingRule::Resolver.new
      @empty_symbol = nil
      @eof_symbol = nil
      @error_symbol = nil
      @undef_symbol = nil
      @accept_symbol = nil
      @aux = Auxiliary.new
      @no_stdlib = false
      @locations = false
      @define = define.map {|d| d.split('=') }.to_h

      append_special_symbols
    end

    def create_rule_builder(rule_counter, midrule_action_counter)
      RuleBuilder.new(rule_counter, midrule_action_counter, @parameterizing_rule_resolver)
    end

    def add_percent_code(id:, code:)
      @percent_codes << PercentCode.new(id.s_value, code.s_value)
    end

    def add_destructor(ident_or_tags:, token_code:, lineno:)
      @destructors << Destructor.new(ident_or_tags: ident_or_tags, token_code: token_code, lineno: lineno)
    end

    def add_printer(ident_or_tags:, token_code:, lineno:)
      @printers << Printer.new(ident_or_tags: ident_or_tags, token_code: token_code, lineno: lineno)
    end

    def add_error_token(ident_or_tags:, token_code:, lineno:)
      @error_tokens << ErrorToken.new(ident_or_tags: ident_or_tags, token_code: token_code, lineno: lineno)
    end

    def add_type(id:, tag:)
      @types << Type.new(id: id, tag: tag)
    end

    def add_nonassoc(sym, precedence)
      set_precedence(sym, Precedence.new(type: :nonassoc, precedence: precedence))
    end

    def add_left(sym, precedence)
      set_precedence(sym, Precedence.new(type: :left, precedence: precedence))
    end

    def add_right(sym, precedence)
      set_precedence(sym, Precedence.new(type: :right, precedence: precedence))
    end

    def add_precedence(sym, precedence)
      set_precedence(sym, Precedence.new(type: :precedence, precedence: precedence))
    end

    def set_precedence(sym, precedence)
      raise "" if sym.nterm?
      sym.precedence = precedence
    end

    def set_union(code, lineno)
      @union = Union.new(code: code, lineno: lineno)
    end

    def add_rule_builder(builder)
      @rule_builders << builder
    end

    def add_parameterizing_rule(rule)
      @parameterizing_rule_resolver.add_parameterizing_rule(rule)
    end

    def parameterizing_rules
      @parameterizing_rule_resolver.rules
    end

    def insert_before_parameterizing_rules(rules)
      @parameterizing_rule_resolver.rules = rules + @parameterizing_rule_resolver.rules
    end

    def prologue_first_lineno=(prologue_first_lineno)
      @aux.prologue_first_lineno = prologue_first_lineno
    end

    def prologue=(prologue)
      @aux.prologue = prologue
    end

    def epilogue_first_lineno=(epilogue_first_lineno)
      @aux.epilogue_first_lineno = epilogue_first_lineno
    end

    def epilogue=(epilogue)
      @aux.epilogue = epilogue
    end

    def prepare
      resolve_inline_rules
      normalize_rules
      collect_symbols
      set_lhs_and_rhs
      fill_default_precedence
      fill_symbols
      fill_sym_to_rules
      compute_nullable
      compute_first_set
      set_locations
    end

    # TODO: More validation methods
    #
    # * Validation for no_declared_type_reference
    def validate!
      @symbols_resolver.validate!
      validate_rule_lhs_is_nterm!
    end

    def find_rules_by_symbol!(sym)
      find_rules_by_symbol(sym) || (raise "Rules for #{sym} not found")
    end

    def find_rules_by_symbol(sym)
      @sym_to_rules[sym.number]
    end

    def ielr_defined?
      @define.key?('lr.type') && @define['lr.type'] == 'ielr'
    end

    private

    def compute_nullable
      @rules.each do |rule|
        case
        when rule.empty_rule?
          rule.nullable = true
        when rule.rhs.any?(&:term)
          rule.nullable = false
        else
          # noop
        end
      end

      while true do
        rs  = @rules.select {|e| e.nullable.nil? }
        nts = nterms.select {|e| e.nullable.nil? }
        rule_count_1  = rs.count
        nterm_count_1 = nts.count

        rs.each do |rule|
          if rule.rhs.all?(&:nullable)
            rule.nullable = true
          end
        end

        nts.each do |nterm|
          find_rules_by_symbol!(nterm).each do |rule|
            if rule.nullable
              nterm.nullable = true
            end
          end
        end

        rule_count_2  = @rules.count {|e| e.nullable.nil? }
        nterm_count_2 = nterms.count {|e| e.nullable.nil? }

        if (rule_count_1 == rule_count_2) && (nterm_count_1 == nterm_count_2)
          break
        end
      end

      rules.select {|r| r.nullable.nil? }.each do |rule|
        rule.nullable = false
      end

      nterms.select {|e| e.nullable.nil? }.each do |nterm|
        nterm.nullable = false
      end
    end

    def compute_first_set
      terms.each do |term|
        term.first_set = Set.new([term]).freeze
        term.first_set_bitmap = Lrama::Bitmap.from_array([term.number])
      end

      nterms.each do |nterm|
        nterm.first_set = Set.new([]).freeze
        nterm.first_set_bitmap = Lrama::Bitmap.from_array([])
      end

      while true do
        changed = false

        @rules.each do |rule|
          rule.rhs.each do |r|
            if rule.lhs.first_set_bitmap | r.first_set_bitmap != rule.lhs.first_set_bitmap
              changed = true
              rule.lhs.first_set_bitmap = rule.lhs.first_set_bitmap | r.first_set_bitmap
            end

            break unless r.nullable
          end
        end

        break unless changed
      end

      nterms.each do |nterm|
        nterm.first_set = Lrama::Bitmap.to_array(nterm.first_set_bitmap).map do |number|
          find_symbol_by_number!(number)
        end.to_set
      end
    end

    def setup_rules
      @rule_builders.each do |builder|
        builder.setup_rules
      end
    end

    def append_special_symbols
      # YYEMPTY (token_id: -2, number: -2) is added when a template is evaluated
      # term = add_term(id: Token.new(Token::Ident, "YYEMPTY"), token_id: -2)
      # term.number = -2
      # @empty_symbol = term

      # YYEOF
      term = add_term(id: Lrama::Lexer::Token::Ident.new(s_value: "YYEOF"), alias_name: "\"end of file\"", token_id: 0)
      term.number = 0
      term.eof_symbol = true
      @eof_symbol = term

      # YYerror
      term = add_term(id: Lrama::Lexer::Token::Ident.new(s_value: "YYerror"), alias_name: "error")
      term.number = 1
      term.error_symbol = true
      @error_symbol = term

      # YYUNDEF
      term = add_term(id: Lrama::Lexer::Token::Ident.new(s_value: "YYUNDEF"), alias_name: "\"invalid token\"")
      term.number = 2
      term.undef_symbol = true
      @undef_symbol = term

      # $accept
      term = add_nterm(id: Lrama::Lexer::Token::Ident.new(s_value: "$accept"))
      term.accept_symbol = true
      @accept_symbol = term
    end

    def resolve_inline_rules
      while @rule_builders.any?(&:has_inline_rules?) do
        @rule_builders = @rule_builders.flat_map do |builder|
          if builder.has_inline_rules?
            builder.resolve_inline_rules
          else
            builder
          end
        end
      end
    end

    def normalize_rules
      # Add $accept rule to the top of rules
      rule_builder = @rule_builders.first # : RuleBuilder
      lineno = rule_builder ? rule_builder.line : 0
      @rules << Rule.new(id: @rule_counter.increment, _lhs: @accept_symbol.id, _rhs: [rule_builder.lhs, @eof_symbol.id], token_code: nil, lineno: lineno)

      setup_rules

      @rule_builders.each do |builder|
        builder.rules.each do |rule|
          add_nterm(id: rule._lhs, tag: rule.lhs_tag)
          @rules << rule
        end
      end

      @rules.sort_by!(&:id)
    end

    # Collect symbols from rules
    def collect_symbols
      @rules.flat_map(&:_rhs).each do |s|
        case s
        when Lrama::Lexer::Token::Char
          add_term(id: s)
        when Lrama::Lexer::Token
          # skip
        else
          raise "Unknown class: #{s}"
        end
      end
    end

    def set_lhs_and_rhs
      @rules.each do |rule|
        rule.lhs = token_to_symbol(rule._lhs) if rule._lhs

        rule.rhs = rule._rhs.map do |t|
          token_to_symbol(t)
        end
      end
    end

    # Rule inherits precedence from the last term in RHS.
    #
    # https://www.gnu.org/software/bison/manual/html_node/How-Precedence.html
    def fill_default_precedence
      @rules.each do |rule|
        # Explicitly specified precedence has the highest priority
        next if rule.precedence_sym

        precedence_sym = nil
        rule.rhs.each do |sym|
          precedence_sym = sym if sym.term?
        end

        rule.precedence_sym = precedence_sym
      end
    end

    def fill_symbols
      fill_symbol_number
      fill_nterm_type(@types)
      fill_printer(@printers)
      fill_destructor(@destructors)
      fill_error_token(@error_tokens)
      sort_by_number!
    end

    def fill_sym_to_rules
      @rules.each do |rule|
        key = rule.lhs.number
        @sym_to_rules[key] ||= []
        @sym_to_rules[key] << rule
      end
    end

    def validate_rule_lhs_is_nterm!
      errors = [] #: Array[String]

      rules.each do |rule|
        next if rule.lhs.nterm?

        errors << "[BUG] LHS of #{rule.display_name} (line: #{rule.lineno}) is term. It should be nterm."
      end

      return if errors.empty?

      raise errors.join("\n")
    end

    def set_locations
      @locations = @locations || @rules.any? {|rule| rule.contains_at_reference? }
    end
  end
end

# === END: lrama/grammar.rb ===
# require_relative "lrama/grammar_validator"

# === BEGIN: lrama/grammar_validator.rb ===


module Lrama
  class GrammarValidator
    def initialize(grammar, states, logger)
      @grammar = grammar
      @states = states
      @logger = logger
    end

    def valid?
      conflicts_within_threshold?
    end

    private

    def conflicts_within_threshold?
      return true unless @grammar.expect

      [sr_conflicts_within_threshold(@grammar.expect), rr_conflicts_within_threshold(0)].all?
    end

    def sr_conflicts_within_threshold(expected)
      return true if expected == @states.sr_conflicts_count

      @logger.error("shift/reduce conflicts: #{@states.sr_conflicts_count} found, #{expected} expected")
      false
    end

    def rr_conflicts_within_threshold(expected)
      return true if expected == @states.rr_conflicts_count

      @logger.error("reduce/reduce conflicts: #{@states.rr_conflicts_count} found, #{expected} expected")
      false
    end
  end
end

# === END: lrama/grammar_validator.rb ===
# require_relative "lrama/lexer"
# require_relative "lrama/logger"

# === BEGIN: lrama/logger.rb ===

# rbs_inline: enabled

module Lrama
  class Logger
    # @rbs (IO out) -> void
    def initialize(out = STDERR)
      @out = out
    end

    # @rbs (String message) -> void
    def warn(message)
      @out << message << "\n"
    end

    # @rbs (String message) -> void
    def error(message)
      @out << message << "\n"
    end
  end
end

# === END: lrama/logger.rb ===
# require_relative "lrama/option_parser"

# === BEGIN: lrama/option_parser.rb ===


# require 'optparse' # Commented out for Wasm compatibility

module Lrama
  # Handle option parsing for the command line interface.
  class OptionParser
    def initialize
      @options = Options.new
      @trace = []
      @report = []
    end

    def parse(argv)
      parse_by_option_parser(argv)

      @options.trace_opts = validate_trace(@trace)
      @options.report_opts = validate_report(@report)
      @options.grammar_file = argv.shift

      unless @options.grammar_file
        abort "File should be specified\n"
      end

      if @options.grammar_file == '-'
        @options.grammar_file = argv.shift or abort "File name for STDIN should be specified\n"
      else
        @options.y = File.open(@options.grammar_file, 'r')
      end

      if !@report.empty? && @options.report_file.nil? && @options.grammar_file
        @options.report_file = File.dirname(@options.grammar_file) + "/" + File.basename(@options.grammar_file, ".*") + ".output"
      end

      if !@options.header_file && @options.header
        case
        when @options.outfile
          @options.header_file = File.dirname(@options.outfile) + "/" + File.basename(@options.outfile, ".*") + ".h"
        when @options.grammar_file
          @options.header_file = File.dirname(@options.grammar_file) + "/" + File.basename(@options.grammar_file, ".*") + ".h"
        end
      end

      @options
    end

    private

    def parse_by_option_parser(argv)
      ::OptionParser.new do |o|
        o.banner = <<~BANNER
          Lrama is LALR (1) parser generator written by Ruby.

          Usage: lrama [options] FILE
        BANNER
        o.separator ''
        o.separator 'STDIN mode:'
        o.separator 'lrama [options] - FILE               read grammar from STDIN'
        o.separator ''
        o.separator 'Tuning the Parser:'
        o.on('-S', '--skeleton=FILE', 'specify the skeleton to use') {|v| @options.skeleton = v }
        o.on('-t', '--debug', 'display debugging outputs of internal parser') {|v| @options.debug = true }
        o.on('-D', '--define=NAME[=VALUE]', Array, "similar to '%define NAME VALUE'") {|v| @options.define = v }
        o.separator ''
        o.separator 'Output:'
        o.on('-H', '--header=[FILE]', 'also produce a header file named FILE') {|v| @options.header = true; @options.header_file = v }
        o.on('-d', 'also produce a header file') { @options.header = true }
        o.on('-r', '--report=REPORTS', Array, 'also produce details on the automaton') {|v| @report = v }
        o.on_tail ''
        o.on_tail 'REPORTS is a list of comma-separated words that can include:'
        o.on_tail '    states                           describe the states'
        o.on_tail '    itemsets                         complete the core item sets with their closure'
        o.on_tail '    lookaheads                       explicitly associate lookahead tokens to items'
        o.on_tail '    solved                           describe shift/reduce conflicts solving'
        o.on_tail '    counterexamples, cex             generate conflict counterexamples'
        o.on_tail '    rules                            list unused rules'
        o.on_tail '    terms                            list unused terminals'
        o.on_tail '    verbose                          report detailed internal state and analysis results'
        o.on_tail '    all                              include all the above reports'
        o.on_tail '    none                             disable all reports'
        o.on('--report-file=FILE', 'also produce details on the automaton output to a file named FILE') {|v| @options.report_file = v }
        o.on('-o', '--output=FILE', 'leave output to FILE') {|v| @options.outfile = v }
        o.on('--trace=TRACES', Array, 'also output trace logs at runtime') {|v| @trace = v }
        o.on_tail ''
        o.on_tail 'TRACES is a list of comma-separated words that can include:'
        o.on_tail '    automaton                        display states'
        o.on_tail '    closure                          display states'
        o.on_tail '    rules                            display grammar rules'
        o.on_tail '    only-explicit-rules              display only explicit grammar rules'
        o.on_tail '    actions                          display grammar rules with actions'
        o.on_tail '    time                             display generation time'
        o.on_tail '    all                              include all the above traces'
        o.on_tail '    none                             disable all traces'
        o.on('-v', '--verbose', "same as '--report=state'") {|_v| @report << 'states' }
        o.separator ''
        o.separator 'Diagnostics:'
        o.on('-W', '--warnings', 'report the warnings') {|v| @options.diagnostic = true }
        o.separator ''
        o.separator 'Error Recovery:'
        o.on('-e', 'enable error recovery') {|v| @options.error_recovery = true }
        o.separator ''
        o.separator 'Other options:'
        o.on('-V', '--version', "output version information and exit") {|v| puts "lrama #{Lrama::VERSION}"; exit 0 }
        o.on('-h', '--help', "display this help and exit") {|v| puts o; exit 0 }
        o.on_tail
        o.parse!(argv)
      end
    end

    ALIASED_REPORTS = { cex: :counterexamples }.freeze
    VALID_REPORTS = %i[states itemsets lookaheads solved counterexamples rules terms verbose].freeze

    def validate_report(report)
      h = { grammar: true }
      return h if report.empty?
      return {} if report == ['none']
      if report == ['all']
        VALID_REPORTS.each { |r| h[r] = true }
        return h
      end

      report.each do |r|
        aliased = aliased_report_option(r)
        if VALID_REPORTS.include?(aliased)
          h[aliased] = true
        else
          raise "Invalid report option \"#{r}\"."
        end
      end

      return h
    end

    def aliased_report_option(opt)
      (ALIASED_REPORTS[opt.to_sym] || opt).to_sym
    end

    VALID_TRACES = %w[
      locations scan parse automaton bitsets closure
      grammar rules only-explicit-rules actions resource
      sets muscles tools m4-early m4 skeleton time ielr cex
    ].freeze
    NOT_SUPPORTED_TRACES = %w[
      locations scan parse bitsets grammar resource
      sets muscles tools m4-early m4 skeleton ielr cex
    ].freeze
    SUPPORTED_TRACES = VALID_TRACES - NOT_SUPPORTED_TRACES

    def validate_trace(trace)
      h = {}
      return h if trace.empty? || trace == ['none']
      all_traces = SUPPORTED_TRACES - %w[only-explicit-rules]
      if trace == ['all']
        all_traces.each { |t| h[t.gsub(/-/, '_').to_sym] = true }
        return h
      end

      trace.each do |t|
        if SUPPORTED_TRACES.include?(t)
          h[t.gsub(/-/, '_').to_sym] = true
        else
          raise "Invalid trace option \"#{t}\"."
        end
      end

      return h
    end
  end
end

# === END: lrama/option_parser.rb ===
# require_relative "lrama/options"

# === BEGIN: lrama/options.rb ===


module Lrama
  # Command line options.
  class Options
    attr_accessor :skeleton, :header, :header_file,
                  :report_file, :outfile,
                  :error_recovery, :grammar_file,
                  :trace_opts, :report_opts,
                  :diagnostic, :y, :debug, :define

    def initialize
      @skeleton = "bison/yacc.c"
      @define = {}
      @header = false
      @header_file = nil
      @report_file = nil
      @outfile = "y.tab.c"
      @error_recovery = false
      @grammar_file = nil
      @trace_opts = nil
      @report_opts = nil
      @diagnostic = false
      @y = STDIN
      @debug = false
    end
  end
end

# === END: lrama/options.rb ===
# require_relative "lrama/output"

# === BEGIN: lrama/output.rb ===


# require "erb" # Commented out for Wasm compatibility
# require "forwardable" # Commented out for Wasm compatibility
# require_relative "report/duration"

module Lrama
  class Output
    extend Forwardable
    include Report::Duration

    attr_reader :grammar_file_path, :context, :grammar, :error_recovery, :include_header

    def_delegators "@context", :yyfinal, :yylast, :yyntokens, :yynnts, :yynrules, :yynstates,
                               :yymaxutok, :yypact_ninf, :yytable_ninf

    def_delegators "@grammar", :eof_symbol, :error_symbol, :undef_symbol, :accept_symbol

    def initialize(
      out:, output_file_path:, template_name:, grammar_file_path:,
      context:, grammar:, header_out: nil, header_file_path: nil, error_recovery: false
    )
      @out = out
      @output_file_path = output_file_path
      @template_name = template_name
      @grammar_file_path = grammar_file_path
      @header_out = header_out
      @header_file_path = header_file_path
      @context = context
      @grammar = grammar
      @error_recovery = error_recovery
      @include_header = header_file_path ? header_file_path.sub("./", "") : nil
    end

    if ERB.instance_method(:initialize).parameters.last.first == :key
      def self.erb(input)
        ERB.new(input, trim_mode: '-')
      end
    else
      def self.erb(input)
        ERB.new(input, nil, '-')
      end
    end

    def render_partial(file)
      render_template(partial_file(file))
    end

    def render
      report_duration(:render) do
        tmp = eval_template(template_file, @output_file_path)
        @out << tmp

        if @header_file_path
          tmp = eval_template(header_template_file, @header_file_path)

          if @header_out
            @header_out << tmp
          else
            File.write(@header_file_path, tmp)
          end
        end
      end
    end

    # A part of b4_token_enums
    def token_enums
      @context.yytokentype.map do |s_value, token_id, display_name|
        s = sprintf("%s = %d%s", s_value, token_id, token_id == yymaxutok ? "" : ",")

        if display_name
          sprintf("    %-30s /* %s  */\n", s, display_name)
        else
          sprintf("    %s\n", s)
        end
      end.join
    end

    # b4_symbol_enum
    def symbol_enum
      last_sym_number = @context.yysymbol_kind_t.last[1]
      @context.yysymbol_kind_t.map do |s_value, sym_number, display_name|
        s = sprintf("%s = %d%s", s_value, sym_number, (sym_number == last_sym_number) ? "" : ",")

        if display_name
          sprintf("  %-40s /* %s  */\n", s, display_name)
        else
          sprintf("  %s\n", s)
        end
      end.join
    end

    def yytranslate
      int_array_to_string(@context.yytranslate)
    end

    def yytranslate_inverted
      int_array_to_string(@context.yytranslate_inverted)
    end

    def yyrline
      int_array_to_string(@context.yyrline)
    end

    def yytname
      string_array_to_string(@context.yytname) + " YY_NULLPTR"
    end

    # b4_int_type_for
    def int_type_for(ary)
      min = ary.min
      max = ary.max

      case
      when (-127 <= min && min <= 127) && (-127 <= max && max <= 127)
        "yytype_int8"
      when (0 <= min && min <= 255) && (0 <= max && max <= 255)
        "yytype_uint8"
      when (-32767 <= min && min <= 32767) && (-32767 <= max && max <= 32767)
        "yytype_int16"
      when (0 <= min && min <= 65535) && (0 <= max && max <= 65535)
        "yytype_uint16"
      else
        "int"
      end
    end

    def symbol_actions_for_printer
      @grammar.symbols.map do |sym|
        next unless sym.printer

        <<-STR
    case #{sym.enum_name}: /* #{sym.comment}  */
#line #{sym.printer.lineno} "#{@grammar_file_path}"
         {#{sym.printer.translated_code(sym.tag)}}
#line [@oline@] [@ofile@]
        break;

        STR
      end.join
    end

    def symbol_actions_for_destructor
      @grammar.symbols.map do |sym|
        next unless sym.destructor

        <<-STR
    case #{sym.enum_name}: /* #{sym.comment}  */
#line #{sym.destructor.lineno} "#{@grammar_file_path}"
         {#{sym.destructor.translated_code(sym.tag)}}
#line [@oline@] [@ofile@]
        break;

        STR
      end.join
    end

    # b4_user_initial_action
    def user_initial_action(comment = "")
      return "" unless @grammar.initial_action

      <<-STR
        #{comment}
#line #{@grammar.initial_action.line} "#{@grammar_file_path}"
        {#{@grammar.initial_action.translated_code}}
      STR
    end

    def after_shift_function(comment = "")
      return "" unless @grammar.after_shift

      <<-STR
        #{comment}
#line #{@grammar.after_shift.line} "#{@grammar_file_path}"
        {#{@grammar.after_shift.s_value}(#{parse_param_name});}
#line [@oline@] [@ofile@]
      STR
    end

    def before_reduce_function(comment = "")
      return "" unless @grammar.before_reduce

      <<-STR
        #{comment}
#line #{@grammar.before_reduce.line} "#{@grammar_file_path}"
        {#{@grammar.before_reduce.s_value}(yylen#{user_args});}
#line [@oline@] [@ofile@]
      STR
    end

    def after_reduce_function(comment = "")
      return "" unless @grammar.after_reduce

      <<-STR
        #{comment}
#line #{@grammar.after_reduce.line} "#{@grammar_file_path}"
        {#{@grammar.after_reduce.s_value}(yylen#{user_args});}
#line [@oline@] [@ofile@]
      STR
    end

    def after_shift_error_token_function(comment = "")
      return "" unless @grammar.after_shift_error_token

      <<-STR
        #{comment}
#line #{@grammar.after_shift_error_token.line} "#{@grammar_file_path}"
        {#{@grammar.after_shift_error_token.s_value}(#{parse_param_name});}
#line [@oline@] [@ofile@]
      STR
    end

    def after_pop_stack_function(len, comment = "")
      return "" unless @grammar.after_pop_stack

      <<-STR
        #{comment}
#line #{@grammar.after_pop_stack.line} "#{@grammar_file_path}"
        {#{@grammar.after_pop_stack.s_value}(#{len}#{user_args});}
#line [@oline@] [@ofile@]
      STR
    end

    def symbol_actions_for_error_token
      @grammar.symbols.map do |sym|
        next unless sym.error_token

        <<-STR
    case #{sym.enum_name}: /* #{sym.comment}  */
#line #{sym.error_token.lineno} "#{@grammar_file_path}"
         {#{sym.error_token.translated_code(sym.tag)}}
#line [@oline@] [@ofile@]
        break;

        STR
      end.join
    end

    # b4_user_actions
    def user_actions
      action = @context.states.rules.map do |rule|
        next unless rule.token_code

        code = rule.token_code
        spaces = " " * (code.column - 1)

        <<-STR
  case #{rule.id + 1}: /* #{rule.as_comment}  */
#line #{code.line} "#{@grammar_file_path}"
#{spaces}{#{rule.translated_code}}
#line [@oline@] [@ofile@]
    break;

        STR
      end.join

      action + <<-STR

#line [@oline@] [@ofile@]
      STR
    end

    def omit_blanks(param)
      param.strip
    end

    # b4_parse_param
    def parse_param
      if @grammar.parse_param
        omit_blanks(@grammar.parse_param)
      else
        ""
      end
    end

    def lex_param
      if @grammar.lex_param
        omit_blanks(@grammar.lex_param)
      else
        ""
      end
    end

    # b4_user_formals
    def user_formals
      if @grammar.parse_param
        ", #{parse_param}"
      else
        ""
      end
    end

    # b4_user_args
    def user_args
      if @grammar.parse_param
        ", #{parse_param_name}"
      else
        ""
      end
    end

    def extract_param_name(param)
      param[/\b([a-zA-Z0-9_]+)(?=\s*\z)/]
    end

    def parse_param_name
      if @grammar.parse_param
        extract_param_name(parse_param)
      else
        ""
      end
    end

    def lex_param_name
      if @grammar.lex_param
        extract_param_name(lex_param)
      else
        ""
      end
    end

    # b4_parse_param_use
    def parse_param_use(val, loc)
      str = <<-STR.dup
  YY_USE (#{val});
  YY_USE (#{loc});
      STR

      if @grammar.parse_param
        str << "  YY_USE (#{parse_param_name});"
      end

      str
    end

    # b4_yylex_formals
    def yylex_formals
      ary = ["&yylval"]
      ary << "&yylloc" if @grammar.locations

      if @grammar.lex_param
        ary << lex_param_name
      end

      "(#{ary.join(', ')})"
    end

    # b4_table_value_equals
    def table_value_equals(table, value, literal, symbol)
      if literal < table.min || table.max < literal
        "0"
      else
        "((#{value}) == #{symbol})"
      end
    end

    # b4_yyerror_args
    def yyerror_args
      ary = ["&yylloc"]

      if @grammar.parse_param
        ary << parse_param_name
      end

      "#{ary.join(', ')}"
    end

    def template_basename
      File.basename(template_file)
    end

    def aux
      @grammar.aux
    end

    def int_array_to_string(ary)
      last = ary.count - 1

      ary.each_with_index.each_slice(10).map do |slice|
        "  " + slice.map { |e, i| sprintf("%6d%s", e, (i == last) ? "" : ",") }.join
      end.join("\n")
    end

    def spec_mapped_header_file
      @header_file_path
    end

    def b4_cpp_guard__b4_spec_mapped_header_file
      if @header_file_path
        "YY_YY_" + @header_file_path.gsub(/[^a-zA-Z_0-9]+/, "_").upcase + "_INCLUDED"
      else
        ""
      end
    end

    # b4_percent_code_get
    def percent_code(name)
      @grammar.percent_codes.select do |percent_code|
        percent_code.name == name
      end.map do |percent_code|
        percent_code.code
      end.join
    end

    private

    def eval_template(file, path)
      tmp = render_template(file)
      replace_special_variables(tmp, path)
    end

    def render_template(file)
      erb = self.class.erb(File.read(file))
      erb.filename = file
      erb.result_with_hash(context: @context, output: self)
    end

    def template_file
      File.join(template_dir, @template_name)
    end

    def header_template_file
      File.join(template_dir, "bison/yacc.h")
    end

    def partial_file(file)
      File.join(template_dir, file)
    end

    def template_dir
      File.expand_path('../../template', __dir__)
    end

    def string_array_to_string(ary)
      result = ""
      tmp = " "

      ary.each do |s|
        replaced = s.gsub('\\', '\\\\\\\\').gsub('"', '\\"')
        if (tmp + replaced + " \"\",").length > 75
          result = "#{result}#{tmp}\n"
          tmp = "  \"#{replaced}\","
        else
          tmp = "#{tmp} \"#{replaced}\","
        end
      end

      result + tmp
    end

    def replace_special_variables(str, ofile)
      str.each_line.with_index(1).map do |line, i|
        line.gsub!("[@oline@]", (i + 1).to_s)
        line.gsub!("[@ofile@]", "\"#{ofile}\"")
        line
      end.join
    end
  end
end

# === END: lrama/output.rb ===
# require_relative "lrama/parser"

# === BEGIN: lrama/parser.rb ===

#
# DO NOT MODIFY!!!!
# This file is automatically generated by Racc 1.8.1
# from Racc grammar file "parser.y".
#

###### racc/parser.rb begin
unless $".find {|p| p.end_with?('/racc/parser.rb')}
$".push "#{__dir__}/racc/parser.rb"
self.class.module_eval(<<'...end racc/parser.rb/module_eval...', 'racc/parser.rb', 1)
#--
# Copyright (c) 1999-2006 Minero Aoki
#
# This program is free software.
# You can distribute/modify this program under the same terms of ruby.
#
# As a special exception, when this code is copied by Racc
# into a Racc output file, you may use that output file
# without restriction.
#++

unless $".find {|p| p.end_with?('/racc/info.rb')}
$".push "#{__dir__}/racc/info.rb"

module Racc
  VERSION   = '1.8.1'
  Version = VERSION
  Copyright = 'Copyright (c) 1999-2006 Minero Aoki'
end

end


module Racc
  class ParseError < StandardError; end
end
unless defined?(::ParseError)
  ParseError = Racc::ParseError # :nodoc:
end

# Racc is an LALR(1) parser generator.
# It is written in Ruby itself, and generates Ruby programs.
#
# == Command-line Reference
#
#     racc [-o<var>filename</var>] [--output-file=<var>filename</var>]
#          [-e<var>rubypath</var>] [--executable=<var>rubypath</var>]
#          [-v] [--verbose]
#          [-O<var>filename</var>] [--log-file=<var>filename</var>]
#          [-g] [--debug]
#          [-E] [--embedded]
#          [-l] [--no-line-convert]
#          [-c] [--line-convert-all]
#          [-a] [--no-omit-actions]
#          [-C] [--check-only]
#          [-S] [--output-status]
#          [--version] [--copyright] [--help] <var>grammarfile</var>
#
# [+grammarfile+]
#   Racc grammar file. Any extension is permitted.
# [-o+outfile+, --output-file=+outfile+]
#   A filename for output. default is <+filename+>.tab.rb
# [-O+filename+, --log-file=+filename+]
#   Place logging output in file +filename+.
#   Default log file name is <+filename+>.output.
# [-e+rubypath+, --executable=+rubypath+]
#   output executable file(mode 755). where +path+ is the Ruby interpreter.
# [-v, --verbose]
#   verbose mode. create +filename+.output file, like yacc's y.output file.
# [-g, --debug]
#   add debug code to parser class. To display debugging information,
#   use this '-g' option and set @yydebug true in parser class.
# [-E, --embedded]
#   Output parser which doesn't need runtime files (racc/parser.rb).
# [-F, --frozen]
#   Output parser which declares frozen_string_literals: true
# [-C, --check-only]
#   Check syntax of racc grammar file and quit.
# [-S, --output-status]
#   Print messages time to time while compiling.
# [-l, --no-line-convert]
#   turns off line number converting.
# [-c, --line-convert-all]
#   Convert line number of actions, inner, header and footer.
# [-a, --no-omit-actions]
#   Call all actions, even if an action is empty.
# [--version]
#   print Racc version and quit.
# [--copyright]
#   Print copyright and quit.
# [--help]
#   Print usage and quit.
#
# == Generating Parser Using Racc
#
# To compile Racc grammar file, simply type:
#
#   $ racc parse.y
#
# This creates Ruby script file "parse.tab.y". The -o option can change the output filename.
#
# == Writing A Racc Grammar File
#
# If you want your own parser, you have to write a grammar file.
# A grammar file contains the name of your parser class, grammar for the parser,
# user code, and anything else.
# When writing a grammar file, yacc's knowledge is helpful.
# If you have not used yacc before, Racc is not too difficult.
#
# Here's an example Racc grammar file.
#
#   class Calcparser
#   rule
#     target: exp { print val[0] }
#
#     exp: exp '+' exp
#        | exp '*' exp
#        | '(' exp ')'
#        | NUMBER
#   end
#
# Racc grammar files resemble yacc files.
# But (of course), this is Ruby code.
# yacc's $$ is the 'result', $0, $1... is
# an array called 'val', and $-1, $-2... is an array called '_values'.
#
# See the {Grammar File Reference}[rdoc-ref:lib/racc/rdoc/grammar.en.rdoc] for
# more information on grammar files.
#
# == Parser
#
# Then you must prepare the parse entry method. There are two types of
# parse methods in Racc, Racc::Parser#do_parse and Racc::Parser#yyparse
#
# Racc::Parser#do_parse is simple.
#
# It's yyparse() of yacc, and Racc::Parser#next_token is yylex().
# This method must returns an array like [TOKENSYMBOL, ITS_VALUE].
# EOF is [false, false].
# (TOKENSYMBOL is a Ruby symbol (taken from String#intern) by default.
# If you want to change this, see the grammar reference.
#
# Racc::Parser#yyparse is little complicated, but useful.
# It does not use Racc::Parser#next_token, instead it gets tokens from any iterator.
#
# For example, <code>yyparse(obj, :scan)</code> causes
# calling +obj#scan+, and you can return tokens by yielding them from +obj#scan+.
#
# == Debugging
#
# When debugging, "-v" or/and the "-g" option is helpful.
#
# "-v" creates verbose log file (.output).
# "-g" creates a "Verbose Parser".
# Verbose Parser prints the internal status when parsing.
# But it's _not_ automatic.
# You must use -g option and set +@yydebug+ to +true+ in order to get output.
# -g option only creates the verbose parser.
#
# === Racc reported syntax error.
#
# Isn't there too many "end"?
# grammar of racc file is changed in v0.10.
#
# Racc does not use '%' mark, while yacc uses huge number of '%' marks..
#
# === Racc reported "XXXX conflicts".
#
# Try "racc -v xxxx.y".
# It causes producing racc's internal log file, xxxx.output.
#
# === Generated parsers does not work correctly
#
# Try "racc -g xxxx.y".
# This command let racc generate "debugging parser".
# Then set @yydebug=true in your parser.
# It produces a working log of your parser.
#
# == Re-distributing Racc runtime
#
# A parser, which is created by Racc, requires the Racc runtime module;
# racc/parser.rb.
#
# Ruby 1.8.x comes with Racc runtime module,
# you need NOT distribute Racc runtime files.
#
# If you want to include the Racc runtime module with your parser.
# This can be done by using '-E' option:
#
#   $ racc -E -omyparser.rb myparser.y
#
# This command creates myparser.rb which `includes' Racc runtime.
# Only you must do is to distribute your parser file (myparser.rb).
#
# Note: parser.rb is ruby license, but your parser is not.
# Your own parser is completely yours.
module Racc

  unless defined?(Racc_No_Extensions)
    Racc_No_Extensions = false # :nodoc:
  end

  class Parser

    Racc_Runtime_Version = ::Racc::VERSION
    Racc_Runtime_Core_Version_R = ::Racc::VERSION

    begin
      if Object.const_defined?(:RUBY_ENGINE) and RUBY_ENGINE == 'jruby'
        require 'jruby'
        require 'racc/cparse-jruby.jar'
        com.headius.racc.Cparse.new.load(JRuby.runtime, false)
      else
        require 'racc/cparse'
      end

      unless new.respond_to?(:_racc_do_parse_c, true)
        raise LoadError, 'old cparse.so'
      end
      if Racc_No_Extensions
        raise LoadError, 'selecting ruby version of racc runtime core'
      end

      Racc_Main_Parsing_Routine    = :_racc_do_parse_c # :nodoc:
      Racc_YY_Parse_Method         = :_racc_yyparse_c # :nodoc:
      Racc_Runtime_Core_Version    = Racc_Runtime_Core_Version_C # :nodoc:
      Racc_Runtime_Type            = 'c' # :nodoc:
    rescue LoadError
      Racc_Main_Parsing_Routine    = :_racc_do_parse_rb
      Racc_YY_Parse_Method         = :_racc_yyparse_rb
      Racc_Runtime_Core_Version    = Racc_Runtime_Core_Version_R
      Racc_Runtime_Type            = 'ruby'
    end

    def Parser.racc_runtime_type # :nodoc:
      Racc_Runtime_Type
    end

    def _racc_setup
      @yydebug = false unless self.class::Racc_debug_parser
      @yydebug = false unless defined?(@yydebug)
      if @yydebug
        @racc_debug_out = $stderr unless defined?(@racc_debug_out)
        @racc_debug_out ||= $stderr
      end
      arg = self.class::Racc_arg
      arg[13] = true if arg.size < 14
      arg
    end

    def _racc_init_sysvars
      @racc_state  = [0]
      @racc_tstack = []
      @racc_vstack = []

      @racc_t = nil
      @racc_val = nil

      @racc_read_next = true

      @racc_user_yyerror = false
      @racc_error_status = 0
    end

    # The entry point of the parser. This method is used with #next_token.
    # If Racc wants to get token (and its value), calls next_token.
    #
    # Example:
    #     def parse
    #       @q = [[1,1],
    #             [2,2],
    #             [3,3],
    #             [false, '$']]
    #       do_parse
    #     end
    #
    #     def next_token
    #       @q.shift
    #     end
    class_eval <<~RUBY, __FILE__, __LINE__ + 1
    def do_parse
      #{Racc_Main_Parsing_Routine}(_racc_setup(), false)
    end
    RUBY

    # The method to fetch next token.
    # If you use #do_parse method, you must implement #next_token.
    #
    # The format of return value is [TOKEN_SYMBOL, VALUE].
    # +token-symbol+ is represented by Ruby's symbol by default, e.g. :IDENT
    # for 'IDENT'.  ";" (String) for ';'.
    #
    # The final symbol (End of file) must be false.
    def next_token
      raise NotImplementedError, "#{self.class}\#next_token is not defined"
    end

    def _racc_do_parse_rb(arg, in_debug)
      action_table, action_check, action_default, action_pointer,
      _,            _,            _,              _,
      _,            _,            token_table,    * = arg

      _racc_init_sysvars
      tok = act = i = nil

      catch(:racc_end_parse) {
        while true
          if i = action_pointer[@racc_state[-1]]
            if @racc_read_next
              if @racc_t != 0   # not EOF
                tok, @racc_val = next_token()
                unless tok      # EOF
                  @racc_t = 0
                else
                  @racc_t = (token_table[tok] or 1)   # error token
                end
                racc_read_token(@racc_t, tok, @racc_val) if @yydebug
                @racc_read_next = false
              end
            end
            i += @racc_t
            unless i >= 0 and
                   act = action_table[i] and
                   action_check[i] == @racc_state[-1]
              act = action_default[@racc_state[-1]]
            end
          else
            act = action_default[@racc_state[-1]]
          end
          while act = _racc_evalact(act, arg)
            ;
          end
        end
      }
    end

    # Another entry point for the parser.
    # If you use this method, you must implement RECEIVER#METHOD_ID method.
    #
    # RECEIVER#METHOD_ID is a method to get next token.
    # It must 'yield' the token, which format is [TOKEN-SYMBOL, VALUE].
    class_eval <<~RUBY, __FILE__, __LINE__ + 1
    def yyparse(recv, mid)
      #{Racc_YY_Parse_Method}(recv, mid, _racc_setup(), false)
    end
    RUBY

    def _racc_yyparse_rb(recv, mid, arg, c_debug)
      action_table, action_check, action_default, action_pointer,
      _,            _,            _,              _,
      _,            _,            token_table,    * = arg

      _racc_init_sysvars

      catch(:racc_end_parse) {
        until i = action_pointer[@racc_state[-1]]
          while act = _racc_evalact(action_default[@racc_state[-1]], arg)
            ;
          end
        end
        recv.__send__(mid) do |tok, val|
          unless tok
            @racc_t = 0
          else
            @racc_t = (token_table[tok] or 1)   # error token
          end
          @racc_val = val
          @racc_read_next = false

          i += @racc_t
          unless i >= 0 and
                 act = action_table[i] and
                 action_check[i] == @racc_state[-1]
            act = action_default[@racc_state[-1]]
          end
          while act = _racc_evalact(act, arg)
            ;
          end

          while !(i = action_pointer[@racc_state[-1]]) ||
                ! @racc_read_next ||
                @racc_t == 0  # $
            unless i and i += @racc_t and
                   i >= 0 and
                   act = action_table[i] and
                   action_check[i] == @racc_state[-1]
              act = action_default[@racc_state[-1]]
            end
            while act = _racc_evalact(act, arg)
              ;
            end
          end
        end
      }
    end

    ###
    ### common
    ###

    def _racc_evalact(act, arg)
      action_table, action_check, _, action_pointer,
      _,            _,            _, _,
      _,            _,            _, shift_n,
      reduce_n,     * = arg
      nerr = 0   # tmp

      if act > 0 and act < shift_n
        #
        # shift
        #
        if @racc_error_status > 0
          @racc_error_status -= 1 unless @racc_t <= 1 # error token or EOF
        end
        @racc_vstack.push @racc_val
        @racc_state.push act
        @racc_read_next = true
        if @yydebug
          @racc_tstack.push @racc_t
          racc_shift @racc_t, @racc_tstack, @racc_vstack
        end

      elsif act < 0 and act > -reduce_n
        #
        # reduce
        #
        code = catch(:racc_jump) {
          @racc_state.push _racc_do_reduce(arg, act)
          false
        }
        if code
          case code
          when 1 # yyerror
            @racc_user_yyerror = true   # user_yyerror
            return -reduce_n
          when 2 # yyaccept
            return shift_n
          else
            raise '[Racc Bug] unknown jump code'
          end
        end

      elsif act == shift_n
        #
        # accept
        #
        racc_accept if @yydebug
        throw :racc_end_parse, @racc_vstack[0]

      elsif act == -reduce_n
        #
        # error
        #
        case @racc_error_status
        when 0
          unless arg[21]    # user_yyerror
            nerr += 1
            on_error @racc_t, @racc_val, @racc_vstack
          end
        when 3
          if @racc_t == 0   # is $
            # We're at EOF, and another error occurred immediately after
            # attempting auto-recovery
            throw :racc_end_parse, nil
          end
          @racc_read_next = true
        end
        @racc_user_yyerror = false
        @racc_error_status = 3
        while true
          if i = action_pointer[@racc_state[-1]]
            i += 1   # error token
            if  i >= 0 and
                (act = action_table[i]) and
                action_check[i] == @racc_state[-1]
              break
            end
          end
          throw :racc_end_parse, nil if @racc_state.size <= 1
          @racc_state.pop
          @racc_vstack.pop
          if @yydebug
            @racc_tstack.pop
            racc_e_pop @racc_state, @racc_tstack, @racc_vstack
          end
        end
        return act

      else
        raise "[Racc Bug] unknown action #{act.inspect}"
      end

      racc_next_state(@racc_state[-1], @racc_state) if @yydebug

      nil
    end

    def _racc_do_reduce(arg, act)
      _,          _,            _,            _,
      goto_table, goto_check,   goto_default, goto_pointer,
      nt_base,    reduce_table, _,            _,
      _,          use_result,   * = arg

      state = @racc_state
      vstack = @racc_vstack
      tstack = @racc_tstack

      i = act * -3
      len       = reduce_table[i]
      reduce_to = reduce_table[i+1]
      method_id = reduce_table[i+2]
      void_array = []

      tmp_t = tstack[-len, len] if @yydebug
      tmp_v = vstack[-len, len]
      tstack[-len, len] = void_array if @yydebug
      vstack[-len, len] = void_array
      state[-len, len]  = void_array

      # tstack must be updated AFTER method call
      if use_result
        vstack.push __send__(method_id, tmp_v, vstack, tmp_v[0])
      else
        vstack.push __send__(method_id, tmp_v, vstack)
      end
      tstack.push reduce_to

      racc_reduce(tmp_t, reduce_to, tstack, vstack) if @yydebug

      k1 = reduce_to - nt_base
      if i = goto_pointer[k1]
        i += state[-1]
        if i >= 0 and (curstate = goto_table[i]) and goto_check[i] == k1
          return curstate
        end
      end
      goto_default[k1]
    end

    # This method is called when a parse error is found.
    #
    # ERROR_TOKEN_ID is an internal ID of token which caused error.
    # You can get string representation of this ID by calling
    # #token_to_str.
    #
    # ERROR_VALUE is a value of error token.
    #
    # value_stack is a stack of symbol values.
    # DO NOT MODIFY this object.
    #
    # This method raises ParseError by default.
    #
    # If this method returns, parsers enter "error recovering mode".
    def on_error(t, val, vstack)
      raise ParseError, sprintf("parse error on value %s (%s)",
                                val.inspect, token_to_str(t) || '?')
    end

    # Enter error recovering mode.
    # This method does not call #on_error.
    def yyerror
      throw :racc_jump, 1
    end

    # Exit parser.
    # Return value is +Symbol_Value_Stack[0]+.
    def yyaccept
      throw :racc_jump, 2
    end

    # Leave error recovering mode.
    def yyerrok
      @racc_error_status = 0
    end

    # For debugging output
    def racc_read_token(t, tok, val)
      @racc_debug_out.print 'read    '
      @racc_debug_out.print tok.inspect, '(', racc_token2str(t), ') '
      @racc_debug_out.puts val.inspect
      @racc_debug_out.puts
    end

    def racc_shift(tok, tstack, vstack)
      @racc_debug_out.puts "shift   #{racc_token2str tok}"
      racc_print_stacks tstack, vstack
      @racc_debug_out.puts
    end

    def racc_reduce(toks, sim, tstack, vstack)
      out = @racc_debug_out
      out.print 'reduce '
      if toks.empty?
        out.print ' <none>'
      else
        toks.each {|t| out.print ' ', racc_token2str(t) }
      end
      out.puts " --> #{racc_token2str(sim)}"
      racc_print_stacks tstack, vstack
      @racc_debug_out.puts
    end

    def racc_accept
      @racc_debug_out.puts 'accept'
      @racc_debug_out.puts
    end

    def racc_e_pop(state, tstack, vstack)
      @racc_debug_out.puts 'error recovering mode: pop token'
      racc_print_states state
      racc_print_stacks tstack, vstack
      @racc_debug_out.puts
    end

    def racc_next_state(curstate, state)
      @racc_debug_out.puts  "goto    #{curstate}"
      racc_print_states state
      @racc_debug_out.puts
    end

    def racc_print_stacks(t, v)
      out = @racc_debug_out
      out.print '        ['
      t.each_index do |i|
        out.print ' (', racc_token2str(t[i]), ' ', v[i].inspect, ')'
      end
      out.puts ' ]'
    end

    def racc_print_states(s)
      out = @racc_debug_out
      out.print '        ['
      s.each {|st| out.print ' ', st }
      out.puts ' ]'
    end

    def racc_token2str(tok)
      self.class::Racc_token_to_s_table[tok] or
          raise "[Racc Bug] can't convert token #{tok} to string"
    end

    # Convert internal ID of token symbol to the string.
    def token_to_str(t)
      self.class::Racc_token_to_s_table[t]
    end

  end

end

...end racc/parser.rb/module_eval...
end
###### racc/parser.rb end
module Lrama
  class Parser < Racc::Parser

module_eval(<<'...end parser.y/module_eval...', 'parser.y', 428)

include Lrama::Report::Duration

def initialize(text, path, debug = false, define = {})
  @grammar_file = Lrama::Lexer::GrammarFile.new(path, text)
  @yydebug = debug
  @rule_counter = Lrama::Grammar::Counter.new(0)
  @midrule_action_counter = Lrama::Grammar::Counter.new(1)
  @define = define
end

def parse
  report_duration(:parse) do
    @lexer = Lrama::Lexer.new(@grammar_file)
    @grammar = Lrama::Grammar.new(@rule_counter, @define)
    @precedence_number = 0
    reset_precs
    do_parse
    @grammar
  end
end

def next_token
  @lexer.next_token
end

def on_error(error_token_id, error_value, value_stack)
  if error_value.is_a?(Lrama::Lexer::Token)
    location = error_value.location
    value = "'#{error_value.s_value}'"
  else
    location = @lexer.location
    value = error_value.inspect
  end

  error_message = "parse error on value #{value} (#{token_to_str(error_token_id) || '?'})"

  raise_parse_error(error_message, location)
end

def on_action_error(error_message, error_value)
  if error_value.is_a?(Lrama::Lexer::Token)
    location = error_value.location
  else
    location = @lexer.location
  end

  raise_parse_error(error_message, location)
end

private

def reset_precs
  @prec_seen = false
  @code_after_prec = false
end

def begin_c_declaration(end_symbol)
  @lexer.status = :c_declaration
  @lexer.end_symbol = end_symbol
end

def end_c_declaration
  @lexer.status = :initial
  @lexer.end_symbol = nil
end

def raise_parse_error(error_message, location)
  raise ParseError, location.generate_error_message(error_message)
end
...end parser.y/module_eval...
##### State transition tables begin ###

racc_action_table = [
    89,    49,    90,   167,    49,   101,   173,    49,   101,   167,
    49,   101,   173,     6,   101,    80,    49,    49,    48,    48,
    41,    76,    76,    49,    49,    48,    48,    42,    76,    76,
    49,    49,    48,    48,   101,    96,   113,    49,    87,    48,
   150,   101,    96,   151,    45,   171,   169,   170,   151,   176,
   170,    91,   169,   170,    81,   176,   170,    20,    24,    25,
    26,    27,    28,    29,    30,    31,    87,    32,    33,    34,
    35,    36,    37,    38,    39,    49,     4,    48,     5,   101,
    96,   181,   182,   183,   128,    20,    24,    25,    26,    27,
    28,    29,    30,    31,    46,    32,    33,    34,    35,    36,
    37,    38,    39,    11,    12,    13,    14,    15,    16,    17,
    18,    19,    53,    20,    24,    25,    26,    27,    28,    29,
    30,    31,    53,    32,    33,    34,    35,    36,    37,    38,
    39,    11,    12,    13,    14,    15,    16,    17,    18,    19,
    44,    20,    24,    25,    26,    27,    28,    29,    30,    31,
    53,    32,    33,    34,    35,    36,    37,    38,    39,    49,
     4,    48,     5,   101,    96,    49,    49,    48,    48,   101,
   101,    49,    49,    48,    48,   101,   101,    49,    49,    48,
   197,   101,   101,    49,    49,   197,    48,   101,   101,    49,
    49,   197,    48,   101,   181,   182,   183,   128,   204,   210,
   217,   205,   205,   205,    49,    49,    48,    48,    49,    49,
    48,    48,    49,    49,    48,    48,   181,   182,   183,   116,
   117,    56,    53,    53,    53,    53,    53,    62,    63,    64,
    65,    66,    68,    68,    68,    82,    53,    53,   104,   108,
   108,   115,   122,   123,   125,   128,   129,   133,   139,   140,
   141,   142,   144,   145,   101,   154,   139,   157,   154,   161,
   162,    68,   164,   165,   172,   177,   154,   184,   128,   188,
   154,   190,   128,   154,   199,   154,   128,    68,   165,   206,
   165,    68,    68,   215,   128,    68 ]

racc_action_check = [
    47,   153,    47,   153,   159,   153,   159,   178,   159,   178,
   189,   178,   189,     1,   189,    39,    35,    36,    35,    36,
     5,    35,    36,    37,    38,    37,    38,     6,    37,    38,
    59,    74,    59,    74,    59,    59,    74,    60,    45,    60,
   138,    60,    60,   138,     9,   156,   153,   153,   156,   159,
   159,    47,   178,   178,    39,   189,   189,    45,    45,    45,
    45,    45,    45,    45,    45,    45,    83,    45,    45,    45,
    45,    45,    45,    45,    45,    61,     0,    61,     0,    61,
    61,   166,   166,   166,   166,    83,    83,    83,    83,    83,
    83,    83,    83,    83,    11,    83,    83,    83,    83,    83,
    83,    83,    83,     3,     3,     3,     3,     3,     3,     3,
     3,     3,    13,     3,     3,     3,     3,     3,     3,     3,
     3,     3,    14,     3,     3,     3,     3,     3,     3,     3,
     3,     8,     8,     8,     8,     8,     8,     8,     8,     8,
     8,     8,     8,     8,     8,     8,     8,     8,     8,     8,
    15,     8,     8,     8,     8,     8,     8,     8,     8,    97,
     2,    97,     2,    97,    97,    71,   108,    71,   108,    71,
   108,   109,   169,   109,   169,   109,   169,   176,   184,   176,
   184,   176,   184,   190,   205,   190,   205,   190,   205,   206,
    12,   206,    12,   206,   174,   174,   174,   174,   196,   201,
   214,   196,   201,   214,    69,    76,    69,    76,   104,   105,
   104,   105,   111,   113,   111,   113,   198,   198,   198,    81,
    81,    16,    17,    20,    24,    25,    26,    27,    28,    29,
    30,    31,    32,    33,    34,    40,    51,    56,    67,    70,
    72,    80,    84,    85,    86,    87,    93,   107,   115,   116,
   117,   118,   127,   128,   134,   140,   141,   143,   144,   145,
   146,   150,   151,   152,   158,   163,   165,   167,   168,   171,
   172,   173,   175,   177,   187,   188,   192,   193,   195,   197,
   200,   202,   204,   209,   210,   216 ]

racc_action_pointer = [
    66,    13,   150,    90,   nil,    13,    27,   nil,   118,    35,
   nil,    88,   187,    63,    73,   101,   216,   173,   nil,   nil,
   174,   nil,   nil,   nil,   175,   176,   177,   222,   223,   224,
   225,   226,   224,   225,   226,    13,    14,    20,    21,    10,
   233,   nil,   nil,   nil,   nil,    34,   nil,    -5,   nil,   nil,
   nil,   187,   nil,   nil,   nil,   nil,   188,   nil,   nil,    27,
    34,    72,   nil,   nil,   nil,   nil,   nil,   230,   nil,   201,
   231,   162,   232,   nil,    28,   nil,   202,   nil,   nil,   nil,
   200,   215,   nil,    62,   233,   221,   222,   191,   nil,   nil,
   nil,   nil,   nil,   244,   nil,   nil,   nil,   156,   nil,   nil,
   nil,   nil,   nil,   nil,   205,   206,   nil,   241,   163,   168,
   nil,   209,   nil,   210,   nil,   243,   206,   209,   240,   nil,
   nil,   nil,   nil,   nil,   nil,   nil,   nil,   209,   248,   nil,
   nil,   nil,   nil,   nil,   247,   nil,   nil,   nil,    -2,   nil,
   208,   251,   nil,   255,   211,   204,   210,   nil,   nil,   nil,
   253,   257,   217,    -2,   nil,   nil,     3,   nil,   218,     1,
   nil,   nil,   nil,   222,   nil,   219,    30,   226,   214,   169,
   nil,   226,   223,   230,   143,   218,   174,   226,     4,   nil,
   nil,   nil,   nil,   nil,   175,   nil,   nil,   272,   228,     7,
   180,   nil,   222,   269,   nil,   232,   156,   238,   165,   nil,
   234,   157,   273,   nil,   274,   181,   186,   nil,   nil,   233,
   230,   nil,   nil,   nil,   158,   nil,   277,   nil,   nil ]

racc_action_default = [
    -1,  -128,    -1,    -3,   -10,  -128,  -128,    -2,    -3,  -128,
   -16,  -128,  -128,  -128,  -128,  -128,  -128,  -128,   -24,   -25,
  -128,   -32,   -33,   -34,  -128,  -128,  -128,  -128,  -128,  -128,
  -128,  -128,   -50,   -50,   -50,  -128,  -128,  -128,  -128,  -128,
  -128,   -13,   219,    -4,   -26,  -128,   -17,  -123,   -93,   -94,
  -122,   -14,   -19,   -85,   -20,   -21,  -128,   -23,   -31,  -128,
  -128,  -128,   -38,   -39,   -40,   -41,   -42,   -43,   -51,  -128,
   -44,  -128,   -45,   -46,   -88,   -90,  -128,   -47,   -48,   -49,
  -128,  -128,   -11,    -5,    -7,   -95,  -128,   -68,   -18,  -124,
  -125,  -126,   -15,  -128,   -22,   -27,   -28,   -29,   -35,   -83,
   -84,  -127,   -36,   -37,  -128,   -52,   -54,   -56,  -128,   -79,
   -81,   -88,   -89,  -128,   -91,  -128,  -128,  -128,  -128,    -6,
    -8,    -9,  -120,   -96,   -97,   -98,   -69,  -128,  -128,   -86,
   -30,   -55,   -53,   -57,   -76,   -82,   -80,   -92,  -128,   -62,
   -66,  -128,   -12,  -128,   -66,  -128,  -128,   -58,   -77,   -78,
   -50,  -128,   -60,   -64,   -67,   -70,  -128,  -121,   -99,  -100,
  -102,  -119,   -87,  -128,   -63,   -66,   -68,   -93,   -68,  -128,
  -116,  -128,   -66,   -93,   -68,   -68,  -128,   -66,   -65,   -71,
   -72,  -108,  -109,  -110,  -128,   -74,   -75,  -128,   -66,  -101,
  -128,  -103,   -68,   -50,  -107,   -59,  -128,   -93,  -111,  -117,
   -61,  -128,   -50,  -106,   -50,  -128,  -128,  -112,  -113,  -128,
   -68,  -104,   -73,  -114,  -128,  -118,   -50,  -115,  -105 ]

racc_goto_table = [
    69,   109,    50,   152,    57,   127,    84,    58,   112,   160,
   114,    59,    60,    61,    86,    52,    54,    55,    98,   102,
   103,   159,   106,   110,   175,    74,    74,    74,    74,   138,
     9,     1,     3,   180,     7,    43,   120,   160,   109,   109,
   195,   192,   121,    94,   119,   112,    40,   137,   118,   189,
    47,   200,    86,    92,   175,   156,   130,   131,   132,   107,
   135,   136,    88,   196,   111,   207,   111,    70,    72,   201,
    73,    77,    78,    79,    67,   147,   134,   178,   148,   149,
    93,   146,   124,   166,   179,   214,   185,   158,   208,   174,
   187,   209,   191,   193,   107,   107,   143,   nil,   nil,   186,
   nil,   111,   nil,   111,   nil,   nil,   194,   nil,   166,   nil,
   202,   nil,   nil,   nil,   198,   nil,   nil,   nil,   163,   174,
   198,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   216,   nil,
   nil,   nil,   nil,   nil,   nil,   213,   198,   nil,   nil,   nil,
   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
   nil,   203,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
   211,   nil,   212,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
   nil,   nil,   nil,   nil,   218 ]

racc_goto_check = [
    27,    20,    29,    33,    15,    40,     8,    15,    46,    39,
    46,    15,    15,    15,    12,    16,    16,    16,    22,    22,
    22,    50,    28,    43,    38,    29,    29,    29,    29,    32,
     7,     1,     6,    36,     6,     7,     5,    39,    20,    20,
    33,    36,     9,    15,     8,    46,    10,    46,    11,    50,
    13,    33,    12,    16,    38,    32,    22,    28,    28,    29,
    43,    43,    14,    37,    29,    36,    29,    24,    24,    37,
    25,    25,    25,    25,    23,    30,    31,    34,    41,    42,
    44,    45,    48,    20,    40,    37,    40,    49,    51,    20,
    52,    53,    40,    40,    29,    29,    54,   nil,   nil,    20,
   nil,    29,   nil,    29,   nil,   nil,    20,   nil,    20,   nil,
    40,   nil,   nil,   nil,    20,   nil,   nil,   nil,    27,    20,
    20,   nil,   nil,   nil,   nil,   nil,   nil,   nil,    40,   nil,
   nil,   nil,   nil,   nil,   nil,    20,    20,   nil,   nil,   nil,
   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
   nil,    27,   nil,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
    27,   nil,    27,   nil,   nil,   nil,   nil,   nil,   nil,   nil,
   nil,   nil,   nil,   nil,    27 ]

racc_goto_pointer = [
   nil,    31,   nil,   nil,   nil,   -48,    32,    27,   -39,   -42,
    42,   -34,   -31,    38,    15,   -13,     2,   nil,   nil,   nil,
   -70,   nil,   -41,    42,    34,    35,   nil,   -32,   -47,   -10,
   -59,   -31,   -86,  -137,   -88,   nil,  -133,  -121,  -135,  -135,
   -82,   -56,   -55,   -48,    27,   -48,   -66,   nil,    -3,   -57,
  -123,  -110,   -80,  -108,   -26 ]

racc_goto_default = [
   nil,   nil,     2,     8,    83,   nil,   nil,   nil,   nil,   nil,
   nil,   nil,    10,   nil,   nil,    51,   nil,    21,    22,    23,
    95,    97,   nil,   nil,   nil,   nil,   105,    71,   nil,    99,
   nil,   nil,   nil,   nil,   153,   126,   nil,   nil,   168,   155,
   nil,   100,   nil,   nil,   nil,   nil,    75,    85,   nil,   nil,
   nil,   nil,   nil,   nil,   nil ]

racc_reduce_table = [
  0, 0, :racc_error,
  0, 63, :_reduce_1,
  2, 63, :_reduce_2,
  0, 64, :_reduce_3,
  2, 64, :_reduce_4,
  1, 65, :_reduce_5,
  2, 65, :_reduce_6,
  0, 66, :_reduce_none,
  1, 66, :_reduce_none,
  5, 58, :_reduce_none,
  0, 67, :_reduce_10,
  0, 68, :_reduce_11,
  5, 59, :_reduce_12,
  2, 59, :_reduce_none,
  1, 73, :_reduce_14,
  2, 73, :_reduce_15,
  1, 60, :_reduce_none,
  2, 60, :_reduce_17,
  3, 60, :_reduce_18,
  2, 60, :_reduce_none,
  2, 60, :_reduce_20,
  2, 60, :_reduce_21,
  3, 60, :_reduce_22,
  2, 60, :_reduce_23,
  1, 60, :_reduce_24,
  1, 60, :_reduce_25,
  2, 60, :_reduce_none,
  1, 78, :_reduce_27,
  1, 78, :_reduce_28,
  1, 79, :_reduce_29,
  2, 79, :_reduce_30,
  2, 69, :_reduce_31,
  1, 69, :_reduce_none,
  1, 69, :_reduce_none,
  1, 69, :_reduce_none,
  3, 69, :_reduce_35,
  3, 69, :_reduce_36,
  3, 69, :_reduce_37,
  2, 69, :_reduce_38,
  2, 69, :_reduce_39,
  2, 69, :_reduce_40,
  2, 69, :_reduce_41,
  2, 69, :_reduce_42,
  2, 74, :_reduce_none,
  2, 74, :_reduce_44,
  2, 74, :_reduce_45,
  2, 74, :_reduce_46,
  2, 74, :_reduce_47,
  2, 74, :_reduce_48,
  2, 74, :_reduce_49,
  0, 84, :_reduce_none,
  1, 84, :_reduce_none,
  1, 85, :_reduce_52,
  2, 85, :_reduce_53,
  2, 80, :_reduce_54,
  3, 80, :_reduce_55,
  0, 88, :_reduce_none,
  1, 88, :_reduce_none,
  3, 83, :_reduce_58,
  8, 75, :_reduce_59,
  5, 76, :_reduce_60,
  8, 76, :_reduce_61,
  1, 89, :_reduce_62,
  3, 89, :_reduce_63,
  1, 90, :_reduce_64,
  3, 90, :_reduce_65,
  0, 96, :_reduce_none,
  1, 96, :_reduce_none,
  0, 97, :_reduce_none,
  1, 97, :_reduce_none,
  1, 91, :_reduce_70,
  3, 91, :_reduce_71,
  3, 91, :_reduce_72,
  6, 91, :_reduce_73,
  3, 91, :_reduce_74,
  3, 91, :_reduce_75,
  0, 99, :_reduce_none,
  1, 99, :_reduce_none,
  1, 87, :_reduce_78,
  1, 100, :_reduce_79,
  2, 100, :_reduce_80,
  2, 81, :_reduce_81,
  3, 81, :_reduce_82,
  1, 77, :_reduce_none,
  1, 77, :_reduce_none,
  0, 101, :_reduce_85,
  0, 102, :_reduce_86,
  5, 72, :_reduce_87,
  1, 103, :_reduce_88,
  2, 103, :_reduce_89,
  1, 82, :_reduce_90,
  2, 82, :_reduce_91,
  3, 82, :_reduce_92,
  1, 86, :_reduce_93,
  1, 86, :_reduce_94,
  0, 105, :_reduce_none,
  1, 105, :_reduce_none,
  2, 61, :_reduce_none,
  2, 61, :_reduce_none,
  4, 104, :_reduce_99,
  1, 106, :_reduce_100,
  3, 106, :_reduce_101,
  1, 107, :_reduce_102,
  3, 107, :_reduce_103,
  5, 107, :_reduce_104,
  7, 107, :_reduce_105,
  4, 107, :_reduce_106,
  3, 107, :_reduce_107,
  1, 93, :_reduce_108,
  1, 93, :_reduce_109,
  1, 93, :_reduce_110,
  0, 108, :_reduce_none,
  1, 108, :_reduce_none,
  2, 94, :_reduce_113,
  3, 94, :_reduce_114,
  4, 94, :_reduce_115,
  0, 109, :_reduce_116,
  0, 110, :_reduce_117,
  5, 95, :_reduce_118,
  3, 92, :_reduce_119,
  0, 111, :_reduce_120,
  3, 62, :_reduce_121,
  1, 70, :_reduce_none,
  0, 71, :_reduce_none,
  1, 71, :_reduce_none,
  1, 71, :_reduce_none,
  1, 71, :_reduce_none,
  1, 98, :_reduce_127 ]

racc_reduce_n = 128

racc_shift_n = 219

racc_token_table = {
  false => 0,
  :error => 1,
  :C_DECLARATION => 2,
  :CHARACTER => 3,
  :IDENT_COLON => 4,
  :IDENTIFIER => 5,
  :INTEGER => 6,
  :STRING => 7,
  :TAG => 8,
  "%%" => 9,
  "%{" => 10,
  "%}" => 11,
  "%require" => 12,
  "%expect" => 13,
  "%define" => 14,
  "%param" => 15,
  "%lex-param" => 16,
  "%parse-param" => 17,
  "%code" => 18,
  "%initial-action" => 19,
  "%no-stdlib" => 20,
  "%locations" => 21,
  ";" => 22,
  "%union" => 23,
  "%destructor" => 24,
  "%printer" => 25,
  "%error-token" => 26,
  "%after-shift" => 27,
  "%before-reduce" => 28,
  "%after-reduce" => 29,
  "%after-shift-error-token" => 30,
  "%after-pop-stack" => 31,
  "-temp-group" => 32,
  "%token" => 33,
  "%type" => 34,
  "%nterm" => 35,
  "%left" => 36,
  "%right" => 37,
  "%precedence" => 38,
  "%nonassoc" => 39,
  "%rule" => 40,
  "(" => 41,
  ")" => 42,
  ":" => 43,
  "%inline" => 44,
  "," => 45,
  "|" => 46,
  "%empty" => 47,
  "%prec" => 48,
  "{" => 49,
  "}" => 50,
  "?" => 51,
  "+" => 52,
  "*" => 53,
  "[" => 54,
  "]" => 55,
  "{...}" => 56 }

racc_nt_base = 57

racc_use_result_var = true

Racc_arg = [
  racc_action_table,
  racc_action_check,
  racc_action_default,
  racc_action_pointer,
  racc_goto_table,
  racc_goto_check,
  racc_goto_default,
  racc_goto_pointer,
  racc_nt_base,
  racc_reduce_table,
  racc_token_table,
  racc_shift_n,
  racc_reduce_n,
  racc_use_result_var ]
Ractor.make_shareable(Racc_arg) if defined?(Ractor)

Racc_token_to_s_table = [
  "$end",
  "error",
  "C_DECLARATION",
  "CHARACTER",
  "IDENT_COLON",
  "IDENTIFIER",
  "INTEGER",
  "STRING",
  "TAG",
  "\"%%\"",
  "\"%{\"",
  "\"%}\"",
  "\"%require\"",
  "\"%expect\"",
  "\"%define\"",
  "\"%param\"",
  "\"%lex-param\"",
  "\"%parse-param\"",
  "\"%code\"",
  "\"%initial-action\"",
  "\"%no-stdlib\"",
  "\"%locations\"",
  "\";\"",
  "\"%union\"",
  "\"%destructor\"",
  "\"%printer\"",
  "\"%error-token\"",
  "\"%after-shift\"",
  "\"%before-reduce\"",
  "\"%after-reduce\"",
  "\"%after-shift-error-token\"",
  "\"%after-pop-stack\"",
  "\"-temp-group\"",
  "\"%token\"",
  "\"%type\"",
  "\"%nterm\"",
  "\"%left\"",
  "\"%right\"",
  "\"%precedence\"",
  "\"%nonassoc\"",
  "\"%rule\"",
  "\"(\"",
  "\")\"",
  "\":\"",
  "\"%inline\"",
  "\",\"",
  "\"|\"",
  "\"%empty\"",
  "\"%prec\"",
  "\"{\"",
  "\"}\"",
  "\"?\"",
  "\"+\"",
  "\"*\"",
  "\"[\"",
  "\"]\"",
  "\"{...}\"",
  "$start",
  "input",
  "prologue_declaration",
  "bison_declaration",
  "rules_or_grammar_declaration",
  "epilogue_declaration",
  "\"-many@prologue_declaration\"",
  "\"-many@bison_declaration\"",
  "\"-many1@rules_or_grammar_declaration\"",
  "\"-option@epilogue_declaration\"",
  "@1",
  "@2",
  "grammar_declaration",
  "variable",
  "value",
  "param",
  "\"-many1@param\"",
  "symbol_declaration",
  "rule_declaration",
  "inline_declaration",
  "symbol",
  "\"-group@symbol|TAG\"",
  "\"-many1@-group@symbol|TAG\"",
  "token_declarations",
  "symbol_declarations",
  "token_declarations_for_precedence",
  "token_declaration",
  "\"-option@TAG\"",
  "\"-many1@token_declaration\"",
  "id",
  "alias",
  "\"-option@INTEGER\"",
  "rule_args",
  "rule_rhs_list",
  "rule_rhs",
  "named_ref",
  "parameterizing_suffix",
  "parameterizing_args",
  "midrule_action",
  "\"-option@%empty\"",
  "\"-option@named_ref\"",
  "string_as_id",
  "\"-option@string_as_id\"",
  "\"-many1@symbol\"",
  "@3",
  "@4",
  "\"-many1@id\"",
  "rules",
  "\"-option@;\"",
  "rhs_list",
  "rhs",
  "\"-option@parameterizing_suffix\"",
  "@5",
  "@6",
  "@7" ]
Ractor.make_shareable(Racc_token_to_s_table) if defined?(Ractor)

Racc_debug_parser = true

##### State transition tables end #####

# reduce 0 omitted

module_eval(<<'.,.,', 'parser.y', 11)
  def _reduce_1(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 11)
  def _reduce_2(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 11)
  def _reduce_3(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 11)
  def _reduce_4(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 11)
  def _reduce_5(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 11)
  def _reduce_6(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

# reduce 7 omitted

# reduce 8 omitted

# reduce 9 omitted

module_eval(<<'.,.,', 'parser.y', 12)
  def _reduce_10(val, _values, result)
                                begin_c_declaration("%}")
                            @grammar.prologue_first_lineno = @lexer.line

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 17)
  def _reduce_11(val, _values, result)
                                end_c_declaration

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 21)
  def _reduce_12(val, _values, result)
                                @grammar.prologue = val[2].s_value

    result
  end
.,.,

# reduce 13 omitted

module_eval(<<'.,.,', 'parser.y', 54)
  def _reduce_14(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 54)
  def _reduce_15(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

# reduce 16 omitted

module_eval(<<'.,.,', 'parser.y', 26)
  def _reduce_17(val, _values, result)
     @grammar.expect = val[1]
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 27)
  def _reduce_18(val, _values, result)
     @grammar.define[val[1].s_value] = val[2]&.s_value
    result
  end
.,.,

# reduce 19 omitted

module_eval(<<'.,.,', 'parser.y', 31)
  def _reduce_20(val, _values, result)
                             val[1].each {|token|
                           @grammar.lex_param = Grammar::Code::NoReferenceCode.new(type: :lex_param, token_code: token).token_code.s_value
                         }

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 37)
  def _reduce_21(val, _values, result)
                             val[1].each {|token|
                           @grammar.parse_param = Grammar::Code::NoReferenceCode.new(type: :parse_param, token_code: token).token_code.s_value
                         }

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 43)
  def _reduce_22(val, _values, result)
                             @grammar.add_percent_code(id: val[1], code: val[2])

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 47)
  def _reduce_23(val, _values, result)
                             @grammar.initial_action = Grammar::Code::InitialActionCode.new(type: :initial_action, token_code: val[1])

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 49)
  def _reduce_24(val, _values, result)
     @grammar.no_stdlib = true
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 50)
  def _reduce_25(val, _values, result)
     @grammar.locations = true
    result
  end
.,.,

# reduce 26 omitted

module_eval(<<'.,.,', 'parser.y', 109)
  def _reduce_27(val, _values, result)
    result = val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 109)
  def _reduce_28(val, _values, result)
    result = val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 109)
  def _reduce_29(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 109)
  def _reduce_30(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 55)
  def _reduce_31(val, _values, result)
                               @grammar.set_union(
                             Grammar::Code::NoReferenceCode.new(type: :union, token_code: val[1]),
                             val[1].line
                           )

    result
  end
.,.,

# reduce 32 omitted

# reduce 33 omitted

# reduce 34 omitted

module_eval(<<'.,.,', 'parser.y', 65)
  def _reduce_35(val, _values, result)
                               @grammar.add_destructor(
                             ident_or_tags: val[2].flatten,
                             token_code: val[1],
                             lineno: val[1].line
                           )

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 73)
  def _reduce_36(val, _values, result)
                               @grammar.add_printer(
                             ident_or_tags: val[2].flatten,
                             token_code: val[1],
                             lineno: val[1].line
                           )

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 81)
  def _reduce_37(val, _values, result)
                               @grammar.add_error_token(
                             ident_or_tags: val[2].flatten,
                             token_code: val[1],
                             lineno: val[1].line
                           )

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 89)
  def _reduce_38(val, _values, result)
                               @grammar.after_shift = val[1]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 93)
  def _reduce_39(val, _values, result)
                               @grammar.before_reduce = val[1]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 97)
  def _reduce_40(val, _values, result)
                               @grammar.after_reduce = val[1]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 101)
  def _reduce_41(val, _values, result)
                               @grammar.after_shift_error_token = val[1]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 105)
  def _reduce_42(val, _values, result)
                               @grammar.after_pop_stack = val[1]

    result
  end
.,.,

# reduce 43 omitted

module_eval(<<'.,.,', 'parser.y', 111)
  def _reduce_44(val, _values, result)
                              val[1].each {|hash|
                            hash[:tokens].each {|id|
                              @grammar.add_type(id: id, tag: hash[:tag])
                            }
                          }

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 119)
  def _reduce_45(val, _values, result)
                              val[1].each {|hash|
                            hash[:tokens].each {|id|
                              if @grammar.find_term_by_s_value(id.s_value)
                                on_action_error("symbol #{id.s_value} redeclared as a nonterminal", id)
                              else
                                @grammar.add_type(id: id, tag: hash[:tag])
                              end
                            }
                          }

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 131)
  def _reduce_46(val, _values, result)
                              val[1].each {|hash|
                            hash[:tokens].each {|id|
                              sym = @grammar.add_term(id: id)
                              @grammar.add_left(sym, @precedence_number)
                            }
                          }
                          @precedence_number += 1

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 141)
  def _reduce_47(val, _values, result)
                              val[1].each {|hash|
                            hash[:tokens].each {|id|
                              sym = @grammar.add_term(id: id)
                              @grammar.add_right(sym, @precedence_number)
                            }
                          }
                          @precedence_number += 1

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 151)
  def _reduce_48(val, _values, result)
                              val[1].each {|hash|
                            hash[:tokens].each {|id|
                              sym = @grammar.add_term(id: id)
                              @grammar.add_precedence(sym, @precedence_number)
                            }
                          }
                          @precedence_number += 1

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 161)
  def _reduce_49(val, _values, result)
                              val[1].each {|hash|
                            hash[:tokens].each {|id|
                              sym = @grammar.add_term(id: id)
                              @grammar.add_nonassoc(sym, @precedence_number)
                            }
                          }
                          @precedence_number += 1

    result
  end
.,.,

# reduce 50 omitted

# reduce 51 omitted

module_eval(<<'.,.,', 'parser.y', 184)
  def _reduce_52(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 184)
  def _reduce_53(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 172)
  def _reduce_54(val, _values, result)
                              val[1].each {|token_declaration|
                            @grammar.add_term(id: token_declaration[0], alias_name: token_declaration[2], token_id: token_declaration[1], tag: val[0], replace: true)
                          }

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 178)
  def _reduce_55(val, _values, result)
                              val[2].each {|token_declaration|
                            @grammar.add_term(id: token_declaration[0], alias_name: token_declaration[2], token_id: token_declaration[1], tag: val[1], replace: true)
                          }

    result
  end
.,.,

# reduce 56 omitted

# reduce 57 omitted

module_eval(<<'.,.,', 'parser.y', 183)
  def _reduce_58(val, _values, result)
     result = val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 187)
  def _reduce_59(val, _values, result)
                            rule = Grammar::ParameterizingRule::Rule.new(val[1].s_value, val[3], val[7], tag: val[5])
                        @grammar.add_parameterizing_rule(rule)

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 193)
  def _reduce_60(val, _values, result)
                            rule = Grammar::ParameterizingRule::Rule.new(val[2].s_value, [], val[4], is_inline: true)
                        @grammar.add_parameterizing_rule(rule)

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 198)
  def _reduce_61(val, _values, result)
                            rule = Grammar::ParameterizingRule::Rule.new(val[2].s_value, val[4], val[7], is_inline: true)
                        @grammar.add_parameterizing_rule(rule)

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 202)
  def _reduce_62(val, _values, result)
     result = [val[0]]
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 203)
  def _reduce_63(val, _values, result)
     result = val[0].append(val[2])
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 207)
  def _reduce_64(val, _values, result)
                      builder = val[0]
                  result = [builder]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 212)
  def _reduce_65(val, _values, result)
                      builder = val[2]
                  result = val[0].append(builder)

    result
  end
.,.,

# reduce 66 omitted

# reduce 67 omitted

# reduce 68 omitted

# reduce 69 omitted

module_eval(<<'.,.,', 'parser.y', 218)
  def _reduce_70(val, _values, result)
                  reset_precs
              result = Grammar::ParameterizingRule::Rhs.new

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 223)
  def _reduce_71(val, _values, result)
                  token = val[1]
              token.alias_name = val[2]
              builder = val[0]
              builder.symbols << token
              result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 231)
  def _reduce_72(val, _values, result)
                    builder = val[0]
                builder.symbols << Lrama::Lexer::Token::InstantiateRule.new(s_value: val[2], location: @lexer.location, args: [val[1]])
                result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 237)
  def _reduce_73(val, _values, result)
                    builder = val[0]
                builder.symbols << Lrama::Lexer::Token::InstantiateRule.new(s_value: val[1].s_value, location: @lexer.location, args: val[3], lhs_tag: val[5])
                result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 243)
  def _reduce_74(val, _values, result)
                  user_code = val[1]
              user_code.alias_name = val[2]
              builder = val[0]
              builder.user_code = user_code
              result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 251)
  def _reduce_75(val, _values, result)
                  sym = @grammar.find_symbol_by_id!(val[2])
              @prec_seen = true
              builder = val[0]
              builder.precedence_sym = sym
              result = builder

    result
  end
.,.,

# reduce 76 omitted

# reduce 77 omitted

module_eval(<<'.,.,', 'parser.y', 258)
  def _reduce_78(val, _values, result)
     result = val[0].s_value if val[0]
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 271)
  def _reduce_79(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 271)
  def _reduce_80(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 262)
  def _reduce_81(val, _values, result)
                              result = if val[0]
                            [{tag: val[0], tokens: val[1]}]
                          else
                            [{tag: nil, tokens: val[1]}]
                          end

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 268)
  def _reduce_82(val, _values, result)
     result = val[0].append({tag: val[1], tokens: val[2]})
    result
  end
.,.,

# reduce 83 omitted

# reduce 84 omitted

module_eval(<<'.,.,', 'parser.y', 274)
  def _reduce_85(val, _values, result)
                   begin_c_declaration("}")

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 278)
  def _reduce_86(val, _values, result)
                   end_c_declaration

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 282)
  def _reduce_87(val, _values, result)
                   result = val[2]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 290)
  def _reduce_88(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 290)
  def _reduce_89(val, _values, result)
    result = val[1] ? val[1].unshift(val[0]) : val
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 285)
  def _reduce_90(val, _values, result)
     result = [{tag: nil, tokens: val[0]}]
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 286)
  def _reduce_91(val, _values, result)
     result = [{tag: val[0], tokens: val[1]}]
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 287)
  def _reduce_92(val, _values, result)
     result = val[0].append({tag: val[1], tokens: val[2]})
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 289)
  def _reduce_93(val, _values, result)
     on_action_error("ident after %prec", val[0]) if @prec_seen
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 290)
  def _reduce_94(val, _values, result)
     on_action_error("char after %prec", val[0]) if @prec_seen
    result
  end
.,.,

# reduce 95 omitted

# reduce 96 omitted

# reduce 97 omitted

# reduce 98 omitted

module_eval(<<'.,.,', 'parser.y', 298)
  def _reduce_99(val, _values, result)
                 lhs = val[0]
             lhs.alias_name = val[1]
             val[3].each do |builder|
               builder.lhs = lhs
               builder.complete_input
               @grammar.add_rule_builder(builder)
             end

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 309)
  def _reduce_100(val, _values, result)
                    builder = val[0]
                if !builder.line
                  builder.line = @lexer.line - 1
                end
                result = [builder]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 317)
  def _reduce_101(val, _values, result)
                    builder = val[2]
                if !builder.line
                  builder.line = @lexer.line - 1
                end
                result = val[0].append(builder)

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 326)
  def _reduce_102(val, _values, result)
               reset_precs
           result = @grammar.create_rule_builder(@rule_counter, @midrule_action_counter)

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 331)
  def _reduce_103(val, _values, result)
               token = val[1]
           token.alias_name = val[2]
           builder = val[0]
           builder.add_rhs(token)
           result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 339)
  def _reduce_104(val, _values, result)
               token = Lrama::Lexer::Token::InstantiateRule.new(s_value: val[2], alias_name: val[3], location: @lexer.location, args: [val[1]], lhs_tag: val[4])
           builder = val[0]
           builder.add_rhs(token)
           builder.line = val[1].first_line
           result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 347)
  def _reduce_105(val, _values, result)
               token = Lrama::Lexer::Token::InstantiateRule.new(s_value: val[1].s_value, alias_name: val[5], location: @lexer.location, args: val[3], lhs_tag: val[6])
           builder = val[0]
           builder.add_rhs(token)
           builder.line = val[1].first_line
           result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 355)
  def _reduce_106(val, _values, result)
               user_code = val[1]
           user_code.alias_name = val[2]
           user_code.tag = val[3]
           builder = val[0]
           builder.user_code = user_code
           result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 364)
  def _reduce_107(val, _values, result)
               sym = @grammar.find_symbol_by_id!(val[2])
           @prec_seen = true
           builder = val[0]
           builder.precedence_sym = sym
           result = builder

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 371)
  def _reduce_108(val, _values, result)
     result = "option"
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 372)
  def _reduce_109(val, _values, result)
     result = "nonempty_list"
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 373)
  def _reduce_110(val, _values, result)
     result = "list"
    result
  end
.,.,

# reduce 111 omitted

# reduce 112 omitted

module_eval(<<'.,.,', 'parser.y', 377)
  def _reduce_113(val, _values, result)
                                result = if val[1]
                              [Lrama::Lexer::Token::InstantiateRule.new(s_value: val[1].s_value, location: @lexer.location, args: val[0])]
                            else
                              [val[0]]
                            end

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 383)
  def _reduce_114(val, _values, result)
     result = val[0].append(val[2])
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 384)
  def _reduce_115(val, _values, result)
     result = [Lrama::Lexer::Token::InstantiateRule.new(s_value: val[0].s_value, location: @lexer.location, args: val[2])]
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 388)
  def _reduce_116(val, _values, result)
                          if @prec_seen
                        on_action_error("multiple User_code after %prec", val[0])  if @code_after_prec
                        @code_after_prec = true
                      end
                      begin_c_declaration("}")

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 396)
  def _reduce_117(val, _values, result)
                          end_c_declaration

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 400)
  def _reduce_118(val, _values, result)
                          result = val[2]

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 403)
  def _reduce_119(val, _values, result)
     result = val[1].s_value
    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 407)
  def _reduce_120(val, _values, result)
                                begin_c_declaration('\Z')
                            @grammar.epilogue_first_lineno = @lexer.line + 1

    result
  end
.,.,

module_eval(<<'.,.,', 'parser.y', 412)
  def _reduce_121(val, _values, result)
                                end_c_declaration
                            @grammar.epilogue = val[2].s_value

    result
  end
.,.,

# reduce 122 omitted

# reduce 123 omitted

# reduce 124 omitted

# reduce 125 omitted

# reduce 126 omitted

module_eval(<<'.,.,', 'parser.y', 423)
  def _reduce_127(val, _values, result)
     result = Lrama::Lexer::Token::Ident.new(s_value: val[0])
    result
  end
.,.,

def _reduce_none(val, _values, result)
  val[0]
end

  end   # class Parser
end   # module Lrama

# === END: lrama/parser.rb ===
# require_relative "lrama/report"

# === BEGIN: lrama/report.rb ===


# require_relative 'report/duration'
# require_relative 'report/profile'

# === BEGIN: lrama/report/profile.rb ===


module Lrama
  class Report
    module Profile
      # See "Profiling Lrama" in README.md for how to use.
      def self.report_profile
        require "stackprof"

        StackProf.run(mode: :cpu, raw: true, out: 'tmp/stackprof-cpu-myapp.dump') do
          yield
        end
      end
    end
  end
end

# === END: lrama/report/profile.rb ===

# === END: lrama/report.rb ===
# require_relative "lrama/state"

# === BEGIN: lrama/state.rb ===


# require_relative "state/reduce"

# === BEGIN: lrama/state/reduce.rb ===


module Lrama
  class State
    class Reduce
      # https://www.gnu.org/software/bison/manual/html_node/Default-Reductions.html
      attr_reader :item, :look_ahead, :not_selected_symbols
      attr_accessor :default_reduction

      def initialize(item)
        @item = item
        @look_ahead = nil
        @not_selected_symbols = []
      end

      def rule
        @item.rule
      end

      def look_ahead=(look_ahead)
        @look_ahead = look_ahead.freeze
      end

      def add_not_selected_symbol(sym)
        @not_selected_symbols << sym
      end

      def selected_look_ahead
        if look_ahead
          look_ahead - @not_selected_symbols
        else
          []
        end
      end
    end
  end
end

# === END: lrama/state/reduce.rb ===
# require_relative "state/reduce_reduce_conflict"

# === BEGIN: lrama/state/reduce_reduce_conflict.rb ===


module Lrama
  class State
    class ReduceReduceConflict < Struct.new(:symbols, :reduce1, :reduce2, keyword_init: true)
      def type
        :reduce_reduce
      end
    end
  end
end

# === END: lrama/state/reduce_reduce_conflict.rb ===
# require_relative "state/resolved_conflict"

# === BEGIN: lrama/state/resolved_conflict.rb ===


module Lrama
  class State
    # * symbol: A symbol under discussion
    # * reduce: A reduce under discussion
    # * which: For which a conflict is resolved. :shift, :reduce or :error (for nonassociative)
    class ResolvedConflict < Struct.new(:symbol, :reduce, :which, :same_prec, keyword_init: true)
      def report_message
        s = symbol.display_name
        r = reduce.rule.precedence_sym&.display_name
        case
        when which == :shift && same_prec
          msg = "resolved as #{which} (%right #{s})"
        when which == :shift
          msg = "resolved as #{which} (#{r} < #{s})"
        when which == :reduce && same_prec
          msg = "resolved as #{which} (%left #{s})"
        when which == :reduce
          msg = "resolved as #{which} (#{s} < #{r})"
        when which == :error
          msg = "resolved as an #{which} (%nonassoc #{s})"
        else
          raise "Unknown direction. #{self}"
        end

        "Conflict between rule #{reduce.rule.id} and token #{s} #{msg}."
      end
    end
  end
end

# === END: lrama/state/resolved_conflict.rb ===
# require_relative "state/shift"

# === BEGIN: lrama/state/shift.rb ===


module Lrama
  class State
    class Shift
      attr_reader :next_sym, :next_items
      attr_accessor :not_selected

      def initialize(next_sym, next_items)
        @next_sym = next_sym
        @next_items = next_items
      end
    end
  end
end

# === END: lrama/state/shift.rb ===
# require_relative "state/shift_reduce_conflict"

# === BEGIN: lrama/state/shift_reduce_conflict.rb ===


module Lrama
  class State
    class ShiftReduceConflict < Struct.new(:symbols, :shift, :reduce, keyword_init: true)
      def type
        :shift_reduce
      end
    end
  end
end

# === END: lrama/state/shift_reduce_conflict.rb ===

module Lrama
  class State
    attr_reader :id, :accessing_symbol, :kernels, :conflicts, :resolved_conflicts,
                :default_reduction_rule, :closure, :items
    attr_accessor :shifts, :reduces, :ielr_isocores, :lalr_isocore

    def initialize(id, accessing_symbol, kernels)
      @id = id
      @accessing_symbol = accessing_symbol
      @kernels = kernels.freeze
      @items = @kernels
      # Manage relationships between items to state
      # to resolve next state
      @items_to_state = {}
      @conflicts = []
      @resolved_conflicts = []
      @default_reduction_rule = nil
      @predecessors = []
      @lalr_isocore = self
      @ielr_isocores = [self]
      @internal_dependencies = {}
      @successor_dependencies = {}
      @always_follows = {}
    end

    def closure=(closure)
      @closure = closure
      @items = @kernels + @closure
    end

    def non_default_reduces
      reduces.reject do |reduce|
        reduce.rule == @default_reduction_rule
      end
    end

    def compute_shifts_reduces
      _shifts = {}
      reduces = []
      items.each do |item|
        # TODO: Consider what should be pushed
        if item.end_of_rule?
          reduces << Reduce.new(item)
        else
          key = item.next_sym
          _shifts[key] ||= []
          _shifts[key] << item.new_by_next_position
        end
      end

      # It seems Bison 3.8.2 iterates transitions order by symbol number
      shifts = _shifts.sort_by do |next_sym, new_items|
        next_sym.number
      end.map do |next_sym, new_items|
        Shift.new(next_sym, new_items.flatten)
      end
      self.shifts = shifts.freeze
      self.reduces = reduces.freeze
    end

    def set_items_to_state(items, next_state)
      @items_to_state[items] = next_state
    end

    def set_look_ahead(rule, look_ahead)
      reduce = reduces.find do |r|
        r.rule == rule
      end

      reduce.look_ahead = look_ahead
    end

    def nterm_transitions
      @nterm_transitions ||= transitions.select {|shift, _| shift.next_sym.nterm? }
    end

    def term_transitions
      @term_transitions ||= transitions.select {|shift, _| shift.next_sym.term? }
    end

    def transitions
      @transitions ||= shifts.map {|shift| [shift, @items_to_state[shift.next_items]] }
    end

    def update_transition(shift, next_state)
      set_items_to_state(shift.next_items, next_state)
      next_state.append_predecessor(self)
      clear_transitions_cache
    end

    def clear_transitions_cache
      @nterm_transitions = nil
      @term_transitions = nil
      @transitions = nil
    end

    def selected_term_transitions
      term_transitions.reject do |shift, next_state|
        shift.not_selected
      end
    end

    # Move to next state by sym
    def transition(sym)
      result = nil

      if sym.term?
        term_transitions.each do |shift, next_state|
          term = shift.next_sym
          result = next_state if term == sym
        end
      else
        nterm_transitions.each do |shift, next_state|
          nterm = shift.next_sym
          result = next_state if nterm == sym
        end
      end

      raise "Can not transit by #{sym} #{self}" if result.nil?

      result
    end

    def find_reduce_by_item!(item)
      reduces.find do |r|
        r.item == item
      end || (raise "reduce is not found. #{item}")
    end

    def default_reduction_rule=(default_reduction_rule)
      @default_reduction_rule = default_reduction_rule

      reduces.each do |r|
        if r.rule == default_reduction_rule
          r.default_reduction = true
        end
      end
    end

    def has_conflicts?
      !@conflicts.empty?
    end

    def sr_conflicts
      @conflicts.select do |conflict|
        conflict.type == :shift_reduce
      end
    end

    def rr_conflicts
      @conflicts.select do |conflict|
        conflict.type == :reduce_reduce
      end
    end

    def propagate_lookaheads(next_state)
      next_state.kernels.map {|item|
        lookahead_sets =
          if item.position == 1
            goto_follow_set(item.lhs)
          else
            kernel = kernels.find {|k| k.predecessor_item_of?(item) }
            item_lookahead_set[kernel]
          end

        [item, lookahead_sets & next_state.lookahead_set_filters[item]]
      }.to_h
    end

    def lookaheads_recomputed
      !@item_lookahead_set.nil?
    end

    def compatible_lookahead?(filtered_lookahead)
      !lookaheads_recomputed ||
        @lalr_isocore.annotation_list.all? {|token, actions|
          a = dominant_contribution(token, actions, item_lookahead_set)
          b = dominant_contribution(token, actions, filtered_lookahead)
          a.nil? || b.nil? || a == b
        }
    end

    def lookahead_set_filters
      kernels.map {|kernel|
        [kernel,
         @lalr_isocore.annotation_list.select {|token, actions|
           token.term? && actions.any? {|action, contributions|
             !contributions.nil? && contributions.key?(kernel) && contributions[kernel]
           }
         }.map {|token, _| token }
        ]
      }.to_h
    end

    def dominant_contribution(token, actions, lookaheads)
      a = actions.select {|action, contributions|
        contributions.nil? || contributions.any? {|item, contributed| contributed && lookaheads[item].include?(token) }
      }.map {|action, _| action }
      return nil if a.empty?
      a.reject {|action|
        if action.is_a?(State::Shift)
          action.not_selected
        elsif action.is_a?(State::Reduce)
          action.not_selected_symbols.include?(token)
        end
      }
    end

    def inadequacy_list
      return @inadequacy_list if @inadequacy_list

      shift_contributions = shifts.map {|shift|
        [shift.next_sym, [shift]]
      }.to_h
      reduce_contributions = reduces.map {|reduce|
        (reduce.look_ahead || []).map {|sym|
          [sym, [reduce]]
        }.to_h
      }.reduce(Hash.new([])) {|hash, cont|
        hash.merge(cont) {|_, a, b| a | b }
      }

      list = shift_contributions.merge(reduce_contributions) {|_, a, b| a | b }
      @inadequacy_list = list.select {|token, actions| token.term? && actions.size > 1 }
    end

    def annotation_list
      return @annotation_list if @annotation_list

      @annotation_list = annotate_manifestation
      @annotation_list = @items_to_state.values.map {|next_state| next_state.annotate_predecessor(self) }
        .reduce(@annotation_list) {|result, annotations|
          result.merge(annotations) {|_, actions_a, actions_b|
            if actions_a.nil? || actions_b.nil?
              actions_a || actions_b
            else
              actions_a.merge(actions_b) {|_, contributions_a, contributions_b|
                if contributions_a.nil? || contributions_b.nil?
                  next contributions_a || contributions_b
                end

                contributions_a.merge(contributions_b) {|_, contributed_a, contributed_b|
                  contributed_a || contributed_b
                }
              }
            end
          }
        }
    end

    def annotate_manifestation
      inadequacy_list.transform_values {|actions|
        actions.map {|action|
          if action.is_a?(Shift)
            [action, nil]
          elsif action.is_a?(Reduce)
            if action.rule.empty_rule?
              [action, lhs_contributions(action.rule.lhs, inadequacy_list.key(actions))]
            else
              contributions = kernels.map {|kernel| [kernel, kernel.rule == action.rule && kernel.end_of_rule?] }.to_h
              [action, contributions]
            end
          end
        }.to_h
      }
    end

    def annotate_predecessor(predecessor)
      annotation_list.transform_values {|actions|
        token = annotation_list.key(actions)
        actions.transform_values {|inadequacy|
          next nil if inadequacy.nil?
          lhs_adequacy = kernels.any? {|kernel|
            inadequacy[kernel] && kernel.position == 1 && predecessor.lhs_contributions(kernel.lhs, token).nil?
          }
          if lhs_adequacy
            next nil
          else
            predecessor.kernels.map {|pred_k|
              [pred_k, kernels.any? {|k|
                inadequacy[k] && (
                  pred_k.predecessor_item_of?(k) && predecessor.item_lookahead_set[pred_k].include?(token) ||
                  k.position == 1 && predecessor.lhs_contributions(k.lhs, token)[pred_k]
                )
              }]
            }.to_h
          end
        }
      }
    end

    def lhs_contributions(sym, token)
      shift, next_state = nterm_transitions.find {|sh, _| sh.next_sym == sym }
      if always_follows(shift, next_state).include?(token)
        nil
      else
        kernels.map {|kernel| [kernel, follow_kernel_items(shift, next_state, kernel) && item_lookahead_set[kernel].include?(token)] }.to_h
      end
    end

    def follow_kernel_items(shift, next_state, kernel)
      queue = [[self, shift, next_state]]
      until queue.empty?
        st, sh, next_st = queue.pop
        return true if kernel.next_sym == sh.next_sym && kernel.symbols_after_transition.all?(&:nullable)
        st.internal_dependencies(sh, next_st).each {|v| queue << v }
      end
      false
    end

    def item_lookahead_set
      return @item_lookahead_set if @item_lookahead_set

      kernels.map {|item|
        value =
          if item.lhs.accept_symbol?
            []
          elsif item.position > 1
            prev_items = predecessors_with_item(item)
            prev_items.map {|st, i| st.item_lookahead_set[i] }.reduce([]) {|acc, syms| acc |= syms }
          elsif item.position == 1
            prev_state = @predecessors.find {|p| p.shifts.any? {|shift| shift.next_sym == item.lhs } }
            shift, next_state = prev_state.nterm_transitions.find {|shift, _| shift.next_sym == item.lhs }
            prev_state.goto_follows(shift, next_state)
          end
        [item, value]
      }.to_h
    end

    def item_lookahead_set=(k)
      @item_lookahead_set = k
    end

    def predecessors_with_item(item)
      result = []
      @predecessors.each do |pre|
        pre.items.each do |i|
          result << [pre, i] if i.predecessor_item_of?(item)
        end
      end
      result
    end

    def append_predecessor(prev_state)
      @predecessors << prev_state
      @predecessors.uniq!
    end

    def goto_follow_set(nterm_token)
      return [] if nterm_token.accept_symbol?
      shift, next_state = @lalr_isocore.nterm_transitions.find {|sh, _| sh.next_sym == nterm_token }

      @kernels
        .select {|kernel| follow_kernel_items(shift, next_state, kernel) }
        .map {|kernel| item_lookahead_set[kernel] }
        .reduce(always_follows(shift, next_state)) {|result, terms| result |= terms }
    end

    def goto_follows(shift, next_state)
      queue = internal_dependencies(shift, next_state) + predecessor_dependencies(shift, next_state)
      terms = always_follows(shift, next_state)
      until queue.empty?
        st, sh, next_st = queue.pop
        terms |= st.always_follows(sh, next_st)
        st.internal_dependencies(sh, next_st).each {|v| queue << v }
        st.predecessor_dependencies(sh, next_st).each {|v| queue << v }
      end
      terms
    end

    def always_follows(shift, next_state)
      return @always_follows[[shift, next_state]] if @always_follows[[shift, next_state]]

      queue = internal_dependencies(shift, next_state) + successor_dependencies(shift, next_state)
      terms = []
      until queue.empty?
        st, sh, next_st = queue.pop
        terms |= next_st.term_transitions.map {|sh, _| sh.next_sym }
        st.internal_dependencies(sh, next_st).each {|v| queue << v }
        st.successor_dependencies(sh, next_st).each {|v| queue << v }
      end
      @always_follows[[shift, next_state]] = terms
    end

    def internal_dependencies(shift, next_state)
      return @internal_dependencies[[shift, next_state]] if @internal_dependencies[[shift, next_state]]

      syms = @items.select {|i|
        i.next_sym == shift.next_sym && i.symbols_after_transition.all?(&:nullable) && i.position == 0
      }.map(&:lhs).uniq
      @internal_dependencies[[shift, next_state]] = nterm_transitions.select {|sh, _| syms.include?(sh.next_sym) }.map {|goto| [self, *goto] }
    end

    def successor_dependencies(shift, next_state)
      return @successor_dependencies[[shift, next_state]] if @successor_dependencies[[shift, next_state]]

      @successor_dependencies[[shift, next_state]] =
        next_state.nterm_transitions
        .select {|next_shift, _| next_shift.next_sym.nullable }
        .map {|transition| [next_state, *transition] }
    end

    def predecessor_dependencies(shift, next_state)
      state_items = []
      @kernels.select {|kernel|
        kernel.next_sym == shift.next_sym && kernel.symbols_after_transition.all?(&:nullable)
      }.each do |item|
        queue = predecessors_with_item(item)
        until queue.empty?
          st, i = queue.pop
          if i.position == 0
            state_items << [st, i]
          else
            st.predecessors_with_item(i).each {|v| queue << v }
          end
        end
      end

      state_items.map {|state, item|
        sh, next_st = state.nterm_transitions.find {|shi, _| shi.next_sym == item.lhs }
        [state, sh, next_st]
      }
    end
  end
end

# === END: lrama/state.rb ===
# require_relative "lrama/states"

# === BEGIN: lrama/states.rb ===


# require "forwardable" # Commented out for Wasm compatibility
# require_relative "report/duration"
# require_relative "states/item"

# === BEGIN: lrama/states/item.rb ===


# TODO: Validate position is not over rule rhs

# require "forwardable" # Commented out for Wasm compatibility

module Lrama
  class States
    class Item < Struct.new(:rule, :position, keyword_init: true)
      extend Forwardable

      def_delegators "rule", :lhs, :rhs

      # Optimization for States#setup_state
      def hash
        [rule_id, position].hash
      end

      def rule_id
        rule.id
      end

      def empty_rule?
        rule.empty_rule?
      end

      def number_of_rest_symbols
        rhs.count - position
      end

      def next_sym
        rhs[position]
      end

      def next_next_sym
        rhs[position + 1]
      end

      def previous_sym
        rhs[position - 1]
      end

      def end_of_rule?
        rhs.count == position
      end

      def beginning_of_rule?
        position == 0
      end

      def start_item?
        rule.initial_rule? && beginning_of_rule?
      end

      def new_by_next_position
        Item.new(rule: rule, position: position + 1)
      end

      def symbols_before_dot # steep:ignore
        rhs[0...position]
      end

      def symbols_after_dot # steep:ignore
        rhs[position..-1]
      end

      def symbols_after_transition
        rhs[position+1..-1]
      end

      def to_s
        "#{lhs.id.s_value}: #{display_name}"
      end

      def display_name
        r = rhs.map(&:display_name).insert(position, "•").join(" ")
        "#{r}  (rule #{rule_id})"
      end

      # Right after position
      def display_rest
        r = symbols_after_dot.map(&:display_name).join(" ")
        ". #{r}  (rule #{rule_id})"
      end

      def predecessor_item_of?(other_item)
        rule == other_item.rule && position == other_item.position - 1
      end
    end
  end
end

# === END: lrama/states/item.rb ===

module Lrama
  # States is passed to a template file
  #
  # "Efficient Computation of LALR(1) Look-Ahead Sets"
  #   https://dl.acm.org/doi/pdf/10.1145/69622.357187
  class States
    extend Forwardable
    include Lrama::Report::Duration

    def_delegators "@grammar", :symbols, :terms, :nterms, :rules,
      :accept_symbol, :eof_symbol, :undef_symbol, :find_symbol_by_s_value!

    attr_reader :states, :reads_relation, :includes_relation, :lookback_relation

    def initialize(grammar, trace_state: false)
      @grammar = grammar
      @trace_state = trace_state

      @states = []

      # `DR(p, A) = {t ∈ T | p -(A)-> r -(t)-> }`
      #   where p is state, A is nterm, t is term.
      #
      # `@direct_read_sets` is a hash whose
      # key is [state.id, nterm.token_id],
      # value is bitmap of term.
      @direct_read_sets = {}

      # Reads relation on nonterminal transitions (pair of state and nterm)
      # `(p, A) reads (r, C) iff p -(A)-> r -(C)-> and C =>* ε`
      #   where p, r are state, A, C are nterm.
      #
      # `@reads_relation` is a hash whose
      # key is [state.id, nterm.token_id],
      # value is array of [state.id, nterm.token_id].
      @reads_relation = {}

      # `Read(p, A) =s DR(p, A) ∪ ∪{Read(r, C) | (p, A) reads (r, C)}`
      #
      # `@read_sets` is a hash whose
      # key is [state.id, nterm.token_id],
      # value is bitmap of term.
      @read_sets = {}

      # `(p, A) includes (p', B) iff B -> βAγ, γ =>* ε, p' -(β)-> p`
      #   where p, p' are state, A, B are nterm, β, γ is sequence of symbol.
      #
      # `@includes_relation` is a hash whose
      # key is [state.id, nterm.token_id],
      # value is array of [state.id, nterm.token_id].
      @includes_relation = {}

      # `(q, A -> ω) lookback (p, A) iff p -(ω)-> q`
      #   where p, q are state, A -> ω is rule, A is nterm, ω is sequence of symbol.
      #
      # `@lookback_relation` is a hash whose
      # key is [state.id, rule.id],
      # value is array of [state.id, nterm.token_id].
      @lookback_relation = {}

      # `Follow(p, A) =s Read(p, A) ∪ ∪{Follow(p', B) | (p, A) includes (p', B)}`
      #
      # `@follow_sets` is a hash whose
      # key is [state.id, rule.id],
      # value is bitmap of term.
      @follow_sets = {}

      # `LA(q, A -> ω) = ∪{Follow(p, A) | (q, A -> ω) lookback (p, A)`
      #
      # `@la` is a hash whose
      # key is [state.id, rule.id],
      # value is bitmap of term.
      @la = {}
    end

    def compute
      # Look Ahead Sets
      report_duration(:compute_lr0_states) { compute_lr0_states }
      report_duration(:compute_direct_read_sets) { compute_direct_read_sets }
      report_duration(:compute_reads_relation) { compute_reads_relation }
      report_duration(:compute_read_sets) { compute_read_sets }
      report_duration(:compute_includes_relation) { compute_includes_relation }
      report_duration(:compute_lookback_relation) { compute_lookback_relation }
      report_duration(:compute_follow_sets) { compute_follow_sets }
      report_duration(:compute_look_ahead_sets) { compute_look_ahead_sets }

      # Conflicts
      report_duration(:compute_conflicts) { compute_conflicts }

      report_duration(:compute_default_reduction) { compute_default_reduction }
    end

    def compute_ielr
      report_duration(:split_states) { split_states }
      report_duration(:compute_direct_read_sets) { compute_direct_read_sets }
      report_duration(:compute_reads_relation) { compute_reads_relation }
      report_duration(:compute_read_sets) { compute_read_sets }
      report_duration(:compute_includes_relation) { compute_includes_relation }
      report_duration(:compute_lookback_relation) { compute_lookback_relation }
      report_duration(:compute_follow_sets) { compute_follow_sets }
      report_duration(:compute_look_ahead_sets) { compute_look_ahead_sets }
      report_duration(:compute_conflicts) { compute_conflicts }

      report_duration(:compute_default_reduction) { compute_default_reduction }
    end

    def reporter
      StatesReporter.new(self)
    end

    def states_count
      @states.count
    end

    def direct_read_sets
      @direct_read_sets.transform_values do |v|
        bitmap_to_terms(v)
      end
    end

    def read_sets
      @read_sets.transform_values do |v|
        bitmap_to_terms(v)
      end
    end

    def follow_sets
      @follow_sets.transform_values do |v|
        bitmap_to_terms(v)
      end
    end

    def la
      @la.transform_values do |v|
        bitmap_to_terms(v)
      end
    end

    def sr_conflicts_count
      @sr_conflicts_count ||= @states.flat_map(&:sr_conflicts).count
    end

    def rr_conflicts_count
      @rr_conflicts_count ||= @states.flat_map(&:rr_conflicts).count
    end

    private

    def trace_state
      if @trace_state
        yield STDERR
      end
    end

    def create_state(accessing_symbol, kernels, states_created)
      # A item can appear in some states,
      # so need to use `kernels` (not `kernels.first`) as a key.
      #
      # For example...
      #
      # %%
      # program: '+' strings_1
      #        | '-' strings_2
      #        ;
      #
      # strings_1: string_1
      #          ;
      #
      # strings_2: string_1
      #          | string_2
      #          ;
      #
      # string_1: string
      #         ;
      #
      # string_2: string '+'
      #         ;
      #
      # string: tSTRING
      #       ;
      # %%
      #
      # For these grammar, there are 2 states
      #
      # State A
      #    string_1: string •
      #
      # State B
      #    string_1: string •
      #    string_2: string • '+'
      #
      return [states_created[kernels], false] if states_created[kernels]

      state = State.new(@states.count, accessing_symbol, kernels)
      @states << state
      states_created[kernels] = state

      return [state, true]
    end

    def setup_state(state)
      # closure
      closure = []
      visited = {}
      queued = {}
      items = state.kernels.dup

      items.each do |item|
        queued[item] = true
      end

      while (item = items.shift) do
        visited[item] = true

        if (sym = item.next_sym) && sym.nterm?
          @grammar.find_rules_by_symbol!(sym).each do |rule|
            i = Item.new(rule: rule, position: 0)
            next if queued[i]
            closure << i
            items << i
            queued[i] = true
          end
        end
      end

      state.closure = closure.sort_by {|i| i.rule.id }

      # Trace
      trace_state do |out|
        out << "Closure: input\n"
        state.kernels.each do |item|
          out << "  #{item.display_rest}\n"
        end
        out << "\n\n"
        out << "Closure: output\n"
        state.items.each do |item|
          out << "  #{item.display_rest}\n"
        end
        out << "\n\n"
      end

      # shift & reduce
      state.compute_shifts_reduces
    end

    def enqueue_state(states, state)
      # Trace
      previous = state.kernels.first.previous_sym
      trace_state do |out|
        out << sprintf("state_list_append (state = %d, symbol = %d (%s))\n",
          @states.count, previous.number, previous.display_name)
      end

      states << state
    end

    def compute_lr0_states
      # State queue
      states = []
      states_created = {}

      state, _ = create_state(symbols.first, [Item.new(rule: @grammar.rules.first, position: 0)], states_created)
      enqueue_state(states, state)

      while (state = states.shift) do
        # Trace
        #
        # Bison 3.8.2 renders "(reached by "end-of-input")" for State 0 but
        # I think it is not correct...
        previous = state.kernels.first.previous_sym
        trace_state do |out|
          out << "Processing state #{state.id} (reached by #{previous.display_name})\n"
        end

        setup_state(state)

        state.shifts.each do |shift|
          new_state, created = create_state(shift.next_sym, shift.next_items, states_created)
          state.set_items_to_state(shift.next_items, new_state)
          if created
            enqueue_state(states, new_state)
            new_state.append_predecessor(state)
          end
        end
      end
    end

    def nterm_transitions
      a = []

      @states.each do |state|
        state.nterm_transitions.each do |shift, next_state|
          nterm = shift.next_sym
          a << [state, nterm, next_state]
        end
      end

      a
    end

    def compute_direct_read_sets
      @states.each do |state|
        state.nterm_transitions.each do |shift, next_state|
          nterm = shift.next_sym

          ary = next_state.term_transitions.map do |shift, _|
            shift.next_sym.number
          end

          key = [state.id, nterm.token_id]
          @direct_read_sets[key] = Bitmap.from_array(ary)
        end
      end
    end

    def compute_reads_relation
      @states.each do |state|
        state.nterm_transitions.each do |shift, next_state|
          nterm = shift.next_sym
          next_state.nterm_transitions.each do |shift2, _next_state2|
            nterm2 = shift2.next_sym
            if nterm2.nullable
              key = [state.id, nterm.token_id]
              @reads_relation[key] ||= []
              @reads_relation[key] << [next_state.id, nterm2.token_id]
            end
          end
        end
      end
    end

    def compute_read_sets
      sets = nterm_transitions.map do |state, nterm, next_state|
        [state.id, nterm.token_id]
      end

      @read_sets = Digraph.new(sets, @reads_relation, @direct_read_sets).compute
    end

    # Execute transition of state by symbols
    # then return final state.
    def transition(state, symbols)
      symbols.each do |sym|
        state = state.transition(sym)
      end

      state
    end

    def compute_includes_relation
      @states.each do |state|
        state.nterm_transitions.each do |shift, next_state|
          nterm = shift.next_sym
          @grammar.find_rules_by_symbol!(nterm).each do |rule|
            i = rule.rhs.count - 1

            while (i > -1) do
              sym = rule.rhs[i]

              break if sym.term?
              state2 = transition(state, rule.rhs[0...i])
              # p' = state, B = nterm, p = state2, A = sym
              key = [state2.id, sym.token_id]
              # TODO: need to omit if state == state2 ?
              @includes_relation[key] ||= []
              @includes_relation[key] << [state.id, nterm.token_id]
              break unless sym.nullable
              i -= 1
            end
          end
        end
      end
    end

    def compute_lookback_relation
      @states.each do |state|
        state.nterm_transitions.each do |shift, next_state|
          nterm = shift.next_sym
          @grammar.find_rules_by_symbol!(nterm).each do |rule|
            state2 = transition(state, rule.rhs)
            # p = state, A = nterm, q = state2, A -> ω = rule
            key = [state2.id, rule.id]
            @lookback_relation[key] ||= []
            @lookback_relation[key] << [state.id, nterm.token_id]
          end
        end
      end
    end

    def compute_follow_sets
      sets = nterm_transitions.map do |state, nterm, next_state|
        [state.id, nterm.token_id]
      end

      @follow_sets = Digraph.new(sets, @includes_relation, @read_sets).compute
    end

    def compute_look_ahead_sets
      @states.each do |state|
        rules.each do |rule|
          ary = @lookback_relation[[state.id, rule.id]]
          next unless ary

          ary.each do |state2_id, nterm_token_id|
            # q = state, A -> ω = rule, p = state2, A = nterm
            follows = @follow_sets[[state2_id, nterm_token_id]]

            next if follows == 0

            key = [state.id, rule.id]
            @la[key] ||= 0
            look_ahead = @la[key] | follows
            @la[key] |= look_ahead

            # No risk of conflict when
            # * the state only has single reduce
            # * the state only has nterm_transitions (GOTO)
            next if state.reduces.count == 1 && state.term_transitions.count == 0

            state.set_look_ahead(rule, bitmap_to_terms(look_ahead))
          end
        end
      end
    end

    def bitmap_to_terms(bit)
      ary = Bitmap.to_array(bit)
      ary.map do |i|
        @grammar.find_symbol_by_number!(i)
      end
    end

    def compute_conflicts
      compute_shift_reduce_conflicts
      compute_reduce_reduce_conflicts
    end

    def compute_shift_reduce_conflicts
      states.each do |state|
        state.shifts.each do |shift|
          state.reduces.each do |reduce|
            sym = shift.next_sym

            next unless reduce.look_ahead
            next unless reduce.look_ahead.include?(sym)

            # Shift/Reduce conflict
            shift_prec = sym.precedence
            reduce_prec = reduce.item.rule.precedence

            # Can resolve only when both have prec
            unless shift_prec && reduce_prec
              state.conflicts << State::ShiftReduceConflict.new(symbols: [sym], shift: shift, reduce: reduce)
              next
            end

            case
            when shift_prec < reduce_prec
              # Reduce is selected
              state.resolved_conflicts << State::ResolvedConflict.new(symbol: sym, reduce: reduce, which: :reduce)
              shift.not_selected = true
              next
            when shift_prec > reduce_prec
              # Shift is selected
              state.resolved_conflicts << State::ResolvedConflict.new(symbol: sym, reduce: reduce, which: :shift)
              reduce.add_not_selected_symbol(sym)
              next
            end

            # shift_prec == reduce_prec, then check associativity
            case sym.precedence.type
            when :precedence
              # %precedence only specifies precedence and not specify associativity
              # then a conflict is unresolved if precedence is same.
              state.conflicts << State::ShiftReduceConflict.new(symbols: [sym], shift: shift, reduce: reduce)
              next
            when :right
              # Shift is selected
              state.resolved_conflicts << State::ResolvedConflict.new(symbol: sym, reduce: reduce, which: :shift, same_prec: true)
              reduce.add_not_selected_symbol(sym)
              next
            when :left
              # Reduce is selected
              state.resolved_conflicts << State::ResolvedConflict.new(symbol: sym, reduce: reduce, which: :reduce, same_prec: true)
              shift.not_selected = true
              next
            when :nonassoc
              # Can not resolve
              #
              # nonassoc creates "run-time" error, precedence creates "compile-time" error.
              # Then omit both the shift and reduce.
              #
              # https://www.gnu.org/software/bison/manual/html_node/Using-Precedence.html
              state.resolved_conflicts << State::ResolvedConflict.new(symbol: sym, reduce: reduce, which: :error)
              shift.not_selected = true
              reduce.add_not_selected_symbol(sym)
            else
              raise "Unknown precedence type. #{sym}"
            end
          end
        end
      end
    end

    def compute_reduce_reduce_conflicts
      states.each do |state|
        count = state.reduces.count

        (0...count).each do |i|
          reduce1 = state.reduces[i]
          next if reduce1.look_ahead.nil?

          ((i+1)...count).each do |j|
            reduce2 = state.reduces[j]
            next if reduce2.look_ahead.nil?

            intersection = reduce1.look_ahead & reduce2.look_ahead

            unless intersection.empty?
              state.conflicts << State::ReduceReduceConflict.new(symbols: intersection, reduce1: reduce1, reduce2: reduce2)
            end
          end
        end
      end
    end

    def compute_default_reduction
      states.each do |state|
        next if state.reduces.empty?
        # Do not set, if conflict exist
        next unless state.conflicts.empty?
        # Do not set, if shift with `error` exists.
        next if state.shifts.map(&:next_sym).include?(@grammar.error_symbol)

        state.default_reduction_rule = state.reduces.map do |r|
          [r.rule, r.rule.id, (r.look_ahead || []).count]
        end.min_by do |rule, rule_id, count|
          [-count, rule_id]
        end.first
      end
    end

    def split_states
      @states.each do |state|
        state.transitions.each do |shift, next_state|
          compute_state(state, shift, next_state)
        end
      end
    end

    def merge_lookaheads(state, filtered_lookaheads)
      return if state.kernels.all? {|item| (filtered_lookaheads[item] - state.item_lookahead_set[item]).empty? }

      state.item_lookahead_set = state.item_lookahead_set.merge {|_, v1, v2| v1 | v2 }
      state.transitions.each do |shift, next_state|
        next if next_state.lookaheads_recomputed
        compute_state(state, shift, next_state)
      end
    end

    def compute_state(state, shift, next_state)
      filtered_lookaheads = state.propagate_lookaheads(next_state)
      s = next_state.ielr_isocores.find {|st| st.compatible_lookahead?(filtered_lookaheads) }

      if s.nil?
        s = next_state.ielr_isocores.last
        new_state = State.new(@states.count, s.accessing_symbol, s.kernels)
        new_state.closure = s.closure
        new_state.compute_shifts_reduces
        s.transitions.each do |sh, next_state|
          new_state.set_items_to_state(sh.next_items, next_state)
        end
        @states << new_state
        new_state.lalr_isocore = s
        s.ielr_isocores << new_state
        s.ielr_isocores.each do |st|
          st.ielr_isocores = s.ielr_isocores
        end
        new_state.item_lookahead_set = filtered_lookaheads
        state.update_transition(shift, new_state)
      elsif(!s.lookaheads_recomputed)
        s.item_lookahead_set = filtered_lookaheads
      else
        state.update_transition(shift, s)
        merge_lookaheads(s, filtered_lookaheads)
      end
    end
  end
end

# === END: lrama/states.rb ===
# require_relative "lrama/states_reporter"

# === BEGIN: lrama/states_reporter.rb ===


module Lrama
  class StatesReporter
    include Lrama::Report::Duration

    def initialize(states)
      @states = states
    end

    def report(io, **options)
      report_duration(:report) do
        _report(io, **options)
      end
    end

    private

    def _report(io, grammar: false, rules: false, terms: false, states: false, itemsets: false, lookaheads: false, solved: false, counterexamples: false, verbose: false)
      report_unused_rules(io) if rules
      report_unused_terms(io) if terms
      report_conflicts(io)
      report_grammar(io) if grammar
      report_states(io, itemsets, lookaheads, solved, counterexamples, verbose)
    end

    def report_unused_terms(io)
      look_aheads = @states.states.each do |state|
        state.reduces.flat_map do |reduce|
          reduce.look_ahead unless reduce.look_ahead.nil?
        end
      end

      next_terms = @states.states.flat_map do |state|
        state.shifts.map(&:next_sym).select(&:term?)
      end

      unused_symbols = @states.terms.select do |term|
        !(look_aheads + next_terms).include?(term)
      end

      unless unused_symbols.empty?
        io << "#{unused_symbols.count} Unused Terms\n\n"
        unused_symbols.each_with_index do |term, index|
          io << sprintf("%5d %s\n", index, term.id.s_value)
        end
        io << "\n\n"
      end
    end

    def report_unused_rules(io)
      used_rules = @states.rules.flat_map(&:rhs)

      unused_rules = @states.rules.map(&:lhs).select do |rule|
        !used_rules.include?(rule) && rule.token_id != 0
      end

      unless unused_rules.empty?
        io << "#{unused_rules.count} Unused Rules\n\n"
        unused_rules.each_with_index do |rule, index|
          io << sprintf("%5d %s\n", index, rule.display_name)
        end
        io << "\n\n"
      end
    end

    def report_conflicts(io)
      has_conflict = false

      @states.states.each do |state|
        messages = []
        cs = state.conflicts.group_by(&:type)
        if cs[:shift_reduce]
          messages << "#{cs[:shift_reduce].count} shift/reduce"
        end

        if cs[:reduce_reduce]
          messages << "#{cs[:reduce_reduce].count} reduce/reduce"
        end

        unless messages.empty?
          has_conflict = true
          io << "State #{state.id} conflicts: #{messages.join(', ')}\n"
        end
      end

      if has_conflict
        io << "\n\n"
      end
    end

    def report_grammar(io)
      io << "Grammar\n"
      last_lhs = nil

      @states.rules.each do |rule|
        if rule.empty_rule?
          r = "ε"
        else
          r = rule.rhs.map(&:display_name).join(" ")
        end

        if rule.lhs == last_lhs
          io << sprintf("%5d %s| %s\n", rule.id, " " * rule.lhs.display_name.length, r)
        else
          io << "\n"
          io << sprintf("%5d %s: %s\n", rule.id, rule.lhs.display_name, r)
        end

        last_lhs = rule.lhs
      end
      io << "\n\n"
    end

    def report_states(io, itemsets, lookaheads, solved, counterexamples, verbose)
      if counterexamples
        cex = Counterexamples.new(@states)
      end

      @states.states.each do |state|
        # Report State
        io << "State #{state.id}\n\n"

        # Report item
        last_lhs = nil
        list = itemsets ? state.items : state.kernels
        list.sort_by {|i| [i.rule_id, i.position] }.each do |item|
          if item.empty_rule?
            r = "ε •"
          else
            r = item.rhs.map(&:display_name).insert(item.position, "•").join(" ")
          end
          if item.lhs == last_lhs
            l = " " * item.lhs.id.s_value.length + "|"
          else
            l = item.lhs.id.s_value + ":"
          end
          la = ""
          if lookaheads && item.end_of_rule?
            reduce = state.find_reduce_by_item!(item)
            look_ahead = reduce.selected_look_ahead
            unless look_ahead.empty?
              la = "  [#{look_ahead.map(&:display_name).join(", ")}]"
            end
          end
          last_lhs = item.lhs

          io << sprintf("%5i %s %s%s\n", item.rule_id, l, r, la)
        end
        io << "\n"

        # Report shifts
        tmp = state.term_transitions.reject do |shift, _|
          shift.not_selected
        end.map do |shift, next_state|
          [shift.next_sym, next_state.id]
        end
        max_len = tmp.map(&:first).map(&:display_name).map(&:length).max
        tmp.each do |term, state_id|
          io << "    #{term.display_name.ljust(max_len)}  shift, and go to state #{state_id}\n"
        end
        io << "\n" unless tmp.empty?

        # Report error caused by %nonassoc
        nl = false
        tmp = state.resolved_conflicts.select do |resolved|
          resolved.which == :error
        end.map do |error|
          error.symbol.display_name
        end
        max_len = tmp.map(&:length).max
        tmp.each do |name|
          nl = true
          io << "    #{name.ljust(max_len)}  error (nonassociative)\n"
        end
        io << "\n" unless tmp.empty?

        # Report reduces
        nl = false
        max_len = state.non_default_reduces.flat_map(&:look_ahead).compact.map(&:display_name).map(&:length).max || 0
        max_len = [max_len, "$default".length].max if state.default_reduction_rule
        ary = []

        state.non_default_reduces.each do |reduce|
          reduce.look_ahead.each do |term|
            ary << [term, reduce]
          end
        end

        ary.sort_by do |term, reduce|
          term.number
        end.each do |term, reduce|
          rule = reduce.item.rule
          io << "    #{term.display_name.ljust(max_len)}  reduce using rule #{rule.id} (#{rule.lhs.display_name})\n"
          nl = true
        end

        if (r = state.default_reduction_rule)
          nl = true
          s = "$default".ljust(max_len)

          if r.initial_rule?
            io << "    #{s}  accept\n"
          else
            io << "    #{s}  reduce using rule #{r.id} (#{r.lhs.display_name})\n"
          end
        end
        io << "\n" if nl

        # Report nonterminal transitions
        tmp = []
        max_len = 0
        state.nterm_transitions.each do |shift, next_state|
          nterm = shift.next_sym
          tmp << [nterm, next_state.id]
          max_len = [max_len, nterm.id.s_value.length].max
        end
        tmp.uniq!
        tmp.sort_by! do |nterm, state_id|
          nterm.number
        end
        tmp.each do |nterm, state_id|
          io << "    #{nterm.id.s_value.ljust(max_len)}  go to state #{state_id}\n"
        end
        io << "\n" unless tmp.empty?

        if solved
          # Report conflict resolutions
          state.resolved_conflicts.each do |resolved|
            io << "    #{resolved.report_message}\n"
          end
          io << "\n" unless state.resolved_conflicts.empty?
        end

        if counterexamples && state.has_conflicts?
          # Report counterexamples
          examples = cex.compute(state)
          examples.each do |example|
            label0 = example.type == :shift_reduce ? "shift/reduce" : "reduce/reduce"
            label1 = example.type == :shift_reduce ? "Shift derivation"  : "First Reduce derivation"
            label2 = example.type == :shift_reduce ? "Reduce derivation" : "Second Reduce derivation"

            io << "    #{label0} conflict on token #{example.conflict_symbol.id.s_value}:\n"
            io << "        #{example.path1_item}\n"
            io << "        #{example.path2_item}\n"
            io << "      #{label1}\n"
            example.derivations1.render_strings_for_report.each do |str|
              io << "        #{str}\n"
            end
            io << "      #{label2}\n"
            example.derivations2.render_strings_for_report.each do |str|
              io << "        #{str}\n"
            end
          end
        end

        if verbose
          # Report direct_read_sets
          io << "  [Direct Read sets]\n"
          direct_read_sets = @states.direct_read_sets
          @states.nterms.each do |nterm|
            terms = direct_read_sets[[state.id, nterm.token_id]]
            next unless terms
            next if terms.empty?

            str = terms.map {|sym| sym.id.s_value }.join(", ")
            io << "    read #{nterm.id.s_value}  shift #{str}\n"
          end
          io << "\n"

          # Report reads_relation
          io << "  [Reads Relation]\n"
          @states.nterms.each do |nterm|
            a = @states.reads_relation[[state.id, nterm.token_id]]
            next unless a

            a.each do |state_id2, nterm_id2|
              n = @states.nterms.find {|n| n.token_id == nterm_id2 }
              io << "    (State #{state_id2}, #{n.id.s_value})\n"
            end
          end
          io << "\n"

          # Report read_sets
          io << "  [Read sets]\n"
          read_sets = @states.read_sets
          @states.nterms.each do |nterm|
            terms = read_sets[[state.id, nterm.token_id]]
            next unless terms
            next if terms.empty?

            terms.each do |sym|
              io << "    #{sym.id.s_value}\n"
            end
          end
          io << "\n"

          # Report includes_relation
          io << "  [Includes Relation]\n"
          @states.nterms.each do |nterm|
            a = @states.includes_relation[[state.id, nterm.token_id]]
            next unless a

            a.each do |state_id2, nterm_id2|
              n = @states.nterms.find {|n| n.token_id == nterm_id2 }
              io << "    (State #{state.id}, #{nterm.id.s_value}) -> (State #{state_id2}, #{n.id.s_value})\n"
            end
          end
          io << "\n"

          # Report lookback_relation
          io << "  [Lookback Relation]\n"
          @states.rules.each do |rule|
            a = @states.lookback_relation[[state.id, rule.id]]
            next unless a

            a.each do |state_id2, nterm_id2|
              n = @states.nterms.find {|n| n.token_id == nterm_id2 }
              io << "    (Rule: #{rule.display_name}) -> (State #{state_id2}, #{n.id.s_value})\n"
            end
          end
          io << "\n"

          # Report follow_sets
          io << "  [Follow sets]\n"
          follow_sets = @states.follow_sets
          @states.nterms.each do |nterm|
            terms = follow_sets[[state.id, nterm.token_id]]

            next unless terms

            terms.each do |sym|
              io << "    #{nterm.id.s_value} -> #{sym.id.s_value}\n"
            end
          end
          io << "\n"

          # Report LA
          io << "  [Look-Ahead Sets]\n"
          tmp = []
          max_len = 0
          @states.rules.each do |rule|
            syms = @states.la[[state.id, rule.id]]
            next unless syms

            tmp << [rule, syms]
            max_len = ([max_len] + syms.map {|s| s.id.s_value.length }).max
          end
          tmp.each do |rule, syms|
            syms.each do |sym|
              io << "    #{sym.id.s_value.ljust(max_len)}  reduce using rule #{rule.id} (#{rule.lhs.id.s_value})\n"
            end
          end
          io << "\n" unless tmp.empty?
        end

        # End of Report State
        io << "\n"
      end
    end
  end
end

# === END: lrama/states_reporter.rb ===
# require_relative "lrama/trace_reporter"

# === BEGIN: lrama/trace_reporter.rb ===

# rbs_inline: enabled

module Lrama
  class TraceReporter
    # @rbs (Lrama::Grammar grammar) -> void
    def initialize(grammar)
      @grammar = grammar
    end

    # @rbs (**Hash[Symbol, bool] options) -> void
    def report(**options)
      _report(**options)
    end

    private

    # @rbs rules: (bool rules, bool actions, bool only_explicit_rules, **untyped _) -> void
    def _report(rules: false, actions: false, only_explicit_rules: false, **_)
      report_rules if rules && !only_explicit_rules
      report_only_explicit_rules if only_explicit_rules
      report_actions if actions
    end

    # @rbs () -> void
    def report_rules
      puts "Grammar rules:"
      @grammar.rules.each { |rule| puts rule.display_name }
    end

    # @rbs () -> void
    def report_only_explicit_rules
      puts "Grammar rules:"
      @grammar.rules.each do |rule|
        puts rule.display_name_without_action if rule.lhs.first_set.any?
      end
    end

    # @rbs () -> void
    def report_actions
      puts "Grammar rules with actions:"
      @grammar.rules.each { |rule| puts rule.with_actions }
    end
  end
end

# === END: lrama/trace_reporter.rb ===
# require_relative "lrama/version"

# === BEGIN: lrama/version.rb ===


module Lrama
  VERSION = "0.7.0".freeze
end

# === END: lrama/version.rb ===

# === END: lrama.rb ===