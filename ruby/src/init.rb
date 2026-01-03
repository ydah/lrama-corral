# frozen_string_literal: true

# Lrama Corral - Ruby Wasm Initialization
# This file is loaded first in the Wasm environment

puts "Loading Lrama Corral..."

# Load the Lrama bundle and API
require_relative 'lrama_api'

puts "Lrama version: #{Lrama::VERSION}"
puts "Lrama Corral initialized successfully!"
