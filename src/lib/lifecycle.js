export function createLifecycle() {
  const disposers = [];
  let disposed = false;

  const add = (disposer) => {
    if (typeof disposer !== 'function') {
      throw new TypeError('Lifecycle disposer must be a function');
    }

    if (disposed) {
      disposer();
      return disposer;
    }

    disposers.push(disposer);
    return disposer;
  };

  const listen = (target, type, listener, options) => {
    if (!target || typeof target.addEventListener !== 'function') {
      throw new TypeError(`Cannot listen for ${type} on an invalid target`);
    }

    target.addEventListener(type, listener, options);
    return add(() => target.removeEventListener(type, listener, options));
  };

  const addDisposable = (disposable) => {
    if (!disposable) return null;

    if (typeof disposable === 'function') {
      return add(disposable);
    }

    if (typeof disposable.dispose === 'function') {
      return add(() => disposable.dispose());
    }

    throw new TypeError('Disposable must be a function or expose dispose()');
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;

    while (disposers.length > 0) {
      const disposer = disposers.pop();
      disposer();
    }
  };

  return {
    add,
    addDisposable,
    listen,
    dispose,
  };
}
