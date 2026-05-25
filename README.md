# Lrama Corral

Lrama Corral is a browser-based visual editor for Lrama grammar files (`.y`).
It runs Lrama inside Ruby Wasm, so grammar editing, parsing, validation, and
visualization work without a backend server.

Live demo: https://ydah.github.io/lrama-corral/

## What It Does

- Edits Yacc/Bison-style `.y` files with Monaco Editor.
- Parses and validates grammars with Lrama in a Web Worker.
- Shows grammar structure, FIRST/FOLLOW sets, conflicts, state transitions, and
  parse tables.
- Renders LALR state graphs, nonterminal dependency graphs, and syntax diagrams.
- Tracks `%expect` and `%expect-rr` against actual conflict counts.
- Supports symbol editing, rule editing, rename helpers, and undefined-symbol
  registration.
- Keeps up to three grammar tabs with separate parse results.
- Imports files by upload or drag-and-drop, and exports grammars, reports, SVG,
  and PNG diagrams.
- Saves drafts and theme preferences locally in the browser.

## Quick Start

### Use The Hosted App

Open https://ydah.github.io/lrama-corral/. No installation is required.

### Run Locally

```bash
git clone https://github.com/ydah/lrama-corral.git
cd lrama-corral
npm install
npm run dev
```

Vite prints the local URL when the dev server starts, usually
`http://localhost:5173/`.

## Usage

1. Load a bundled sample or upload a `.y`, `.yacc`, or `.yy` file.
2. Edit the grammar in Monaco Editor.
3. Click **Parse** to inspect grammar structure, conflicts, tables, and diagrams.
4. Click **Validate** for syntax-focused checks.
5. Export the edited grammar, an HTML report, or individual diagrams.

Keyboard-oriented actions are available through the command palette.

## Development

```bash
npm install
npm run dev
```

Common commands:

```bash
npm test
npm run build
npm run test:e2e
npm run test:ruby
npm run check:public-bundles
npm run size:check
npm run audit:moderate
```

Optional commands:

```bash
npm run preview
npm run build:wasm
```

## Project Layout

- `src/main.js` - Main browser UI, editor wiring, rendering, and interactions.
- `src/lib/lrama-bridge.js` - Request/response bridge for the Ruby Wasm worker.
- `src/lib/lrama-worker.js` - Worker-side Ruby Wasm and Lrama API execution.
- `ruby/src/lrama_api.rb` - Browser-facing Ruby API around Lrama.
- `public/` - Static runtime assets loaded by the browser build.
- `test/` - Unit and Playwright smoke tests.
- `scripts/` - Bundle checks, Ruby smoke tests, and Wasm build helpers.

## Architecture Notes

The app is static once built. The browser loads `ruby.wasm`, the bundled Lrama
runtime, and the Ruby API into a Web Worker. JavaScript sends grammar source to
the worker, receives JSON parse results, and renders the editor-side UI from
those results.

User grammar text is kept in the browser. There is no application server and no
remote parse endpoint.

## Core Technologies

- [Ruby Wasm](https://github.com/ruby/ruby.wasm) - Run Ruby in the browser
- [Lrama](https://github.com/ruby/lrama) - LALR(1) parser generator
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Playwright](https://playwright.dev/) - Browser smoke tests
- [Vite](https://vite.dev/) - Frontend build tool

## Contributing

Before opening a pull request, run the relevant checks:

```bash
npm test
npm run build
npm run test:e2e
```

Changes that touch the Ruby API or public runtime bundles should also run:

```bash
npm run test:ruby
npm run check:public-bundles
```

## References

- [Lrama GitHub Repository](https://github.com/ruby/lrama)
- [Lrama Documentation](https://ruby.github.io/lrama/)
- [ruby.wasm](https://github.com/ruby/ruby.wasm)

## License

MIT
