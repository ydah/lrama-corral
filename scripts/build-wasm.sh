#!/bin/bash

# Lrama Corral - Wasm Build Script
# Script to build Ruby Wasm module

set -e

echo "=== Lrama Corral Wasm Build ==="
echo ""

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUBY_DIR="${PROJECT_ROOT}/ruby"
PUBLIC_DIR="${PROJECT_ROOT}/public"

echo "Project root: ${PROJECT_ROOT}"
echo "Ruby directory: ${RUBY_DIR}"
echo "Public directory: ${PUBLIC_DIR}"
echo ""

# Check directory
if [ ! -d "${RUBY_DIR}" ]; then
  echo "Error: Ruby directory not found: ${RUBY_DIR}"
  exit 1
fi

# Check Bundler installation
if ! command -v bundle &> /dev/null; then
  echo "Error: bundler is not installed. Please run: gem install bundler"
  exit 1
fi

# Change to ruby directory
cd "${RUBY_DIR}"

# Install Ruby gems
echo "Installing Ruby gems..."
bundle install
echo ""

# Check rbwasm command
if ! command -v rbwasm &> /dev/null; then
  echo "Installing rbwasm..."
  bundle exec rake rbwasm:install
  echo ""
fi

# Build Wasm module
echo "Building Wasm module..."
echo "This may take a few minutes..."
echo ""

# Build with rbwasm build command
# Note: --src-dir is not supported in this version of ruby_wasm
# We'll load Ruby files via fetch() in JavaScript instead
bundle exec rbwasm build \
  --ruby-version 3.2 \
  --target wasm32-unknown-wasi \
  --build-profile full \
  -o "${PUBLIC_DIR}/ruby.wasm"

echo ""
echo "=== Build completed ==="
echo "Output: ${PUBLIC_DIR}/ruby.wasm"

# Show file size
if [ -f "${PUBLIC_DIR}/ruby.wasm" ]; then
  FILESIZE=$(du -h "${PUBLIC_DIR}/ruby.wasm" | cut -f1)
  echo "File size: ${FILESIZE}"
else
  echo "Warning: Output file not found"
  exit 1
fi

echo ""
echo "Next steps:"
echo "  1. Run 'npm install' to install frontend dependencies"
echo "  2. Run 'npm run dev' to start development server"
echo ""
