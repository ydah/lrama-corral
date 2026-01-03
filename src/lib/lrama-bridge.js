import { DefaultRubyVM } from '@ruby/wasm-wasi/dist/browser';

/**
 * LramaBridge - Communication bridge between Ruby Wasm and JavaScript
 */
class LramaBridge {
  constructor() {
    this.vm = null;
    this.ready = false;
    this.initPromise = null;
  }

  /**
   * Initialize Ruby Wasm VM
   * @returns {Promise<void>}
   */
  async init() {
    if (this.ready) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        console.log('Initializing Ruby Wasm VM...');

        // Initialize Ruby VM
        // Use document.baseURI to resolve paths correctly for GitHub Pages
        const baseUrl = new URL('./', document.baseURI).href;
        const response = await fetch(new URL('ruby.wasm', baseUrl));
        const buffer = await response.arrayBuffer();
        const module = await WebAssembly.compile(buffer);

        // DefaultRubyVM is a function, not a constructor
        const { vm } = await DefaultRubyVM(module);
        this.vm = vm;

        console.log('Loading Lrama bundle...');

        // Load lrama_bundle.rb (all Lrama code)
        // Add timestamp for cache busting
        const bundleResponse = await fetch(new URL(`lrama_bundle.rb?v=${Date.now()}`, baseUrl), {
          cache: 'no-store'
        });
        const bundleCode = await bundleResponse.text();
        this.vm.eval(bundleCode);

        console.log('Loading Railroad Diagrams bundle...');

        // Load railroad_diagrams_bundle.rb
        const railroadBundleResponse = await fetch(new URL(`railroad_diagrams_bundle.rb?v=${Date.now()}`, baseUrl), {
          cache: 'no-store'
        });
        const railroadBundleCode = await railroadBundleResponse.text();
        this.vm.eval(railroadBundleCode);

        console.log('Loading Lrama API...');

        // Load lrama_api.rb
        const apiResponse = await fetch(new URL(`lrama_api.rb?v=${Date.now()}`, baseUrl), {
          cache: 'no-store'
        });
        const apiCode = await apiResponse.text();

        // Comment out require statements for lrama_bundle.rb and railroad_diagrams_bundle.rb
        const modifiedApiCode = apiCode
          .replace(
            'require_relative \'lrama_bundle\'',
            '# require_relative \'lrama_bundle\' # Already loaded'
          )
          .replace(
            'require_relative \'railroad_diagrams_bundle\'',
            '# require_relative \'railroad_diagrams_bundle\' # Already loaded'
          );

        this.vm.eval(modifiedApiCode);

        this.ready = true;
        console.log('Ruby Wasm VM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Ruby Wasm VM:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Check if initialization is complete
   * @private
   */
  _ensureReady() {
    if (!this.ready) {
      throw new Error('Ruby Wasm VM is not initialized. Call init() first.');
    }
  }

  /**
   * Parse .y file content
   * @param {string} source - .y file content
   * @returns {Promise<Object>} Parse result (JSON)
   */
  async parse(source) {
    this._ensureReady();

    try {
      const result = this.vm.eval(`
        LramaAPI.call('parse', ${JSON.stringify(source)})
      `);

      return JSON.parse(result.toString());
    } catch (error) {
      console.error('Parse error:', error);
      return {
        success: false,
        errors: [{
          message: error.message,
          location: { line: 0, column: 0 },
          severity: 'error'
        }]
      };
    }
  }

  /**
   * Validate .y file content
   * @param {string} source - .y file content
   * @returns {Promise<Object>} Validation result (JSON)
   */
  async validate(source) {
    this._ensureReady();

    try {
      const result = this.vm.eval(`
        LramaAPI.call('validate', ${JSON.stringify(source)})
      `);

      return JSON.parse(result.toString());
    } catch (error) {
      console.error('Validation error:', error);
      return {
        success: true,
        valid: false,
        errors: [{
          message: error.message,
          location: { line: 0, column: 0 },
          severity: 'error'
        }]
      };
    }
  }

  /**
   * Check if VM is initialized
   * @returns {boolean}
   */
  isReady() {
    return this.ready;
  }
}

// Export singleton instance
export const lramaBridge = new LramaBridge();
