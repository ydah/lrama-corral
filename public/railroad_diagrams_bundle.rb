# frozen_string_literal: true

# Railroad Diagrams Bundle - Auto-generated on 2025-12-24 13:03:10 +0900
# Source: railroad_diagrams gem
# https://github.com/ydah/railroad_diagrams
#
# This file contains the entire railroad_diagrams codebase bundled into a single file
# for use with Ruby Wasm in the browser.


# === BEGIN: railroad_diagrams.rb ===


module RailroadDiagrams
  VS = 8 # minimum vertical separation between things. For a 3px stroke, must be at least 4
  AR = 10 # radius of arcs
  DIAGRAM_CLASS = 'railroad-diagram' # class to put on the root <svg>
  STROKE_ODD_PIXEL_LENGTH =
    true # is the stroke width an odd (1px, 3px, etc) pixel length?
  INTERNAL_ALIGNMENT =
    'center' # how to align items when they have extra space. left/right/center
  CHAR_WIDTH = 8.5 # width of each monospace character. play until you find the right value for your font
  COMMENT_CHAR_WIDTH = 7 # comments are in smaller text by default

  def self.escape_attr(val)
    return val.gsub('&', '&amp;').gsub("'", '&apos;').gsub('"', '&quot;') if val.is_a?(String)

    '%g' % val
  end

  def self.escape_html(val)
    escape_attr(val).gsub('<', '&lt;')
  end
end

# require_relative 'railroad_diagrams/diagram_item'

# === BEGIN: railroad_diagrams/diagram_item.rb ===


module RailroadDiagrams
  class DiagramItem
    attr_reader :up, :down, :height, :width, :needs_space, :attrs, :children

    def initialize(name, attrs: {}, text: nil)
      @name = name
      @up = 0
      @height = 0
      @down = 0
      @width = 0
      @needs_space = false
      @attrs = attrs || {}
      @children = text ? [text] : []
    end

    def format(x, y, width)
      raise NotImplementedError
    end

    def text_diagram
      raise NotImplementedError 'Virtual'
    end

    def add(parent)
      parent.children.push self
      self
    end

    def write_svg(write)
      write.call("<#{@name}")
      @attrs.sort.each do |name, value|
        write.call(" #{name}=\"#{RailroadDiagrams.escape_attr(value)}\"")
      end
      write.call('>')
      write.call("\n") if %w[g svg].include?(@name)
      @children.each do |child|
        if child.is_a?(DiagramItem) || child.is_a?(Path) || child.is_a?(Style)
          child.write_svg(write)
        else
          write.call(RailroadDiagrams.escape_html(child))
        end
      end
      write.call("</#{@name}>")
    end

    def walk(_callback)
      callback(self)
    end

    def to_str
      "DiagramItem(#{@name}, #{@attrs}, #{@children})"
    end

    private

    def wrap_string(value)
      if value.class <= DiagramItem
        value
      else
        Terminal.new(value)
      end
    end

    def determine_gaps(outer, inner)
      diff = outer - inner
      if INTERNAL_ALIGNMENT == 'left'
        [0, diff]
      elsif INTERNAL_ALIGNMENT == 'right'
        [diff, 0]
      else
        [diff / 2, diff / 2]
      end
    end

    def write_standalone(write, _css = nil)
      write_svg(write)
    end
  end
end

# === END: railroad_diagrams/diagram_item.rb ===
# require_relative 'railroad_diagrams/diagram_multi_container'

# === BEGIN: railroad_diagrams/diagram_multi_container.rb ===


module RailroadDiagrams
  class DiagramMultiContainer < DiagramItem
    def initialize(name, items, attrs = nil, text = nil)
      super(name, attrs: attrs, text: text)
      @items = items.map { |item| wrap_string(item) }
    end

    def format(x, y, width)
      raise NotImplementedError
    end

    def walk(callback)
      callback(self)
      @items.each { |item| item.walk(callback) }
    end

    def to_str
      "DiagramMultiContainer(#{@name}, #{@items}, #{@attrs}, #{@children})"
    end
  end
end

# === END: railroad_diagrams/diagram_multi_container.rb ===

# require_relative 'railroad_diagrams/alternating_sequence'

# === BEGIN: railroad_diagrams/alternating_sequence.rb ===


module RailroadDiagrams
  class AlternatingSequence < DiagramMultiContainer
    def self.new(*items)
      raise "AlternatingSequence takes exactly two arguments, but got #{items.size} arguments." unless items.size == 2

      super
    end

    def initialize(*items)
      super('g', items)
      @needs_space = false

      arc = AR
      vert = VS
      first, second = @items

      arc_x = 1 / Math.sqrt(2) * arc * 2
      arc_y = (1 - (1 / Math.sqrt(2))) * arc * 2
      cross_y = [arc, vert].max
      cross_x = (cross_y - arc_y) + arc_x

      first_out = [
        arc + arc, (cross_y / 2) + arc + arc, (cross_y / 2) + vert + first.down
      ].max
      @up = first_out + first.height + first.up

      second_in = [
        arc + arc, (cross_y / 2) + arc + arc, (cross_y / 2) + vert + second.up
      ].max
      @down = second_in + second.height + second.down

      @height = 0

      first_width = (first.needs_space ? 20 : 0) + first.width
      second_width = (second.needs_space ? 20 : 0) + second.width
      @width = (2 * arc) + [first_width, cross_x, second_width].max + (2 * arc)
    end

    def to_s
      items = @items.map(&:to_s).join(', ')
      "AlternatingSequence(#{items})"
    end

    def format(x, y, width)
      arc = AR
      gaps = determine_gaps(width, @width)
      Path.new(x, y).right(gaps[0]).add(self)
      x += gaps[0]
      Path.new(x + @width, y + @height).right(gaps[1]).add(self)
      # bounding box
      # Path(x+gaps[0], y).up(@up).right(@width).down(@up+@down).left(@width).up(@up).add(self)
      first, second = @items

      # top
      first_in = @up - first.up
      first_out = @up - first.up - first.height
      Path.new(x, y).arc('se').up(first_in - (2 * arc)).arc('wn').add(self)
      first.format(x + (2 * arc), y - first_in, @width - (4 * arc)).add(self)
      Path.new(x + @width - (2 * arc), y - first_out)
          .arc('ne').down(first_out - (2 * arc)).arc('ws').add(self)

      # bottom
      second_in = @down - second.down - second.height
      second_out = @down - second.down
      Path.new(x, y)
          .arc('ne')
          .down(second_in - (2 * arc))
          .arc('ws')
          .add(self)
      second.format(x + (2 * arc), y + second_in, @width - (4 * arc)).add(self)
      Path.new(x + @width - (2 * arc), y + second_out)
          .arc('se').up(second_out - (2 * arc)).arc('wn').add(self)

      # crossover
      arc_x = 1 / Math.sqrt(2) * arc * 2
      arc_y = (1 - (1 / Math.sqrt(2))) * arc * 2
      cross_y = [arc, VS].max
      cross_x = (cross_y - arc_y) + arc_x
      cross_bar = (@width - (4 * arc) - cross_x) / 2

      Path.new(x + arc, y - (cross_y / 2) - arc)
          .arc('ws')
          .right(cross_bar)
          .arc_8('n', 'cw')
          .l(cross_x - arc_x, cross_y - arc_y)
          .arc_8('sw', 'ccw')
          .right(cross_bar)
          .arc('ne')
          .add(self)

      Path.new(x + arc, y + (cross_y / 2) + arc)
          .arc('wn')
          .right(cross_bar)
          .arc_8('s', 'ccw')
          .l(cross_x - arc_x, -(cross_y - arc_y))
          .arc_8('nw', 'cw')
          .right(cross_bar)
          .arc('se')
          .add(self)

      self
    end

    def text_diagram
      cross_diag, corner_bot_left, corner_bot_right, corner_top_left, corner_top_right,
      line, line_vertical, tee_left, tee_right = TextDiagram.get_parts(
        %w[
          cross_diag roundcorner_bot_left roundcorner_bot_right
          roundcorner_top_left roundcorner_top_right line
          line_vertical tee_left tee_right
        ]
      )

      first_td = @items[0].text_diagram
      second_td = @items[1].text_diagram
      max_width = TextDiagram.max_width(first_td, second_td)
      left_width, right_width = TextDiagram.gaps(max_width, 0)

      left_lines = []
      right_lines = []
      separator = []

      left_size, right_size = TextDiagram.gaps(first_td.width, 0)
      diagram_td = first_td.expand(left_width - left_size, right_width - right_size, 0, 0)

      left_lines += [' ' * 2] * diagram_td.entry
      left_lines << (corner_top_left + line)
      left_lines += ["#{line_vertical} "] * (diagram_td.height - diagram_td.entry - 1)
      left_lines << (corner_bot_left + line)

      right_lines += [' ' * 2] * diagram_td.entry
      right_lines << (line + corner_top_right)
      right_lines += [" #{line_vertical}"] * (diagram_td.height - diagram_td.entry - 1)
      right_lines << (line + corner_bot_right)

      separator << ("#{line * (left_width - 1)}#{corner_top_right} #{corner_top_left}#{line * (right_width - 2)}")
      separator << ("#{' ' * (left_width - 1)} #{cross_diag} #{' ' * (right_width - 2)}")
      separator << ("#{line * (left_width - 1)}#{corner_bot_right} #{corner_bot_left}#{line * (right_width - 2)}")

      left_lines << (' ' * 2)
      right_lines << (' ' * 2)

      left_size, right_size = TextDiagram.gaps(second_td.width, 0)
      second_td = second_td.expand(left_width - left_size, right_width - right_size, 0, 0)
      diagram_td = diagram_td.append_below(second_td, separator, move_entry: true, move_exit: true)

      left_lines << (corner_top_left + line)
      left_lines += ["#{line_vertical} "] * second_td.entry
      left_lines << (corner_bot_left + line)

      right_lines << (line + corner_top_right)
      right_lines += [" #{line_vertical}"] * second_td.entry
      right_lines << (line + corner_bot_right)

      mid_point = first_td.height + (separator.size / 2)
      diagram_td = diagram_td.alter(new_entry: mid_point, new_exit: mid_point)

      left_td = TextDiagram.new(mid_point, mid_point, left_lines)
      right_td = TextDiagram.new(mid_point, mid_point, right_lines)

      diagram_td = left_td.append_right(diagram_td, '').append_right(right_td, '')
      TextDiagram.new(1, 1, [corner_top_left, tee_left, corner_bot_left])
                 .append_right(diagram_td, '')
                 .append_right(TextDiagram.new(1, 1, [corner_top_right, tee_right, corner_bot_right]), '')
    end
  end
end

# === END: railroad_diagrams/alternating_sequence.rb ===
# require_relative 'railroad_diagrams/choice'

# === BEGIN: railroad_diagrams/choice.rb ===


module RailroadDiagrams
  class Choice < DiagramMultiContainer
    def initialize(default, *items)
      super('g', items)
      raise ArgumentError, 'default index out of range' if default >= items.size

      @default = default
      @width = (AR * 4) + @items.map(&:width).max

      # The calcs are non-trivial and need to be done both here
      # and in .format(), so no reason to do it twice.
      @separators = Array.new(items.size - 1, VS)

      # If the entry or exit lines would be too close together
      # to accommodate the arcs,
      # bump up the vertical separation to compensate.
      @up = 0
      (default - 1).downto(0) do |i|
        arcs =
          if i == default - 1
            AR * 2
          else
            AR
          end

        item = @items[i]
        lower_item = @items[i + 1]

        entry_delta = lower_item.up + VS + item.down + item.height
        exit_delta = lower_item.height + lower_item.up + VS + item.down

        separator = VS
        separator += [arcs - entry_delta, arcs - exit_delta].max if entry_delta < arcs || exit_delta < arcs
        @separators[i] = separator

        @up += lower_item.up + separator + item.down + item.height
      end
      @up += @items[0].up

      @height = @items[default].height
      (default + 1...@items.size).each do |i|
        arcs =
          if i == default + 1
            AR * 2
          else
            AR
          end

        item = @items[i]
        upper_item = @items[i - 1]

        entry_delta = upper_item.height + upper_item.down + VS + item.up
        exit_delta = upper_item.down + VS + item.up + item.height

        separator = VS
        separator += [arcs - entry_delta, arcs - exit_delta].max if entry_delta < arcs || exit_delta < arcs
        @separators[i - 1] = separator

        @down += upper_item.down + separator + item.up + item.height
      end
      @down += @items[-1].down
      @needs_space = false
    end

    def to_s
      items_str = @items.map(&:to_s).join(', ')
      "Choice(#{@default}, #{items_str})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)

      # Hook up the two sides if self is narrower than its stated width.
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y + @height).h(right_gap).add(self)
      x += left_gap

      inner_width = @width - (AR * 4)
      default = @items[@default]

      # Do the elements that curve above
      distance_from_y = 0
      (@default - 1).downto(0) do |i|
        item = @items[i]
        lower_item = @items[i + 1]
        distance_from_y += lower_item.up + @separators[i] + item.down + item.height
        Path.new(x, y)
            .arc('se')
            .up(distance_from_y - (AR * 2))
            .arc('wn')
            .add(self)
        item.format(x + (AR * 2), y - distance_from_y, inner_width).add(self)
        Path.new(x + (AR * 2) + inner_width, y - distance_from_y + item.height)
            .arc('ne')
            .down(distance_from_y - item.height + default.height - (AR * 2))
            .arc('ws')
            .add(self)
      end

      # Do the straight-line path.
      Path.new(x, y).right(AR * 2).add(self)
      @items[@default].format(x + (AR * 2), y, inner_width).add(self)
      Path.new(x + (AR * 2) + inner_width, y + @height).right(AR * 2).add(self)

      # Do the elements that curve below
      distance_from_y = 0
      (@default + 1...@items.size).each do |i|
        item = @items[i]
        upper_item = @items[i - 1]
        distance_from_y += upper_item.height + upper_item.down + @separators[i - 1] + item.up
        Path.new(x, y)
            .arc('ne')
            .down(distance_from_y - (AR * 2))
            .arc('ws')
            .add(self)
        item.format(x + (AR * 2), y + distance_from_y, inner_width).add(self)
        Path.new(x + (AR * 2) + inner_width, y + distance_from_y + item.height)
            .arc('se')
            .up(distance_from_y - (AR * 2) + item.height - default.height)
            .arc('wn')
            .add(self)
      end

      self
    end

    def text_diagram
      cross, line, line_vertical, roundcorner_bot_left, roundcorner_bot_right, roundcorner_top_left, roundcorner_top_right =
        TextDiagram.get_parts(
          %w[
            cross line line_vertical roundcorner_bot_left roundcorner_bot_right roundcorner_top_left roundcorner_top_right
          ]
        )

      # Format all the child items, so we can know the maximum width.
      item_tds = @items.map { |item| item.text_diagram.expand(1, 1, 0, 0) }
      max_item_width = item_tds.map(&:width).max
      diagram_td = TextDiagram.new(0, 0, [])
      # Format the choice collection.
      item_tds.each_with_index do |item_td, i|
        left_pad, right_pad = TextDiagram.gaps(max_item_width, item_td.width)
        item_td = item_td.expand(left_pad, right_pad, 0, 0)
        has_separator = true
        left_lines = [line_vertical] * item_td.height
        right_lines = [line_vertical] * item_td.height
        move_entry = false
        move_exit = false
        if i <= @default
          # Item below the line: round off the entry/exit lines downwards.
          left_lines[item_td.entry] = roundcorner_top_left
          right_lines[item_td.exit] = roundcorner_top_right
          if i.zero?
            # First item and above the line: also remove ascenders above the item's entry and exit, suppress the separator above it.
            has_separator = false
            (0...item_td.entry).each { |j| left_lines[j] = ' ' }
            (0...item_td.exit).each { |j| right_lines[j] = ' ' }
          end
        end
        if i >= @default
          # Item below the line: round off the entry/exit lines downwards.
          left_lines[item_td.entry] = roundcorner_bot_left
          right_lines[item_td.exit] = roundcorner_bot_right
          if i.zero?
            # First item and below the line: also suppress the separator above it.
            has_separator = false
          end
          if i == @items.size - 1
            # Last item and below the line: also remove descenders below the item's entry and exit
            (item_td.entry + 1...item_td.height).each { |j| left_lines[j] = ' ' }
            (item_td.exit + 1...item_td.height).each { |j| right_lines[j] = ' ' }
          end
        end
        if i == @default
          # Item on the line: entry/exit are horizontal, and sets the outer entry/exit.
          left_lines[item_td.entry] = cross
          right_lines[item_td.exit] = cross
          move_entry = true
          move_exit = true
          if i.zero? && i == @items.size - 1
            # Only item and on the line: set entry/exit for straight through.
            left_lines[item_td.entry] = line
            right_lines[item_td.exit] = line
          elsif i.zero?
            # First item and on the line: set entry/exit for no ascenders.
            left_lines[item_td.entry] = roundcorner_top_right
            right_lines[item_td.exit] = roundcorner_top_left
          elsif i == @items.size - 1
            # Last item and on the line: set entry/exit for no descenders.
            left_lines[item_td.entry] = roundcorner_bot_right
            right_lines[item_td.exit] = roundcorner_bot_left
          end
        end
        left_join_td = TextDiagram.new(item_td.entry, item_td.entry, left_lines)
        right_join_td = TextDiagram.new(item_td.exit, item_td.exit, right_lines)
        item_td = left_join_td.append_right(item_td, '').append_right(right_join_td, '')
        separator =
          if has_separator
            [
              line_vertical +
                (' ' * (TextDiagram.max_width(diagram_td, item_td) - 2)) + line_vertical
            ]
          else
            []
          end
        diagram_td = diagram_td.append_below(item_td, separator, move_entry: move_entry, move_exit: move_exit)
      end
      diagram_td
    end
  end
end

# === END: railroad_diagrams/choice.rb ===
# require_relative 'railroad_diagrams/command'

# === BEGIN: railroad_diagrams/command.rb ===


# require 'optparse' # Commented out for Wasm compatibility

module RailroadDiagrams
  class Command
    def initialize
      @format = 'svg'
    end

    def run(argv)
      OptionParser.new do |opts|
        opts.banner = <<~BANNER
          This is a test runner for railroad_diagrams:
          Usage: railroad_diagrams [options] [files]
        BANNER

        opts.on('-f', '--format FORMAT', 'Output format (svg, ascii, unicode, standalone)') do |format|
          @format = format
        end
        opts.on('-h', '--help', 'Print this help') do
          puts opts
          exit
        end
        opts.on('-v', '--version', 'Print version') do
          puts "railroad_diagrams #{RailroadDiagrams::VERSION}"
          exit 0
        end
        opts.parse!(argv)
      end

      @test_list = argv

      puts <<~HTML
        <!doctype html>
        <html>
        <head>
          <title>Test</title>
      HTML

      case @format
      when 'ascii'
        TextDiagram.set_formatting(TextDiagram::PARTS_ASCII)
      when 'unicode'
        TextDiagram.set_formatting(TextDiagram::PARTS_UNICODE)
      when 'svg', 'standalone'
        TextDiagram.set_formatting(TextDiagram::PARTS_UNICODE)
        puts <<~CSS
          <style>
            #{Style.default_style}
            .blue text { fill: blue; }
          </style>
        CSS
      end

      puts '</head><body>'

      File.open('test.rb', 'r:utf-8') do |fh|
        eval(fh.read, binding, 'test.rb')
      end

      puts '</body></html>'
    end

    def add(name, diagram)
      return unless @test_list.empty? || @test_list.include?(name)

      puts "\n<h1>#{RailroadDiagrams.escape_html(name)}</h1>"

      case @format
      when 'svg'
        diagram.write_svg($stdout.method(:write))
      when 'standalone'
        diagram.write_standalone($stdout.method(:write))
      when 'ascii', 'unicode'
        puts "\n<pre>"
        diagram.write_text($stdout.method(:write))
        puts "\n</pre>"
      end

      puts "\n"
    end
  end
end

# === END: railroad_diagrams/command.rb ===
# require_relative 'railroad_diagrams/comment'

# === BEGIN: railroad_diagrams/comment.rb ===


module RailroadDiagrams
  class Comment < DiagramItem
    def initialize(text, href = nil, title = nil, cls: '')
      super('g', attrs: { 'class' => "non-terminal #{cls}" })
      @text = text
      @href = href
      @title = title
      @cls = cls
      @width = (text.length * COMMENT_CHAR_WIDTH) + 10
      @up = 8
      @down = 8
      @needs_space = true
    end

    def to_s
      "Comment(#{@text}, href=#{@href}, title=#{@title}, cls=#{@cls})"
    end

    def format(x, y, _width)
      left_gap, right_gap = determine_gaps(width, @width)

      # Hook up the two sides if self is narrower than its stated width.
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y).h(right_gap).add(self)

      text = DiagramItem.new(
        'text',
        attrs: { 'x' => x + left_gap + (@width / 2), 'y' => y + 4, 'class' => 'comment' },
        text: @text
      )
      if @href
        a = DiagramItem.new('a', attrs: { 'xlink:href' => @href }, text: text).add(self)
        text.add(a)
      else
        text.add(self)
      end
      DiagramItem.new('title', attrs: {}, text: @title).add(self) if @title
      self
    end

    def text_diagram
      # NOTE: href, title, and cls are ignored for text diagrams.
      TextDiagram.new(0, 0, [@text])
    end
  end
end

# === END: railroad_diagrams/comment.rb ===
# require_relative 'railroad_diagrams/diagram'

# === BEGIN: railroad_diagrams/diagram.rb ===


module RailroadDiagrams
  class Diagram < DiagramMultiContainer
    def initialize(*items, **kwargs)
      super('svg', items.to_a, { 'class' => DIAGRAM_CLASS })
      @type = kwargs.fetch(:type, 'simple')

      if @items.any?
        @items.unshift(Start.new(@type)) unless @items.first.is_a?(Start)
        @items.push(End.new(@type)) unless @items.last.is_a?(End)
      end

      @up = 0
      @down = 0
      @height = 0
      @width = 0

      @items.each do |item|
        next if item.is_a?(Style)

        @width += item.width + (item.needs_space ? 20 : 0)
        @up = [@up, item.up - @height].max
        @height += item.height
        @down = [@down - item.height, item.down].max
      end

      @width -= 10 if @items[0].needs_space
      @width -= 10 if @items[-1].needs_space
      @formatted = false
    end

    def to_s
      items = @items.map(&:to_s).join(', ')
      pieces = items ? [items] : []
      pieces.push("type=#{@type}") if @type != 'simple'
      "Diagram(#{pieces.join(', ')})"
    end

    def format(padding_top = 20, padding_right = nil, padding_bottom = nil, padding_left = nil)
      padding_right = padding_top if padding_right.nil?
      padding_bottom = padding_top if padding_bottom.nil?
      padding_left = padding_right if padding_left.nil?

      x = padding_left
      y = padding_top + @up
      g = DiagramItem.new('g')
      g.attrs['transform'] = 'translate(.5 .5)' if STROKE_ODD_PIXEL_LENGTH

      @items.each do |item|
        if item.needs_space
          Path.new(x, y).h(10).add(g)
          x += 10
        end
        item.format(x, y, item.width).add(g)
        x += item.width
        y += item.height
        if item.needs_space
          Path.new(x, y).h(10).add(g)
          x += 10
        end
      end

      @attrs['width'] = (@width + padding_left + padding_right).to_s
      @attrs['height'] = (@up + @height + @down + padding_top + padding_bottom).to_s
      @attrs['viewBox'] = "0 0 #{@attrs['width']} #{@attrs['height']}"
      g.add(self)
      @formatted = true
      self
    end

    def text_diagram
      separator, = TextDiagram.get_parts(['separator'])
      diagram_td = @items[0].text_diagram
      @items[1..-1].each do |item|
        item_td = item.text_diagram
        item_td = item_td.expand(1, 1, 0, 0) if item.needs_space
        diagram_td = diagram_td.append_right(item_td, separator)
      end
      diagram_td
    end

    def write_svg(write)
      format unless @formatted

      super
    end

    def write_text(write)
      output = text_diagram
      output = "#{output.lines.join("\n")}\n"
      output = output.gsub('&', '&amp;').gsub('<', '&lt;').gsub('>', '&gt;').gsub('"', '&quot;')
      write.call(output)
    end

    def write_standalone(write, css = nil)
      format unless @formatted
      css = Style.default_style if css
      Style.new(css).add(self)
      @attrs['xmlns'] = 'http://www.w3.org/2000/svg'
      @attrs['xmlns:xlink'] = 'http://www.w3.org/1999/xlink'
      super(write)
      @children.pop
      @attrs.delete('xmlns')
      @attrs.delete('xmlns:xlink')
    end
  end
end

# === END: railroad_diagrams/diagram.rb ===
# require_relative 'railroad_diagrams/end'

# === BEGIN: railroad_diagrams/end.rb ===


module RailroadDiagrams
  class End < DiagramItem
    def initialize(type = 'simple')
      super('path')
      @width = 20
      @up = 10
      @down = 10
      @type = type
    end

    def to_s
      "End(type=#{@type})"
    end

    def format(x, y, _width)
      @attrs['d'] =
        if @type == 'simple'
          "M #{x} #{y} h 20 m -10 -10 v 20 m 10 -20 v 20"
        else
          "M #{x} #{y} h 20 m 0 -10 v 20"
        end
      self
    end

    def text_diagram
      cross, line, tee_left = TextDiagram.get_parts(%w[cross line tee_left])
      end_node =
        if @type == 'simple'
          line + cross + tee_left
        else
          line + tee_left
        end

      TextDiagram.new(0, 0, [end_node])
    end
  end
end

# === END: railroad_diagrams/end.rb ===
# require_relative 'railroad_diagrams/group'

# === BEGIN: railroad_diagrams/group.rb ===


module RailroadDiagrams
  class Group < DiagramItem
    def initialize(item, label = nil)
      super('g')
      @item = wrap_string(item)

      @label =
        if label.is_a?(DiagramItem)
          label
        elsif label
          Comment.new(label)
        end

      item_width = @item.width + (@item.needs_space ? 20 : 0)
      label_width = @label ? @label.width : 0
      @width = [item_width, label_width, AR * 2].max

      @height = @item.height

      @box_up = [@item.up + VS, AR].max
      @up = @box_up
      @up += @label.up + @label.height + @label.down if @label

      @down = [@item.down + VS, AR].max

      @needs_space = true
    end

    def to_s
      "Group(#{@item}, label=#{@label})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y + @height).h(right_gap).add(self)
      x += left_gap

      DiagramItem.new(
        'rect',
        attrs: {
          'x' => x,
          'y' => y - @box_up,
          'width' => @width,
          'height' => @height + @box_up + @down,
          'rx' => AR,
          'ry' => AR,
          'class' => 'group-box'
        }
      ).add(self)

      @item.format(x, y, @width).add(self)
      @label&.format(x, y - (@box_up + @label.down + @label.height), @width)&.add(self)

      self
    end

    def walk(callback)
      callback.call(self)
      item.walk(callback)
      label&.walk(callback)
    end

    def text_diagram
      diagram_td = TextDiagram.round_rect(@item.text_diagram, dashed: true)
      if @label
        label_td = @label.text_diagram
        diagram_td = label_td.append_below(diagram_td, [], move_entry: true, move_exit: true).expand(0, 0, 1, 0)
      end
      diagram_td
    end
  end
end

# === END: railroad_diagrams/group.rb ===
# require_relative 'railroad_diagrams/horizontal_choice'

# === BEGIN: railroad_diagrams/horizontal_choice.rb ===


module RailroadDiagrams
  class HorizontalChoice < DiagramMultiContainer
    def self.new(*items)
      return Sequence.new(*items) if items.size <= 1

      super
    end

    def initialize(*items)
      super('g', items)
      all_but_last = @items[0...-1]
      middles = @items[1...-1]
      first = @items.first
      last = @items.last
      @needs_space = false

      @width =
        AR + # starting track
        (AR * 2 * (@items.size - 1)) + # inbetween tracks
        @items.sum { |x| x.width + (x.needs_space ? 20 : 0) } + # items
        (last.height.positive? ? AR : 0) + # needs space to curve up
        AR # ending track

      # Always exits at entrance height
      @height = 0

      # All but the last have a track running above them
      @upper_track = [AR * 2, VS, all_but_last.map(&:up).max + VS].max
      @up = [@upper_track, last.up].max

      # All but the first have a track running below them
      # Last either straight-lines or curves up, so has different calculation
      @lower_track = [
        VS,
        middles.any? ? middles.map { |x| x.height + [x.down + VS, AR * 2].max }.max : 0,
        last.height + last.down + VS
      ].max
      if first.height < @lower_track
        # Make sure there's at least 2*AR room between first exit and lower track
        @lower_track = [@lower_track, first.height + (AR * 2)].max
      end
      @down = [@lower_track, first.height + first.down].max
    end

    def to_s
      items = @items.map(&:to_s).join(', ')
      "HorizontalChoice(#{items})"
    end

    def format(x, y, width)
      # Hook up the two sides if self is narrower than its stated width.
      left_gap, right_gap = determine_gaps(width, @width)
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y + @height).h(right_gap).add(self)
      x += left_gap

      first = @items.first
      last = @items.last

      # upper track
      upper_span =
        @items[0...-1].sum { |item| item.width + (item.needs_space ? 20 : 0) } +
        ((@items.size - 2) * AR * 2) -
        AR

      Path.new(x, y)
          .arc('se')
          .up(@upper_track - (AR * 2))
          .arc('wn')
          .h(upper_span)
          .add(self)

      # lower track
      lower_span =
        @items[1..-1].sum { |item| item.width + (item.needs_space ? 20 : 0) } +
        ((@items.size - 2) * AR * 2) +
        (last.height.positive? ? AR : 0) -
        AR

      lower_start = x + AR + first.width + (first.needs_space ? 20 : 0) + (AR * 2)

      Path.new(lower_start, y + @lower_track)
          .h(lower_span)
          .arc('se')
          .up(@lower_track - (AR * 2))
          .arc('wn')
          .add(self)

      # Items
      @items.each_with_index do |item, i|
        # input track
        if i.zero?
          Path.new(x, y)
              .h(AR)
              .add(self)
          x += AR
        else
          Path.new(x, y - @upper_track)
              .arc('ne')
              .v(@upper_track - (AR * 2))
              .arc('ws')
              .add(self)
          x += AR * 2
        end

        # item
        item_width = item.width + (item.needs_space ? 20 : 0)
        item.format(x, y, item_width).add(self)
        x += item_width

        # output track
        if i == @items.size - 1
          if item.height.zero?
            Path.new(x, y).h(AR).add(self)
          else
            Path.new(x, y + item.height).arc('se').add(self)
          end
        elsif i.zero? && item.height > @lower_track
          # Needs to arc up to meet the lower track, not down.
          if item.height - @lower_track >= AR * 2
            Path.new(x, y + item.height)
                .arc('se')
                .v(@lower_track - item.height + (AR * 2))
                .arc('wn')
                .add(self)
          else
            # Not enough space to fit two arcs
            # so just bail and draw a straight line for now.
            Path.new(x, y + item.height)
                .l(AR * 2, @lower_track - item.height)
                .add(self)
          end
        else
          Path.new(x, y + item.height)
              .arc('ne')
              .v(@lower_track - item.height - (AR * 2))
              .arc('ws')
              .add(self)
        end
      end
      self
    end

    def text_diagram
      line, line_vertical, roundcorner_bot_left, roundcorner_bot_right,
      roundcorner_top_left, roundcorner_top_right = TextDiagram.get_parts(
        %w[line line_vertical roundcorner_bot_left roundcorner_bot_right roundcorner_top_left
           roundcorner_top_right]
      )

      # Format all the child items, so we can know the maximum entry, exit, and height.
      item_tds = @items.map(&:text_diagram)

      # diagram_entry: distance from top to lowest entry, aka distance from top to diagram entry, aka final diagram entry and exit.
      diagram_entry = item_tds.map(&:entry).max
      # soil_to_baseline: distance from top to lowest entry before rightmost item, aka distance from skip-over-items line to rightmost entry, aka SOIL height.
      soil_to_baseline = item_tds[0...-1].map(&:entry).max
      # top_to_soil: distance from top to skip-over-items line.
      top_to_soil = diagram_entry - soil_to_baseline
      # baseline_to_suil: distance from lowest entry or exit after leftmost item to bottom, aka distance from entry to skip-under-items line, aka SUIL height.
      baseline_to_suil = item_tds[1..-1].map { |td| td.height - [td.entry, td.exit].min }.max - 1

      # The diagram starts with a line from its entry up to skip-over-items line:
      lines = Array.new(top_to_soil, '  ')
      lines << (roundcorner_top_left + line)
      lines += Array.new(soil_to_baseline, "#{line_vertical} ")
      lines << (roundcorner_bot_right + line)

      diagram_td = TextDiagram.new(lines.size - 1, lines.size - 1, lines)

      item_tds.each_with_index do |item_td, item_num|
        if item_num.positive?
          # All items except the leftmost start with a line from the skip-over-items line down to their entry,
          # with a joining-line across at the skip-under-items line:
          lines = ['  '] * top_to_soil
          # All such items except the rightmost also have a continuation of the skip-over-items line:
          line_to_next_item = item_num == item_tds.size - 1 ? ' ' : line
          lines << (roundcorner_top_right + line_to_next_item)
          lines += ["#{line_vertical} "] * soil_to_baseline
          lines << (roundcorner_bot_left + line)
          lines += ['  '] * baseline_to_suil
          lines << (line * 2)

          entry_td = TextDiagram.new(diagram_td.exit, diagram_td.exit, lines)
          diagram_td = diagram_td.append_right(entry_td, '')
        end

        part_td = TextDiagram.new(0, 0, [])

        if item_num < item_tds.size - 1
          # All items except the rightmost start with a segment of the skip-over-items line at the top.
          # followed by enough blank lines to push their entry down to the previous item's exit:
          lines = []
          lines << (line * item_td.width)
          lines += Array.new(soil_to_baseline - item_td.entry, ' ' * item_td.width)
          soil_segment = TextDiagram.new(0, 0, lines)
          part_td = part_td.append_below(soil_segment, [])
        end

        part_td = part_td.append_below(item_td, [], move_entry: true, move_exit: true)

        if item_num.positive?
          # All items except the leftmost end with enough blank lines to pad down to the skip-under-items
          # line, followed by a segment of the skip-under-items line:
          lines = Array.new(baseline_to_suil - (item_td.height - item_td.entry) + 1, ' ' * item_td.width)
          lines << (line * item_td.width)
          suil_segment = TextDiagram.new(0, 0, lines)
          part_td = part_td.append_below(suil_segment, [])
        end

        diagram_td = diagram_td.append_right(part_td, '')

        if item_num < item_tds.size - 1
          # All items except the rightmost have a line from their exit down to the skip-under-items line,
          # with a joining-line across at the skip-over-items line:
          lines = Array.new(top_to_soil, '  ')
          lines << (line * 2)
          lines += Array.new(diagram_td.exit - top_to_soil - 1, '  ')
          lines << (line + roundcorner_top_right)
          lines += Array.new(baseline_to_suil - (diagram_td.exit - diagram_td.entry), " #{line_vertical}")
          line_from_prev_item = item_num.positive? ? line : ' '
          lines << (line_from_prev_item + roundcorner_bot_left)

          entry = diagram_entry + 1 + (diagram_td.exit - diagram_td.entry)
          exit_td = TextDiagram.new(entry, diagram_entry + 1, lines)
        else
          # The rightmost item has a line from the skip-under-items line and from its exit up to the diagram exit:
          lines = []
          line_from_exit = diagram_td.exit == diagram_td.entry ? line : ' '
          lines << (line_from_exit + roundcorner_top_left)
          lines += Array.new(diagram_td.exit - diagram_td.entry, " #{line_vertical}")
          lines << (line + roundcorner_bot_right) if diagram_td.exit != diagram_td.entry
          lines += Array.new(baseline_to_suil - (diagram_td.exit - diagram_td.entry), " #{line_vertical}")
          lines << (line + roundcorner_bot_right)

          exit_td = TextDiagram.new(diagram_td.exit - diagram_td.entry, 0, lines)
        end
        diagram_td = diagram_td.append_right(exit_td, '')
      end

      diagram_td
    end
  end
end

# === END: railroad_diagrams/horizontal_choice.rb ===
# require_relative 'railroad_diagrams/multiple_choice'

# === BEGIN: railroad_diagrams/multiple_choice.rb ===


module RailroadDiagrams
  class MultipleChoice < DiagramMultiContainer
    def initialize(default, type, *items)
      super('g', items)
      raise ArgumentError, "default must be between 0 and #{items.length - 1}" unless (0...items.length).cover?(default)
      raise ArgumentError, "type must be 'any' or 'all'" unless %w[any all].include?(type)

      @default = default
      @type = type
      @needs_space = true
      @inner_width = @items.map(&:width).max
      @width = 30 + AR + @inner_width + AR + 20
      @up = @items[0].up
      @down = @items[-1].down
      @height = @items[default].height

      @items.each_with_index do |item, i|
        minimum =
          if [default - 1, default + 1].include?(i)
            10 + AR
          else
            AR
          end

        if i < default
          @up += [minimum, item.height + item.down + VS + @items[i + 1].up].max
        elsif i > default
          @down += [minimum, item.up + VS + @items[i - 1].down + @items[i - 1].height].max
        end
      end

      @down -= @items[default].height # already counted in @height
    end

    def to_s
      items = @items.map(&:to_s).join(', ')
      "MultipleChoice(#{@default}, #{@type}, #{items})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)

      # Hook up the two sides if self is narrower than its stated width.
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y + @height).h(right_gap).add(self)
      x += left_gap

      default = @items[@default]

      # Do the elements that curve above
      above = @items[0...@default].reverse
      distance_from_y = 0
      distance_from_y = [10 + AR, default.up + VS + above.first.down + above.first.height].max if above.any?

      double_enumerate(above).each do |i, ni, item|
        Path.new(x + 30, y).up(distance_from_y - AR).arc('wn').add(self)
        item.format(x + 30 + AR, y - distance_from_y, @inner_width).add(self)
        Path.new(x + 30 + AR + @inner_width, y - distance_from_y + item.height)
            .arc('ne')
            .down(distance_from_y - item.height + default.height - AR - 10)
            .add(self)
        distance_from_y += [AR, item.up + VS + above[i + 1].down + above[i + 1].height].max if ni < -1
      end

      # Do the straight-line path.
      Path.new(x + 30, y).right(AR).add(self)
      @items[@default].format(x + 30 + AR, y, @inner_width).add(self)
      Path.new(x + 30 + AR + @inner_width, y + @height).right(AR).add(self)

      # Do the elements that curve below
      below = @items[(@default + 1)..-1] || []
      distance_from_y = [10 + AR, default.height + default.down + VS + below.first.up].max if below.any?

      below.each_with_index do |item, i|
        Path.new(x + 30, y).down(distance_from_y - AR).arc('ws').add(self)
        item.format(x + 30 + AR, y + distance_from_y, @inner_width).add(self)
        Path.new(x + 30 + AR + @inner_width, y + distance_from_y + item.height)
            .arc('se')
            .up(distance_from_y - AR + item.height - default.height - 10)
            .add(self)

        distance_from_y += [AR, item.height + item.down + VS + (below[i + 1]&.up || 0)].max
      end

      text = DiagramItem.new('g', attrs: { 'class' => 'diagram-text' }).add(self)
      DiagramItem.new(
        'title',
        text: @type == 'any' ? 'take one or more branches, once each, in any order' : 'take all branches, once each, in any order'
      ).add(text)

      DiagramItem.new(
        'path',
        attrs: {
          'd' => "M #{x + 30} #{y - 10} h -26 a 4 4 0 0 0 -4 4 v 12 a 4 4 0 0 0 4 4 h 26 z",
          'class' => 'diagram-text'
        }
      ).add(text)

      DiagramItem.new(
        'text',
        text: @type == 'any' ? '1+' : 'all',
        attrs: { 'x' => x + 15, 'y' => y + 4, 'class' => 'diagram-text' }
      ).add(text)

      DiagramItem.new(
        'path',
        attrs: {
          'd' => "M #{x + @width - 20} #{y - 10} h 16 a 4 4 0 0 1 4 4 v 12 a 4 4 0 0 1 -4 4 h -16 z",
          'class' => 'diagram-text'
        }
      ).add(text)

      DiagramItem.new(
        'text',
        text: '↺',
        attrs: { 'x' => x + @width - 10, 'y' => y + 4, 'class' => 'diagram-arrow' }
      ).add(text)

      self
    end

    def text_diagram
      multi_repeat = TextDiagram.get_parts(['multi_repeat']).first
      any_all = TextDiagram.rect(@type == 'any' ? '1+' : 'all')
      diagram_td = Choice.new(0, Skip.new).text_diagram
      repeat_td = TextDiagram.rect(multi_repeat)
      diagram_td = any_all.append_right(diagram_td, '')
      diagram_td.append_right(repeat_td, '')
    end

    private

    def double_enumerate(seq)
      length = seq.length
      seq.each_with_index.map { |item, i| [i, i - length, item] }
    end
  end
end

# === END: railroad_diagrams/multiple_choice.rb ===
# require_relative 'railroad_diagrams/non_terminal'

# === BEGIN: railroad_diagrams/non_terminal.rb ===


module RailroadDiagrams
  class NonTerminal < DiagramItem
    def initialize(text, href = nil, title = nil, cls: '')
      super('g', attrs: { 'class' => "non-terminal #{cls}" })
      @text = text
      @href = href
      @title = title
      @cls = cls
      @width = (text.length * CHAR_WIDTH) + 20
      @up = 11
      @down = 11
      @needs_space = true
    end

    def to_s
      "NonTerminal(#{@text}, href=#{@href}, title=#{@title}, cls=#{@cls})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)

      # Hook up the two sides if self is narrower than its stated width.
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y).h(right_gap).add(self)

      DiagramItem.new(
        'rect',
        attrs: {
          'x' => x + left_gap,
          'y' => y - 11,
          'width' => @width,
          'height' => @up + @down
        }
      ).add(self)

      text = DiagramItem.new(
        'text',
        attrs: {
          'x' => x + left_gap + (@width / 2),
          'y' => y + 4
        },
        text: @text
      )
      if @href
        a = DiagramItem.new(
          'a',
          attrs: {
            'xlink:href' => @href
          },
          text: text
        ).add(self)
        text.add(a)
      else
        text.add(self)
      end
      DiagramItem.new('title', attrs: {}, text: @title).add(self) if @title
      self
    end

    def text_diagram
      # NOTE: href, title, and cls are ignored for text diagrams.
      TextDiagram.rect(@text)
    end
  end
end

# === END: railroad_diagrams/non_terminal.rb ===
# require_relative 'railroad_diagrams/one_or_more'

# === BEGIN: railroad_diagrams/one_or_more.rb ===


module RailroadDiagrams
  class OneOrMore < DiagramItem
    def initialize(item, repeat = nil)
      super('g')
      @item = wrap_string(item)
      repeat ||= Skip.new
      @rep = wrap_string(repeat)
      @width = [@item.width, @rep.width].max + (AR * 2)
      @height = @item.height
      @up = @item.up
      @down = [AR * 2, @item.down + VS + @rep.up + @rep.height + @rep.down].max
      @needs_space = true
    end

    def to_s
      "OneOrMore(#{@item}, repeat=#{@rep})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)

      # Hook up the two sides if self is narrower than its stated width.
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y + @height).h(right_gap).add(self)
      x += left_gap

      # Draw item
      Path.new(x, y).right(AR).add(self)
      @item.format(x + AR, y, @width - (AR * 2)).add(self)
      Path.new(x + @width - AR, y + @height).right(AR).add(self)

      # Draw repeat arc
      distance_from_y = [AR * 2, @item.height + @item.down + VS + @rep.up].max
      Path.new(x + AR, y).arc('nw').down(distance_from_y - (AR * 2)).arc('ws').add(self)
      @rep.format(x + AR, y + distance_from_y, @width - (AR * 2)).add(self)
      Path.new(x + @width - AR, y + distance_from_y + @rep.height)
          .arc('se')
          .up(distance_from_y - (AR * 2) + @rep.height - @item.height)
          .arc('en')
          .add(self)

      self
    end

    def text_diagram
      parts = TextDiagram.get_parts(
        %w[
          line repeat_top_left repeat_left repeat_bot_left repeat_top_right repeat_right repeat_bot_right
        ]
      )
      line, repeat_top_left, repeat_left, repeat_bot_left, repeat_top_right, repeat_right, repeat_bot_right = parts

      # Format the item and then format the repeat append it to the bottom, after a spacer.
      item_td = @item.text_diagram
      repeat_td = @rep.text_diagram
      fir_width = TextDiagram.max_width(item_td, repeat_td)
      repeat_td = repeat_td.expand(0, fir_width - repeat_td.width, 0, 0)
      item_td = item_td.expand(0, fir_width - item_td.width, 0, 0)
      item_and_repeat_td = item_td.append_below(repeat_td, [])

      # Build the left side of the repeat line and append the combined item and repeat to its right.
      left_lines = []
      left_lines << (repeat_top_left + line)
      left_lines += ["#{repeat_left} "] * ((item_td.height - item_td.entry) + repeat_td.entry - 1)
      left_lines << (repeat_bot_left + line)
      left_td = TextDiagram.new(0, 0, left_lines)
      left_td = left_td.append_right(item_and_repeat_td, '')

      # Build the right side of the repeat line and append it to the combined left side, item, and repeat's right.
      right_lines = []
      right_lines << (line + repeat_top_right)
      right_lines += [" #{repeat_right}"] * ((item_td.height - item_td.exit) + repeat_td.exit - 1)
      right_lines << (line + repeat_bot_right)
      right_td = TextDiagram.new(0, 0, right_lines)
      left_td.append_right(right_td, '')
    end

    def walk(callback)
      callback.call(self)
      @item.walk(callback)
      @rep.walk(callback)
    end
  end
end

# === END: railroad_diagrams/one_or_more.rb ===
# require_relative 'railroad_diagrams/optional_sequence'

# === BEGIN: railroad_diagrams/optional_sequence.rb ===


module RailroadDiagrams
  class OptionalSequence < DiagramMultiContainer
    def self.new(*items)
      return Sequence.new(*items) if items.size <= 1

      super
    end

    def initialize(*items)
      super('g', items)
      @needs_space = false
      @width = 0
      @up = 0
      @height = @items.sum(&:height)
      @down = @items.first.down

      height_so_far = 0.0

      @items.each_with_index do |item, i|
        @up = [@up, [AR * 2, item.up + VS].max - height_so_far].max
        height_so_far += item.height

        if i.positive?
          @down = [
            @height + @down,
            height_so_far + [AR * 2, item.down + VS].max
          ].max - @height
        end

        item_width = item.width + (item.needs_space ? 10 : 0)
        @width += if i.zero?
                    AR + [item_width, AR].max
                  else
                    (AR * 2) + [item_width, AR].max + AR
                  end
      end
    end

    def to_s
      items = @items.map(&:to_s).join(', ')
      "OptionalSequence(#{items})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)
      Path.new(x, y).right(left_gap).add(self)
      Path.new(x + left_gap + @width, y + @height).right(right_gap).add(self)
      x += left_gap
      upper_line_y = y - @up
      last = @items.size - 1

      @items.each_with_index do |item, i|
        item_space = item.needs_space ? 10 : 0
        item_width = item.width + item_space

        if i.zero?
          # Upper skip
          Path.new(x, y)
              .arc('se')
              .up(y - upper_line_y - (AR * 2))
              .arc('wn')
              .right(item_width - AR)
              .arc('ne')
              .down(y + item.height - upper_line_y - (AR * 2))
              .arc('ws')
              .add(self)

          # Straight line
          Path.new(x, y).right(item_space + AR).add(self)
          item.format(x + item_space + AR, y, item.width).add(self)
          x += item_width + AR
          y += item.height
        elsif i < last
          # Upper skip
          Path.new(x, upper_line_y)
              .right((AR * 2) + [item_width, AR].max + AR)
              .arc('ne')
              .down(y - upper_line_y + item.height - (AR * 2))
              .arc('ws')
              .add(self)

          # Straight line
          Path.new(x, y).right(AR * 2).add(self)
          item.format(x + (AR * 2), y, item.width).add(self)
          Path.new(x + item.width + (AR * 2), y + item.height)
              .right(item_space + AR)
              .add(self)

          # Lower skip
          Path.new(x, y)
              .arc('ne')
              .down(item.height + [item.down + VS, AR * 2].max - (AR * 2))
              .arc('ws')
              .right(item_width - AR)
              .arc('se')
              .up(item.down + VS - (AR * 2))
              .arc('wn')
              .add(self)

          x += (AR * 2) + [item_width, AR].max + AR
          y += item.height
        else
          # Straight line
          Path.new(x, y).right(AR * 2).add(self)
          item.format(x + (AR * 2), y, item.width).add(self)
          Path.new(x + (AR * 2) + item.width, y + item.height)
              .right(item_space + AR)
              .add(self)

          # Lower skip
          Path.new(x, y)
              .arc('ne')
              .down(item.height + [item.down + VS, AR * 2].max - (AR * 2))
              .arc('ws')
              .right(item_width - AR)
              .arc('se')
              .up(item.down + VS - (AR * 2))
              .arc('wn')
              .add(self)
        end
      end
      self
    end

    def text_diagram
      line, line_vertical, roundcorner_bot_left, roundcorner_bot_right,
      roundcorner_top_left, roundcorner_top_right = TextDiagram.get_parts(
        %w[line line_vertical roundcorner_bot_left roundcorner_bot_right roundcorner_top_left roundcorner_top_right]
      )

      # Format all the child items, so we can know the maximum entry.
      item_tds = @items.map(&:text_diagram)

      # diagramEntry: distance from top to lowest entry, aka distance from top to diagram entry, aka final diagram entry and exit.
      diagram_entry = item_tds.map(&:entry).max
      # SOILHeight: distance from top to lowest entry before rightmost item, aka distance from skip-over-items line to rightmost entry, aka SOIL height.
      soil_height = item_tds.map(&:entry).max
      # topToSOIL: distance from top to skip-over-items line.
      top_to_soil = diagram_entry - soil_height

      # The diagram starts with a line from its entry up to the skip-over-items line:
      lines = ['  '] * top_to_soil
      lines += [roundcorner_top_left + line]
      lines += ["#{line_vertical} "] * soil_height
      lines += [roundcorner_bot_right + line]
      diagram_td = TextDiagram.new(lines.size - 1, lines.size - 1, lines)

      item_tds.each_with_index do |item_td, i|
        if i.positive?
          # All items except the leftmost start with a line from their entry down to their skip-under-item line,
          # with a joining-line across at the skip-over-items line:
          lines = (['  '] * top_to_soil) + [line * 2] +
                  (['  '] * (diagram_td.exit - top_to_soil - 1)) +
                  [line + roundcorner_top_right] +
                  ([" #{line_vertical}"] * (item_td.height - item_td.entry - 1)) +
                  [" #{roundcorner_bot_left}"]

          skip_down_td = TextDiagram.new(diagram_td.exit, diagram_td.exit, lines)
          diagram_td = diagram_td.append_right(skip_down_td, '')

          # All items except the leftmost next have a line from skip-over-items line down to their entry,
          # with joining-lines at their entry and at their skip-under-item line:
          lines = (['  '] * top_to_soil) +
                  [line + roundcorner_top_right +
                   # All such items except the rightmost also have a continuation of the skip-over-items line:
                   (i < item_tds.size - 1 ? line : ' ')] +
                  ([" #{line_vertical} "] * (diagram_td.exit - top_to_soil - 1)) +
                  [line + roundcorner_bot_left + line] +
                  ([' ' * 3] * (item_td.height - item_td.entry - 1)) +
                  [line * 3]

          entry_td = TextDiagram.new(diagram_td.exit, diagram_td.exit, lines)
          diagram_td = diagram_td.append_right(entry_td, '')
        end

        part_td = TextDiagram.new(0, 0, [])
        if i < item_tds.size - 1
          # All items except the rightmost have a segment of the skip-over-items line at the top,
          # followed by enough blank lines to push their entry down to the previous item's exit:
          lines = [line * item_td.width] + ([' ' * item_td.width] * (soil_height - item_td.entry))
          soil_segment = TextDiagram.new(0, 0, lines)
          part_td = part_td.append_below(soil_segment, [])
        end

        part_td = part_td.append_below(item_td, [], move_entry: true, move_exit: true)

        if i.positive?
          # All items except the leftmost have their skip-under-item line at the bottom.
          soil_segment = TextDiagram.new(0, 0, [line * item_td.width])
          part_td = part_td.append_below(soil_segment, [])
        end

        diagram_td = diagram_td.append_right(part_td, '')

        next unless i.positive?

        # All items except the leftmost have a line from their skip-under-item line to their exit:
        lines = (['  '] * top_to_soil) +
                # All such items except the rightmost also have a joining-line across at the skip-over-items line:
                [(i < item_tds.size - 1 ? line * 2 : '  ')] +
                (['  '] * (diagram_td.exit - top_to_soil - 1)) +
                [line + roundcorner_top_left] +
                ([" #{line_vertical}"] * (part_td.height - part_td.exit - 2)) +
                [line + roundcorner_bot_right]

        skip_up_td = TextDiagram.new(diagram_td.exit, diagram_td.exit, lines)
        diagram_td = diagram_td.append_right(skip_up_td, '')
      end

      diagram_td
    end
  end
end

# === END: railroad_diagrams/optional_sequence.rb ===
# require_relative 'railroad_diagrams/optional'

# === BEGIN: railroad_diagrams/optional.rb ===


module RailroadDiagrams
  class Optional < DiagramMultiContainer
    def self.new(item, skip = false)
      Choice.new(skip ? 0 : 1, Skip.new, item)
    end
  end
end

# === END: railroad_diagrams/optional.rb ===
# require_relative 'railroad_diagrams/path'

# === BEGIN: railroad_diagrams/path.rb ===


module RailroadDiagrams
  class Path
    attr_reader :x, :y, :attrs

    def initialize(x, y)
      @x = x
      @y = y
      @attrs = { 'd' => "M#{x} #{y}" }
    end

    def m(x, y)
      @attrs['d'] += "m#{x} #{y}"
      self
    end

    def l(x, y)
      @attrs['d'] += "l#{x} #{y}"
      self
    end

    def h(val)
      @attrs['d'] += "h#{val}"
      self
    end

    def right(val)
      h([0, val].max)
    end

    def left(val)
      h(-[0, val].max)
    end

    def v(val)
      @attrs['d'] += "v#{val}"
      self
    end

    def down(val)
      v([0, val].max)
    end

    def up(val)
      v(-[0, val].max)
    end

    def arc_8(start, dir)
      arc = AR
      s2 = 1 / Math.sqrt(2) * arc
      s2inv = arc - s2
      sweep = dir == 'cw' ? '1' : '0'
      path = "a #{arc} #{arc} 0 0 #{sweep} "

      sd = start + dir
      offset = case sd
               when 'ncw' then [s2, s2inv]
               when 'necw' then [s2inv, s2]
               when 'ecw' then [-s2inv, s2]
               when 'secw' then [-s2, s2inv]
               when 'scw' then [-s2, -s2inv]
               when 'swcw' then [-s2inv, -s2]
               when 'wcw' then [s2inv, -s2]
               when 'nwcw' then [s2, -s2inv]
               when 'nccw' then [-s2, s2inv]
               when 'nwccw' then [-s2inv, s2]
               when 'wccw' then [s2inv, s2]
               when 'swccw' then [s2, s2inv]
               when 'sccw' then [s2, -s2inv]
               when 'seccw' then [s2inv, -s2]
               when 'eccw' then [-s2inv, -s2]
               when 'neccw' then [-s2, -s2inv]
               end

      path += offset.map(&:to_s).join(' ')
      @attrs['d'] += path
      self
    end

    def arc(sweep)
      x = AR
      y = AR
      x *= -1 if sweep[0] == 'e' || sweep[1] == 'w'
      y *= -1 if sweep[0] == 's' || sweep[1] == 'n'
      cw = %w[ne es sw wn].include?(sweep) ? 1 : 0
      @attrs['d'] += "a#{AR} #{AR} 0 0 #{cw} #{x} #{y}"
      self
    end

    def add(parent)
      parent.children << self
      self
    end

    def write_svg(write)
      write.call('<path')
      @attrs.sort.each do |name, value|
        write.call(" #{name}=\"#{RailroadDiagrams.escape_attr(value)}\"")
      end
      write.call(' />')
    end

    def format
      @attrs['d'] += 'h.5'
      self
    end

    def text_diagram
      TextDiagram.new(0, 0, [])
    end

    def to_s
      "Path(#{@x.inspect}, #{@y.inspect})"
    end
  end
end

# === END: railroad_diagrams/path.rb ===
# require_relative 'railroad_diagrams/sequence'

# === BEGIN: railroad_diagrams/sequence.rb ===


module RailroadDiagrams
  class Sequence < DiagramMultiContainer
    def initialize(*items)
      super('g', items)
      @needs_space = false
      @up = 0
      @down = 0
      @height = 0
      @width = 0
      @items.each do |item|
        @width += item.width + (item.needs_space ? 20 : 0)
        @up = [@up, item.up - @height].max
        @height += item.height
        @down = [@down - item.height, item.down].max
      end
      @width -= 10 if @items[0].needs_space
      @width -= 10 if @items[-1].needs_space
    end

    def to_s
      items = @items.map(&:to_s).join(', ')
      "Sequence(#{items})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y + @height).h(right_gap).add(self)
      x += left_gap
      @items.each_with_index do |item, i|
        if item.needs_space && i.positive?
          Path.new(x, y).h(10).add(self)
          x += 10
        end
        item.format(x, y, item.width).add(self)
        x += item.width
        y += item.height
        if item.needs_space && i < @items.length - 1
          Path.new(x, y).h(10).add(self)
          x += 10
        end
      end
      self
    end

    def text_diagram
      separator, = TextDiagram.get_parts(['separator'])
      diagram_td = TextDiagram.new(0, 0, [''])
      @items.each do |item|
        item_td = item.text_diagram
        item_td = item_td.expand(1, 1, 0, 0) if item.needs_space
        diagram_td = diagram_td.append_right(item_td, separator)
      end
      diagram_td
    end
  end
end

# === END: railroad_diagrams/sequence.rb ===
# require_relative 'railroad_diagrams/skip'

# === BEGIN: railroad_diagrams/skip.rb ===


module RailroadDiagrams
  class Skip < DiagramItem
    def initialize
      super('g')
      @width = 0
      @up = 0
      @down = 0
    end

    def to_s
      'Skip()'
    end

    def format(x, y, width)
      Path.new(x, y).right(width).add(self)
      self
    end

    def text_diagram
      line, = TextDiagram.get_parts(['line'])
      TextDiagram.new(0, 0, [line])
    end
  end
end

# === END: railroad_diagrams/skip.rb ===
# require_relative 'railroad_diagrams/stack'

# === BEGIN: railroad_diagrams/stack.rb ===


module RailroadDiagrams
  class Stack < DiagramMultiContainer
    def initialize(*items)
      super('g', items)
      @need_space = false
      @width = @items.map { |item| item.width + (item.needs_space ? 20 : 0) }.max

      # pretty sure that space calc is totes wrong
      @width += AR * 2 if @items.size > 1

      @up = @items.first.up
      @down = @items.last.down
      @height = 0
      last = @items.size - 1

      @items.each_with_index do |item, i|
        @height += item.height
        @height += [AR * 2, item.up + VS].max if i.positive?
        @height += [AR * 2, item.down + VS].max if i < last
      end
    end

    def to_s
      items = @items.map(&:to_s).join(', ')
      "Stack(#{items})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)
      Path.new(x, y).h(left_gap).add(self)
      x += left_gap
      x_initial = x
      if @items.size > 1
        Path.new(x, y).h(AR).add(self)
        x += AR
        inner_width = @width - (AR * 2)
      else
        inner_width = @width
      end

      @items.each_with_index do |item, i|
        item.format(x, y, inner_width).add(self)
        x += inner_width
        y += item.height
        next unless i != @items.size - 1

        Path.new(x, y)
            .arc('ne')
            .down([0, item.down + VS - (AR * 2)].max)
            .arc('es')
            .left(inner_width)
            .arc('nw')
            .down([0, @items[i + 1].up + VS - (AR * 2)].max)
            .arc('ws')
            .add(self)
        y += [item.down + VS, AR * 2].max + [@items[i + 1].up + VS, AR * 2].max
        x = x_initial + AR
      end
      if @items.size > 1
        Path.new(x, y).h(AR).add(self)
        x += AR
      end
      Path.new(x, y).h(right_gap).add(self)
      self
    end

    def text_diagram
      corner_bot_left, corner_bot_right, corner_top_left, corner_top_right, line, line_vertical = TextDiagram.get_parts(
        %w[corner_bot_left corner_bot_right corner_top_left corner_top_right line line_vertical]
      )

      # Format all the child items, so we can know the maximum width.
      item_tds = @items.map(&:text_diagram)
      max_width = item_tds.map(&:width).max
      left_lines = []
      right_lines = []
      separator_td = TextDiagram.new(0, 0, [line * max_width])
      diagram_td = nil # Top item will replace it.
      item_tds.each_with_index do |item_td, item_num|
        if item_num.zero?
          # The top item enters directly from its left.
          left_lines += [line * 2]
          left_lines += [' ' * 2] * (item_td.height - item_td.entry - 1)
        else
          # All items below the top enter from a snake-line from the previous item's exit.
          # Here, we resume that line, already having descended from above on the right.
          diagram_td = diagram_td.append_below(separator_td, [])
          left_lines += [corner_top_left + line]
          left_lines += ["#{line_vertical} "] * item_td.entry
          left_lines += [corner_bot_left + line]
          left_lines += [' ' * 2] * (item_td.height - item_td.entry - 1)
          right_lines += [' ' * 2] * item_td.exit
        end
        if item_num < item_tds.size - 1
          # All items above the bottom exit via a snake-line to the next item's entry.
          # Here, we start that line on the right.
          right_lines += [line + corner_top_right]
          right_lines += [" #{line_vertical}"] * (item_td.height - item_td.exit - 1)
          right_lines += [line + corner_bot_right]
        else
          # The bottom item exits directly to its right.
          right_lines += [line * 2]
        end
        left_pad, right_pad = TextDiagram.gaps(max_width, item_td.width)
        item_td = item_td.expand(left_pad, right_pad, 0, 0)
        diagram_td = if item_num.zero?
                       item_td
                     else
                       diagram_td.append_below(item_td, [])
                     end
      end
      left_td = TextDiagram.new(0, 0, left_lines)
      diagram_td = left_td.append_right(diagram_td, '')
      right_td = TextDiagram.new(0, right_lines.size - 1, right_lines)
      diagram_td.append_right(right_td, '')
      diagram_td
    end
  end
end

# === END: railroad_diagrams/stack.rb ===
# require_relative 'railroad_diagrams/start'

# === BEGIN: railroad_diagrams/start.rb ===


module RailroadDiagrams
  class Start < DiagramItem
    def initialize(type = 'simple', label: nil)
      super('g')
      @width =
        if label
          [20, (label.length * CHAR_WIDTH) + 10].max
        else
          20
        end
      @up = 10
      @down = 10
      @type = type
      @label = label
    end

    def to_s
      "Start(#{@type}, label=#{@label})"
    end

    def format(x, y, _width)
      path = Path.new(x, y - 10)
      if @type == 'complex'
        path.down(20).m(0, -10).right(@width).add(self)
      else
        path.down(20).m(10, -20).down(20).m(-10, -10).right(@width).add(self)
      end
      if @label
        DiagramItem.new(
          'text',
          attrs: {
            'x' => x,
            'y' => y - 15,
            'style' => 'text-anchor:start'
          },
          text: @label
        ).add(self)
      end
      self
    end

    def text_diagram
      cross, line, tee_right = TextDiagram.get_parts(%w[cross line tee_right])
      start =
        if @type == 'simple'
          tee_right + cross + line
        else
          tee_right + line
        end

      label_td = TextDiagram.new(0, 0, [])
      if @label
        label_td = TextDiagram.new(0, 0, [@label])
        start = TextDiagram.pad_r(start, label_td.width, line)
      end
      start_td = TextDiagram.new(0, 0, [start])
      label_td.append_below(start_td, [], move_entry: true, move_exit: true)
    end
  end
end

# === END: railroad_diagrams/start.rb ===
# require_relative 'railroad_diagrams/style'

# === BEGIN: railroad_diagrams/style.rb ===


module RailroadDiagrams
  class Style
    def initialize(css)
      @css = css
    end

    class << self
      def default_style
        <<~CSS
          * {
            color: #333333;
          }
          svg.railroad-diagram {
            background-color: white;
          }
          svg.railroad-diagram path {
            stroke-width:3;
            stroke:black;
            fill:rgba(0,0,0,0);
          }
          svg.railroad-diagram text {
            font:bold 14px monospace;
            text-anchor:middle;
          }
          svg.railroad-diagram text.label {
            text-anchor:start;
          }
          svg.railroad-diagram text.comment {
            font:italic 12px monospace;
          }
          svg.railroad-diagram rect {
            stroke-width:3;
            stroke: #333333;
            fill:hsl(120,100%,90%);
          }
          svg.railroad-diagram path {
            stroke: #333333;
          }
          svg.railroad-diagram .terminal rect {
            fill: hsl(190, 100%, 83%);
          }
          svg.railroad-diagram .non-terminal rect {
            fill: hsl(223, 100%, 83%);
          }
          svg.railroad-diagram rect.group-box {
            stroke: gray;
            stroke-dasharray: 10 5;
            fill: none;
          }
        CSS
      end
    end

    def to_s
      "Style(#{@css})"
    end

    def add(parent)
      parent.children.push(self)
      self
    end

    def format
      self
    end

    def text_diagram
      TextDiagram.new
    end

    def write_svg(write)
      # Write included stylesheet as CDATA. See https://developer.mozilla.org/en-US/docs/Web/SVG/Element/style
      cdata = "/* <![CDATA[ */\n#{@css}\n/* ]]> */\n"
      write.call("<style>#{cdata}</style>")
    end
  end
end

# === END: railroad_diagrams/style.rb ===
# require_relative 'railroad_diagrams/terminal'

# === BEGIN: railroad_diagrams/terminal.rb ===


module RailroadDiagrams
  class Terminal < DiagramItem
    def initialize(text, href = nil, title = nil, cls: '')
      super('g', attrs: { 'class' => "terminal #{cls}" })
      @text = text
      @href = href
      @title = title
      @cls = cls
      @width = (text.length * CHAR_WIDTH) + 20
      @up = 11
      @down = 11
      @needs_space = true
    end

    def to_s
      "Terminal(#{@text}, href=#{@href}, title=#{@title}, cls=#{@cls})"
    end

    def format(x, y, width)
      left_gap, right_gap = determine_gaps(width, @width)

      # Hook up the two sides if self is narrower than its stated width.
      Path.new(x, y).h(left_gap).add(self)
      Path.new(x + left_gap + @width, y).h(right_gap).add(self)

      DiagramItem.new(
        'rect',
        attrs: {
          'x' => x + left_gap,
          'y' => y - 11,
          'width' => @width,
          'height' => @up + @down,
          'rx' => 10,
          'ry' => 10
        }
      ).add(self)

      text = DiagramItem.new(
        'text',
        attrs: {
          'x' => x + left_gap + (@width / 2),
          'y' => y + 4
        },
        text: @text
      )
      if @href
        a = DiagramItem.new('a', attrs: { 'xlink:href' => @href }, text: text).add(self)
        text.add(a)
      else
        text.add(self)
      end
      DiagramItem.new('title', attrs: {}, text: @title).add(self) if @title
      self
    end

    def text_diagram
      # NOTE: href, title, and cls are ignored for text diagrams.
      TextDiagram.round_rect(@text)
    end
  end
end

# === END: railroad_diagrams/terminal.rb ===
# require_relative 'railroad_diagrams/text_diagram'

# === BEGIN: railroad_diagrams/text_diagram.rb ===


module RailroadDiagrams
  class TextDiagram
    PARTS_UNICODE = {
      'cross_diag' => '╳',
      'corner_bot_left' => '└',
      'corner_bot_right' => '┘',
      'corner_top_left' => '┌',
      'corner_top_right' => '┐',
      'cross' => '┼',
      'left' => '│',
      'line' => '─',
      'line_vertical' => '│',
      'multi_repeat' => '↺',
      'rect_bot' => '─',
      'rect_bot_dashed' => '┄',
      'rect_bot_left' => '└',
      'rect_bot_right' => '┘',
      'rect_left' => '│',
      'rect_left_dashed' => '┆',
      'rect_right' => '│',
      'rect_right_dashed' => '┆',
      'rect_top' => '─',
      'rect_top_dashed' => '┄',
      'rect_top_left' => '┌',
      'rect_top_right' => '┐',
      'repeat_bot_left' => '╰',
      'repeat_bot_right' => '╯',
      'repeat_left' => '│',
      'repeat_right' => '│',
      'repeat_top_left' => '╭',
      'repeat_top_right' => '╮',
      'right' => '│',
      'roundcorner_bot_left' => '╰',
      'roundcorner_bot_right' => '╯',
      'roundcorner_top_left' => '╭',
      'roundcorner_top_right' => '╮',
      'roundrect_bot' => '─',
      'roundrect_bot_dashed' => '┄',
      'roundrect_bot_left' => '╰',
      'roundrect_bot_right' => '╯',
      'roundrect_left' => '│',
      'roundrect_left_dashed' => '┆',
      'roundrect_right' => '│',
      'roundrect_right_dashed' => '┆',
      'roundrect_top' => '─',
      'roundrect_top_dashed' => '┄',
      'roundrect_top_left' => '╭',
      'roundrect_top_right' => '╮',
      'separator' => '─',
      'tee_left' => '┤',
      'tee_right' => '├'
    }.freeze

    PARTS_ASCII = {
      'cross_diag' => 'X',
      'corner_bot_left' => '\\',
      'corner_bot_right' => '/',
      'corner_top_left' => '/',
      'corner_top_right' => '\\',
      'cross' => '+',
      'left' => '|',
      'line' => '-',
      'line_vertical' => '|',
      'multi_repeat' => '&',
      'rect_bot' => '-',
      'rect_bot_dashed' => '-',
      'rect_bot_left' => '+',
      'rect_bot_right' => '+',
      'rect_left' => '|',
      'rect_left_dashed' => '|',
      'rect_right' => '|',
      'rect_right_dashed' => '|',
      'rect_top' => '-',
      'rect_top_dashed' => '-',
      'rect_top_left' => '+',
      'rect_top_right' => '+',
      'repeat_bot_left' => '\\',
      'repeat_bot_right' => '/',
      'repeat_left' => '|',
      'repeat_right' => '|',
      'repeat_top_left' => '/',
      'repeat_top_right' => '\\',
      'right' => '|',
      'roundcorner_bot_left' => '\\',
      'roundcorner_bot_right' => '/',
      'roundcorner_top_left' => '/',
      'roundcorner_top_right' => '\\',
      'roundrect_bot' => '-',
      'roundrect_bot_dashed' => '-',
      'roundrect_bot_left' => '\\',
      'roundrect_bot_right' => '/',
      'roundrect_left' => '|',
      'roundrect_left_dashed' => '|',
      'roundrect_right' => '|',
      'roundrect_right_dashed' => '|',
      'roundrect_top' => '-',
      'roundrect_top_dashed' => '-',
      'roundrect_top_left' => '/',
      'roundrect_top_right' => '\\',
      'separator' => '-',
      'tee_left' => '|',
      'tee_right' => '|'
    }.freeze

    class << self
      attr_accessor :parts

      def set_formatting(characters = nil, defaults = nil)
        return unless characters

        @parts = defaults ? defaults.dup : {}
        @parts.merge!(characters)
        @parts.each do |name, value|
          raise ArgumentError, "Text part #{name} is more than 1 character: #{value}" if value.size != 1
        end
      end

      def rect(item, dashed: false)
        rectish('rect', item, dashed)
      end

      def round_rect(item, dashed: false)
        rectish('roundrect', item, dashed)
      end

      def max_width(*args)
        max_width = 0
        args.each do |arg|
          width =
            case arg
            when TextDiagram
              arg.width
            when Array
              arg.map(&:length).max
            when Numeric
              arg.to_s.length
            else
              arg.length
            end
          max_width = width if width > max_width
        end
        max_width
      end

      def pad_l(string, width, pad)
        gap = width - string.length
        raise "Gap #{gap} must be a multiple of pad string '#{pad}'" unless (gap % pad.length).zero?

        (pad * (gap / pad.length)) + string
      end

      def pad_r(string, width, pad)
        gap = width - string.length
        raise "Gap #{gap} must be a multiple of pad string '#{pad}'" unless (gap % pad.length).zero?

        string + (pad * (gap / pad.length))
      end

      def get_parts(part_names)
        part_names.map { |name| @parts[name] }
      end

      def enclose_lines(lines, lefts, rights)
        unless lines.length == lefts.length && lines.length == rights.length
          raise 'All arguments must be the same length'
        end

        lines.each_with_index.map { |line, i| lefts[i] + line + rights[i] }
      end

      def gaps(outer_width, inner_width)
        diff = outer_width - inner_width
        case INTERNAL_ALIGNMENT
        when 'left'
          [0, diff]
        when 'right'
          [diff, 0]
        else
          left = diff / 2
          right = diff - left
          [left, right]
        end
      end

      private

      def rectish(rect_type, data, dashed)
        line_type = dashed ? '_dashed' : ''
        top_left, ctr_left, bot_left, top_right, ctr_right, bot_right, top_horiz, bot_horiz, line, cross =
          get_parts([
                      "#{rect_type}_top_left",
                      "#{rect_type}_left#{line_type}",
                      "#{rect_type}_bot_left",
                      "#{rect_type}_top_right",
                      "#{rect_type}_right#{line_type}",
                      "#{rect_type}_bot_right",
                      "#{rect_type}_top#{line_type}",
                      "#{rect_type}_bot#{line_type}",
                      'line',
                      'cross'
                    ])

        item_td = data.is_a?(TextDiagram) ? data : new(0, 0, [data])

        lines = [top_horiz * (item_td.width + 2)]
        if data.is_a?(TextDiagram)
          lines += item_td.expand(1, 1, 0, 0).lines
        else
          (0...item_td.lines.length).each do |i|
            lines += [" #{item_td.lines[i]} "]
          end
        end
        lines += [(bot_horiz * (item_td.width + 2))]

        entry = item_td.entry + 1
        exit = item_td.exit + 1

        left_max_width = max_width(top_left, ctr_left, bot_left)
        lefts = [pad_r(ctr_left, left_max_width, ' ')] * lines.length
        lefts[0] = pad_r(top_left, left_max_width, top_horiz)
        lefts[-1] = pad_r(bot_left, left_max_width, bot_horiz)
        lefts[entry] = cross if data.is_a?(TextDiagram)

        right_max_width = max_width(top_right, ctr_right, bot_right)
        rights = [pad_l(ctr_right, right_max_width, ' ')] * lines.length
        rights[0] = pad_l(top_right, right_max_width, top_horiz)
        rights[-1] = pad_l(bot_right, right_max_width, bot_horiz)
        rights[exit] = cross if data.is_a?(TextDiagram)

        lines = enclose_lines(lines, lefts, rights)

        lefts = [' '] * lines.length
        lefts[entry] = line
        rights = [' '] * lines.length
        rights[exit] = line

        lines = enclose_lines(lines, lefts, rights)

        new(entry, exit, lines)
      end
    end

    attr_reader :entry, :exit, :height, :lines, :width

    def initialize(entry, exit, lines)
      @entry = entry
      @exit = exit
      @lines = lines.dup
      @height = lines.size
      @width = lines.any? ? lines[0].length : 0

      raise "Entry is not within diagram vertically:\n#{dump(false)}" unless entry <= lines.length
      raise "Exit is not within diagram vertically:\n#{dump(false)}" unless exit <= lines.length

      lines.each do |line|
        raise "Diagram data is not rectangular:\n#{dump(false)}" unless lines[0].length == line.length
      end
    end

    def alter(new_entry: nil, new_exit: nil, new_lines: nil)
      self.class.new(
        new_entry || @entry,
        new_exit || @exit,
        new_lines || @lines.dup
      )
    end

    def append_below(item, lines_between, move_entry: false, move_exit: false)
      new_width = [@width, item.width].max
      new_lines = center(new_width).lines
      lines_between.each { |line| new_lines << TextDiagram.pad_r(line, new_width, ' ') }
      new_lines += item.center(new_width).lines

      new_entry = move_entry ? @height + lines_between.size + item.entry : @entry
      new_exit = move_exit ? @height + lines_between.size + item.exit : @exit

      self.class.new(new_entry, new_exit, new_lines)
    end

    def append_right(item, chars_between)
      join_line = [@exit, item.entry].max
      new_height = [@height - @exit, item.height - item.entry].max + join_line

      left = expand(0, 0, join_line - @exit, new_height - @height - (join_line - @exit))
      right = item.expand(0, 0, join_line - item.entry, new_height - item.height - (join_line - item.entry))

      new_lines = (0...new_height).map do |i|
        sep = i == join_line ? chars_between : ' ' * chars_between.size
        left_line = i < left.lines.size ? left.lines[i] : ' ' * left.width
        right_line = i < right.lines.size ? right.lines[i] : ' ' * right.width
        "#{left_line}#{sep}#{right_line}"
      end

      self.class.new(
        @entry + (join_line - @exit),
        item.exit + (join_line - item.entry),
        new_lines
      )
    end

    def center(new_width, pad = ' ')
      raise 'Cannot center into smaller width' if width < @width
      return copy if new_width == @width

      total_padding = new_width - @width
      left_width = total_padding / 2
      left = [pad * left_width] * @height
      right = [pad * (total_padding - left_width)] * @height

      self.class.new(@entry, @exit, self.class.enclose_lines(@lines, left, right))
    end

    def copy
      self.class.new(@entry, @exit, @lines.dup)
    end

    def expand(left, right, top, bottom)
      return copy if [left, right, top, bottom].all?(&:zero?)

      new_lines = []
      top.times { new_lines << (' ' * (@width + left + right)) }

      @lines.each do |line|
        left_part = (line == @lines[@entry] ? self.class.parts['line'] : ' ') * left
        right_part = (line == @lines[@exit] ? self.class.parts['line'] : ' ') * right
        new_lines << "#{left_part}#{line}#{right_part}"
      end

      bottom.times { new_lines << (' ' * (@width + left + right)) }

      self.class.new(
        @entry + top,
        @exit + top,
        new_lines
      )
    end

    def dump(show = true)
      result = "height=#{@height}; len(lines)=#{@lines.length}"

      result += "; entry outside diagram: entry=#{@ntry}" if @entry > @lines.length
      result += "; exit outside diagram: exit=#{@exit}" if @exit > @lines.length

      (0...[@lines.length, @entry + 1, @exit + 1].max).each do |y|
        result += "\n[#{format('%03d', y)}]"
        result += " '#{@lines[y]}' len=#{@lines[y].length}" if y < @lines.length
        if y == @entry && y == @exit
          result += ' <- entry, exit'
        elsif y == @entry
          result += ' <- entry'
        elsif y == @exit
          result += ' <- exit'
        end
      end

      if show
        puts result
      else
        result
      end
    end

    private

    def inspect
      output = ["TextDiagram(entry=#{@entry}, exit=#{@exit}, height=#{@height})"]
      @lines.each_with_index do |line, i|
        marker = []
        marker << 'entry' if i == @entry
        marker << 'exit' if i == @exit
        output << (format('%3d: %-20s %s', i, line.inspect, marker.join(', ')))
      end
      output.join("\n")
    end
  end
end

# === END: railroad_diagrams/text_diagram.rb ===
# require_relative 'railroad_diagrams/version'

# === BEGIN: railroad_diagrams/version.rb ===


module RailroadDiagrams
  VERSION = '0.3.0'
end

# === END: railroad_diagrams/version.rb ===
# require_relative 'railroad_diagrams/zero_or_more'

# === BEGIN: railroad_diagrams/zero_or_more.rb ===


module RailroadDiagrams
  class ZeroOrMore
    def self.new(item, repeat = nil, skip = false)
      Optional.new(OneOrMore.new(item, repeat), skip)
    end
  end
end

# === END: railroad_diagrams/zero_or_more.rb ===

# === END: railroad_diagrams.rb ===