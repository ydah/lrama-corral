const INIT_TIMEOUT_MS = 60_000;
const CALL_TIMEOUT_MS = 20_000;

/**
 * LramaBridge - Worker-backed communication bridge between Ruby Wasm and JavaScript.
 */
class LramaBridge {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.initPromise = null;
    this.progress = null;
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
  }

  _createWorker() {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./lrama-worker.js', import.meta.url), {
      type: 'module',
      name: 'lrama-worker',
    });

    this.worker.addEventListener('message', (event) => this._handleWorkerMessage(event.data));
    this.worker.addEventListener('error', (event) => {
      this._rejectAll(new Error(event.message || 'Lrama worker failed'));
      this.reset();
    });

    return this.worker;
  }

  _handleWorkerMessage(message) {
    if (message.type === 'progress') {
      this._notify(message.message);
      return;
    }

    const request = this.pendingRequests.get(message.id);
    if (!request) return;

    clearTimeout(request.timeoutId);
    this.pendingRequests.delete(message.id);

    if (message.type === 'result') {
      request.resolve(message.result);
      return;
    }

    const error = new Error(message.error?.message || 'Lrama worker request failed');
    error.stack = message.error?.stack || error.stack;
    request.reject(error);
  }

  _rejectAll(error) {
    this.pendingRequests.forEach((request) => {
      clearTimeout(request.timeoutId);
      request.reject(error);
    });
    this.pendingRequests.clear();
  }

  _notify(message) {
    console.log(message);
    if (this.progress) {
      this.progress(message);
    }
  }

  _request(type, payload = {}, timeoutMs = CALL_TIMEOUT_MS) {
    const worker = this._createWorker();
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`${type} timed out after ${timeoutMs / 1000} seconds`));
        this.reset();
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeoutId });
      worker.postMessage({ id, type, payload });
    });
  }

  /**
   * Initialize Ruby Wasm VM in a Web Worker.
   * @returns {Promise<void>}
   */
  async init(progress = null) {
    if (progress) {
      this.progress = progress;
    }

    if (this.ready) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    const baseUrl = new URL('./', document.baseURI).href;
    this.initPromise = this._request('init', { baseUrl }, INIT_TIMEOUT_MS)
      .then(() => {
        this.ready = true;
      })
      .catch((error) => {
        this.ready = false;
        this.initPromise = null;
        throw error;
      });

    return this.initPromise;
  }

  _ensureReady() {
    if (!this.ready) {
      throw new Error('Ruby Wasm VM is not initialized. Call init() first.');
    }
  }

  async parse(source) {
    this._ensureReady();

    try {
      return await this._request('parse', { source });
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

  async validate(source) {
    this._ensureReady();

    try {
      return await this._request('validate', { source });
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

  reset() {
    if (this.worker) {
      this.worker.terminate();
    }

    this.worker = null;
    this.ready = false;
    this.initPromise = null;
    this._rejectAll(new Error('Ruby Wasm VM was reset'));
  }

  isReady() {
    return this.ready;
  }
}

export const lramaBridge = new LramaBridge();
