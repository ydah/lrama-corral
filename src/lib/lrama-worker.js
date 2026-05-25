import { DefaultRubyVM } from '@ruby/wasm-wasi/dist/browser';

let vm = null;
let ready = false;
let initPromise = null;
let baseUrl = null;

function notify(message) {
  self.postMessage({ type: 'progress', message });
}

async function loadRubyText(path) {
  const cache = import.meta.env.DEV ? 'no-store' : 'default';
  const response = await fetch(new URL(path, baseUrl), { cache });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function init(payload) {
  if (ready) return;
  if (initPromise) return initPromise;

  baseUrl = payload.baseUrl;
  initPromise = (async () => {
    notify('Initializing Ruby Wasm VM...');

    notify('Downloading ruby.wasm...');
    const wasmResponse = await fetch(new URL('ruby.wasm', baseUrl));
    if (!wasmResponse.ok) {
      throw new Error(`Failed to load ruby.wasm: ${wasmResponse.status} ${wasmResponse.statusText}`);
    }

    const buffer = await wasmResponse.arrayBuffer();
    notify('Compiling ruby.wasm...');
    const module = await WebAssembly.compile(buffer);
    const ruby = await DefaultRubyVM(module);
    vm = ruby.vm;

    notify('Loading Lrama bundle...');
    vm.eval(await loadRubyText('lrama_bundle.rb'));

    notify('Loading Railroad Diagrams bundle...');
    vm.eval(await loadRubyText('railroad_diagrams_bundle.rb'));

    notify('Loading Lrama API...');
    const apiCode = await loadRubyText('lrama_api.rb');
    const modifiedApiCode = apiCode
      .replace(
        'require_relative \'lrama_bundle\'',
        '# require_relative \'lrama_bundle\' # Already loaded'
      )
      .replace(
        'require_relative \'railroad_diagrams_bundle\'',
        '# require_relative \'railroad_diagrams_bundle\' # Already loaded'
      );
    vm.eval(modifiedApiCode);

    ready = true;
    notify('Ruby Wasm VM initialized successfully');
  })();

  return initPromise;
}

function encodeSource(source) {
  const bytes = new TextEncoder().encode(source);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function callRuby(methodName, source) {
  if (!ready || !vm) {
    throw new Error('Ruby Wasm VM is not initialized. Call init() first.');
  }

  const sourceHex = encodeSource(source);
  const result = vm.eval(`
    LramaAPI.call('${methodName}', ['${sourceHex}'].pack('H*').force_encoding('UTF-8'))
  `);

  return JSON.parse(result.toString());
}

self.addEventListener('message', async (event) => {
  const { id, type, payload = {} } = event.data;

  try {
    if (type === 'init') {
      await init(payload);
      self.postMessage({ id, type: 'result', result: { ready: true } });
      return;
    }

    if (type === 'parse' || type === 'validate') {
      const result = callRuby(type, payload.source || '');
      self.postMessage({ id, type: 'result', result });
      return;
    }

    self.postMessage({
      id,
      type: 'error',
      error: { message: `Unknown worker command: ${type}` },
    });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
  }
});
