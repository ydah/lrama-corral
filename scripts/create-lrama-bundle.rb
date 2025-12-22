#!/usr/bin/env ruby
# frozen_string_literal: true

# Lrama Bundle Creator
# This script creates a single bundled Ruby file from the Lrama gem source

require 'pathname'
require 'set'

class LramaBundler
  def initialize(gem_path, output_path)
    @gem_path = Pathname.new(gem_path)
    @lib_path = @gem_path / 'lib'
    @output_path = Pathname.new(output_path)
    @processed = Set.new
    @output_lines = []
  end

  def bundle!
    puts "=== Lrama Bundle Creator ==="
    puts "Source: #{@lib_path}"
    puts "Output: #{@output_path}"
    puts ""

    # Start with the main lrama.rb file
    add_header
    process_file(@lib_path / 'lrama.rb')

    # Write output
    @output_path.parent.mkpath
    File.write(@output_path, @output_lines.join("\n"))

    puts ""
    puts "=== Bundle Created Successfully ==="
    puts "Total files processed: #{@processed.size}"
    puts "Total lines: #{@output_lines.size}"
    puts "Output size: #{File.size(@output_path)} bytes"
  end

  private

  def add_header
    @output_lines << "# frozen_string_literal: true"
    @output_lines << ""
    @output_lines << "# Lrama Bundle - Auto-generated on #{Time.now}"
    @output_lines << "# Source: Lrama gem version 0.7.0"
    @output_lines << "# https://github.com/ruby/lrama"
    @output_lines << "#"
    @output_lines << "# This file contains the entire Lrama codebase bundled into a single file"
    @output_lines << "# for use with Ruby Wasm in the browser."
    @output_lines << ""
    @output_lines << "# === Minimal stdlib implementations for Wasm ==="
    @output_lines << ""
    @output_lines << "# Remove autoloaded stdlib constants before defining our own implementations"
    @output_lines << "# Ruby Wasm may have set up autoload for Set, Forwardable, etc."
    @output_lines << "Object.send(:remove_const, :Set) if Object.const_defined?(:Set, false)"
    @output_lines << "Object.send(:remove_const, :Forwardable) if Object.const_defined?(:Forwardable, false)"
    @output_lines << "Object.send(:remove_const, :ERB) if Object.const_defined?(:ERB, false)"
    @output_lines << ""
    @output_lines << "# ERB class (minimal implementation for Lrama templates)"
    @output_lines << "class ERB"
    @output_lines << "  def initialize(template, safe_level = nil, trim_mode = nil, eoutvar = '_erbout')"
    @output_lines << "    @template = template"
    @output_lines << "    @trim_mode = trim_mode"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def result(b = TOPLEVEL_BINDING)"
    @output_lines << "    # Simple ERB processing: evaluate embedded Ruby code"
    @output_lines << "    output = @template.dup"
    @output_lines << "    "
    @output_lines << "    # Process <%= %> tags (output)"
    @output_lines << "    output.gsub!(/<%= (.+?) %>/m) do"
    @output_lines << "      eval($1, b).to_s"
    @output_lines << "    end"
    @output_lines << "    "
    @output_lines << "    # Process <% %> tags (code)"
    @output_lines << "    output.gsub!(/<% (.+?) %>/m) do"
    @output_lines << "      eval($1, b)"
    @output_lines << "      ''"
    @output_lines << "    end"
    @output_lines << "    "
    @output_lines << "    output"
    @output_lines << "  end"
    @output_lines << "end"
    @output_lines << ""
    @output_lines << "# Forwardable module"
    @output_lines << "module Forwardable"
    @output_lines << "  def def_delegators(accessor, *methods)"
    @output_lines << "    methods.each do |method|"
    @output_lines << "      define_method(method) do |*args, **kwargs, &block|"
    @output_lines << "        # Handle both instance variable (@var) and method (var) accessors"
    @output_lines << "        target = if accessor.to_s.start_with?('@')"
    @output_lines << "                   instance_variable_get(accessor)"
    @output_lines << "                 else"
    @output_lines << "                   send(accessor)"
    @output_lines << "                 end"
    @output_lines << "        target.send(method, *args, **kwargs, &block)"
    @output_lines << "      end"
    @output_lines << "    end"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def def_delegator(accessor, method, ali = method)"
    @output_lines << "    define_method(ali) do |*args, **kwargs, &block|"
    @output_lines << "      # Handle both instance variable (@var) and method (var) accessors"
    @output_lines << "      target = if accessor.to_s.start_with?('@')"
    @output_lines << "                 instance_variable_get(accessor)"
    @output_lines << "               else"
    @output_lines << "                 send(accessor)"
    @output_lines << "               end"
    @output_lines << "      target.send(method, *args, **kwargs, &block)"
    @output_lines << "    end"
    @output_lines << "  end"
    @output_lines << "end"
    @output_lines << ""
    @output_lines << "# Set class"
    @output_lines << "class Set"
    @output_lines << "  include Enumerable"
    @output_lines << ""
    @output_lines << "  def initialize(enum = nil)"
    @output_lines << "    @hash = {}"
    @output_lines << "    enum.each { |o| add(o) } if enum"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def add(o)"
    @output_lines << "    @hash[o] = true"
    @output_lines << "    self"
    @output_lines << "  end"
    @output_lines << "  alias << add"
    @output_lines << ""
    @output_lines << "  def delete(o)"
    @output_lines << "    @hash.delete(o)"
    @output_lines << "    self"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def include?(o)"
    @output_lines << "    @hash.key?(o)"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def each(&block)"
    @output_lines << "    @hash.each_key(&block)"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def size"
    @output_lines << "    @hash.size"
    @output_lines << "  end"
    @output_lines << "  alias length size"
    @output_lines << ""
    @output_lines << "  def empty?"
    @output_lines << "    @hash.empty?"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def to_a"
    @output_lines << "    @hash.keys"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def merge(other)"
    @output_lines << "    dup.merge!(other)"
    @output_lines << "  end"
    @output_lines << ""
    @output_lines << "  def merge!(other)"
    @output_lines << "    other.each { |o| add(o) }"
    @output_lines << "    self"
    @output_lines << "  end"
    @output_lines << "end"
    @output_lines << ""
  end

  def process_file(file_path)
    # Normalize path
    file_path = Pathname.new(file_path)

    # Skip if already processed
    relative_path = file_path.relative_path_from(@lib_path)
    return if @processed.include?(relative_path.to_s)

    unless file_path.exist?
      puts "Warning: File not found: #{file_path}"
      return
    end

    puts "Processing: #{relative_path}"
    @processed.add(relative_path.to_s)

    # Read file content
    content = File.read(file_path)
    lines = content.lines

    # Add file marker
    @output_lines << ""
    @output_lines << "# === BEGIN: #{relative_path} ==="
    @output_lines << ""

    # Process each line
    lines.each do |line|
      # Skip frozen_string_literal (already added once)
      next if line.strip.start_with?('# frozen_string_literal:')

      # Handle standard library requires - comment them out
      # Ruby Wasm may not have all stdlib components
      if line.strip =~ /^require\s+['"](?:set|erb|optparse|forwardable)['"]/
        @output_lines << "# #{line.strip} # Commented out for Wasm compatibility"
        next
      end

      # Keep strscan - it's usually available in Wasm
      if line.strip =~ /^require\s+['"]strscan['"]/
        @output_lines << line.rstrip
        next
      end

      # Handle require_relative
      if line.strip.start_with?('require_relative')
        # Extract the required file
        if line =~ /require_relative\s+['"](.*)['"]/
          required_path = $1
          # Add comment to show original require
          @output_lines << "# #{line.strip}"

          # Resolve the required file path
          required_file = file_path.parent / "#{required_path}.rb"

          # Process the required file first (depth-first)
          process_file(required_file)
        else
          # Keep the line as comment if we can't parse it
          @output_lines << "# #{line.strip}"
        end
      else
        # Keep the line as-is
        @output_lines << line.rstrip
      end
    end

    # Add file end marker
    @output_lines << ""
    @output_lines << "# === END: #{relative_path} ==="
  end
end

# Railroad Diagrams Bundler
class RailroadDiagramsBundler < LramaBundler
  def initialize(gem_path, output_path)
    super(gem_path, output_path)
  end

  def bundle!
    puts "=== Railroad Diagrams Bundle Creator ==="
    puts "Source: #{@lib_path}"
    puts "Output: #{@output_path}"
    puts ""

    # Start with the main railroad_diagrams.rb file
    add_railroad_header
    process_file(@lib_path / 'railroad_diagrams.rb')

    # Write output
    @output_path.parent.mkpath
    File.write(@output_path, @output_lines.join("\n"))

    puts ""
    puts "=== Bundle Created Successfully ==="
    puts "Total files processed: #{@processed.size}"
    puts "Total lines: #{@output_lines.size}"
    puts "Output size: #{File.size(@output_path)} bytes"
  end

  private

  def add_railroad_header
    @output_lines << "# frozen_string_literal: true"
    @output_lines << ""
    @output_lines << "# Railroad Diagrams Bundle - Auto-generated on #{Time.now}"
    @output_lines << "# Source: railroad_diagrams gem"
    @output_lines << "# https://github.com/ydah/railroad_diagrams"
    @output_lines << "#"
    @output_lines << "# This file contains the entire railroad_diagrams codebase bundled into a single file"
    @output_lines << "# for use with Ruby Wasm in the browser."
    @output_lines << ""
  end
end

# Main execution
if __FILE__ == $0
  # Detect Lrama gem path
  lrama_path = `gem which lrama`.strip
  if lrama_path.empty?
    puts "Error: Lrama gem not found. Please install it with: gem install lrama"
    exit 1
  end

  # Detect railroad_diagrams gem path
  railroad_path = `gem which railroad_diagrams`.strip
  if railroad_path.empty?
    puts "Error: railroad_diagrams gem not found. Please install it with: gem install railroad_diagrams"
    exit 1
  end

  # Bundle Lrama
  lrama_gem_root = File.dirname(File.dirname(lrama_path))
  lrama_output_file = File.expand_path('../ruby/src/lrama_bundle.rb', __dir__)

  bundler = LramaBundler.new(lrama_gem_root, lrama_output_file)
  bundler.bundle!

  puts "\n\n"

  # Bundle railroad_diagrams
  railroad_gem_root = File.dirname(File.dirname(railroad_path))
  railroad_output_file = File.expand_path('../ruby/src/railroad_diagrams_bundle.rb', __dir__)

  railroad_bundler = RailroadDiagramsBundler.new(railroad_gem_root, railroad_output_file)
  railroad_bundler.bundle!
end
