#!/usr/bin/env ruby
# frozen_string_literal: true

# Test script for lrama_bundle.rb

require_relative '../ruby/src/lrama_bundle'

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
