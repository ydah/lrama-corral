#!/usr/bin/env ruby
# frozen_string_literal: true

# Test script for the bundled Lrama runtime and browser-facing API.

require 'json'

require_relative '../ruby/src/lrama_api'

puts "=== Lrama Bundle Test ==="
puts ""

# Simple test grammar
test_grammar = <<~GRAMMAR
  %{
  // Calculator grammar test
  %}

  %token NUMBER
  %token PLUS MINUS
  %left PLUS MINUS

  %%

  expr: NUMBER
      | expr PLUS expr
      | expr MINUS expr
      ;

  %%
GRAMMAR

puts "Test grammar:"
puts test_grammar
puts ""

begin
  puts "Loading Lrama..."

  # Check if Lrama module is loaded
  unless defined?(Lrama)
    puts "ERROR: Lrama module not defined"
    exit 1
  end

  puts "Lrama version: #{Lrama::VERSION}"
  puts ""

  puts "Parsing test grammar..."

  # Parse the grammar
  parser = Lrama::Parser.new(test_grammar, "test.y")
  grammar = parser.parse
  grammar.prepare

  puts "SUCCESS: Grammar parsed successfully!"
  puts ""
  puts "Grammar information:"
  puts "  - Nonterminals: #{grammar.nterms.map(&:display_name).join(', ')}"
  puts "  - Terminals: #{grammar.terms.map(&:display_name).join(', ')}"
  puts "  - Rules: #{grammar.rules.count}"
  puts ""

  # Test basic properties
  puts "Testing grammar properties..."
  failures = []

  if grammar.nterms.any? { |t| t.display_name == 'expr' }
    puts "  ✓ Found nonterminal 'expr'"
  else
    puts "  ✗ Nonterminal 'expr' not found"
    failures << "Nonterminal 'expr' not found"
  end

  if grammar.terms.any? { |t| t.display_name == 'NUMBER' }
    puts "  ✓ Found terminal 'NUMBER'"
  else
    puts "  ✗ Terminal 'NUMBER' not found"
    failures << "Terminal 'NUMBER' not found"
  end

  if grammar.rules.count > 0
    puts "  ✓ Rules extracted: #{grammar.rules.count} rules"
  else
    puts "  ✗ No rules found"
    failures << "No rules found"
  end

  sample_paths = Dir[File.expand_path('../public/samples/*.y', __dir__)].sort
  sample_paths.each do |path|
    source = File.read(path)
    parser = Lrama::Parser.new(source, File.basename(path))
    sample_grammar = parser.parse
    sample_grammar.prepare

    if sample_grammar.rules.any?
      puts "  ✓ Sample parsed: #{File.basename(path)} (#{sample_grammar.rules.count} rules)"
    else
      puts "  ✗ Sample has no rules: #{File.basename(path)}"
      failures << "Sample has no rules: #{File.basename(path)}"
    end

    api_result = JSON.parse(LramaAPI.parse(source))
    grammar_info = api_result['grammar'] || {}

    unless api_result['success']
      puts "  ✗ API parse failed: #{File.basename(path)}"
      failures << "API parse failed: #{File.basename(path)}"
      next
    end

    [
      ['tokens', Array],
      ['nonterminals', Array],
      ['rules', Array],
      ['first_sets', Hash],
      ['follow_sets', Hash],
      ['state_transitions', Array],
      ['resolved_conflicts', Array]
    ].each do |field, expected_class|
      if grammar_info[field].is_a?(expected_class)
        puts "  ✓ API #{field}: #{File.basename(path)}"
      else
        puts "  ✗ API #{field} missing for #{File.basename(path)}"
        failures << "API #{field} missing for #{File.basename(path)}"
      end
    end
  end

  api_result = JSON.parse(LramaAPI.parse(test_grammar))
  grammar_info = api_result.fetch('grammar')
  token_names = grammar_info.fetch('tokens').map { |token| token.fetch('name') }
  rule_names = grammar_info.fetch('rules').map { |rule| rule.fetch('lhs') }

  unless token_names.include?('NUMBER')
    failures << "API tokens do not include NUMBER"
  end

  unless rule_names.include?('expr')
    failures << "API rules do not include expr"
  end

  unless grammar_info.fetch('first_sets').fetch('expr').include?('NUMBER')
    failures << "API FIRST(expr) does not include NUMBER"
  end

  number_token = grammar_info.fetch('tokens').find { |token| token.fetch('name') == 'NUMBER' }
  unless number_token && number_token.fetch('location').fetch('line') == 5
    failures << "API token locations do not include NUMBER declaration line"
  end

  expr_rule = grammar_info.fetch('rules').find { |rule| rule.fetch('lhs') == 'expr' }
  unless expr_rule && expr_rule.fetch('location').fetch('line') > 0
    failures << "API rule locations do not include expr rule line"
  end

  unless grammar_info.fetch('state_transitions').any? { |state|
    state.fetch('shifts').any? || state.fetch('gotos').any? || state.fetch('reduces').any?
  }
    failures << "API state transitions do not expose parser actions"
  end

  expect_rr_grammar = <<~GRAMMAR
    %expect-rr 1
    %token NUMBER

    %%

    expr: NUMBER
        ;

    %%
  GRAMMAR
  expect_rr_result = JSON.parse(LramaAPI.parse(expect_rr_grammar))
  if expect_rr_result['success']
    expectation = expect_rr_result.fetch('grammar').fetch('expectations').fetch('reduce_reduce')
    unless expectation.fetch('expected') == 1 && expectation.fetch('actual') == 0 && expectation.fetch('satisfied') == false
      failures << "API %expect-rr expectation mismatch"
    end
  else
    failures << "API failed to parse %expect-rr compatibility directive"
  end

  unless failures.empty?
    puts ""
    puts "=== Test Failures ==="
    failures.each { |failure| puts "  - #{failure}" }
    exit 1
  end

  puts ""
  puts "=== All Tests Passed! ==="

rescue => e
  puts "ERROR: #{e.class}: #{e.message}"
  puts ""
  puts "Backtrace:"
  puts e.backtrace.first(10).join("\n")
  exit 1
end
