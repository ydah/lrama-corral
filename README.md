# Lrama Corral

A visual editor for Lrama grammar files (.y files) powered by Ruby Wasm.

Live Demo: https://ydah.github.io/lrama-corral/

## Features

- Monaco Editor with Yacc/Bison syntax highlighting
- Real-time parsing with Lrama via Ruby Wasm
- Grammar analysis (First/Follow sets, conflict detection, state transitions)
- Interactive diagrams (syntax diagrams and LALR state machine visualization)
- Dark mode support with localStorage persistence
- Responsive design for desktop, tablet, and mobile
- File operations (upload, download, drag-and-drop)
- Runs entirely in the browser (no server required)

## Quick Start

### Use Online

Visit https://ydah.github.io/lrama-corral/ - No installation required!

### Run Locally

```bash
# Clone the repository
git clone https://github.com/ydah/lrama-corral.git
cd lrama-corral

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will open at http://localhost:3000

## Usage

1. Load a grammar - Select a sample or upload your .y file
2. Edit - Use the Monaco Editor with syntax highlighting
3. Parse - Analyze your grammar structure
4. Validate - Check for syntax errors
5. Download - Save your edited grammar

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Rebuild Ruby Wasm (optional)
npm run build:wasm
```

## Technologies

- [Ruby Wasm](https://github.com/ruby/ruby.wasm) - Run Ruby in the browser
- [Lrama](https://github.com/ruby/lrama) - LALR(1) parser generator
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Vite](https://vitejs.dev/) - Frontend build tool

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## References

- [Lrama GitHub Repository](https://github.com/ruby/lrama)
- [Lrama Documentation](https://ruby.github.io/lrama/)
- [ruby.wasm](https://github.com/ruby/ruby.wasm)
