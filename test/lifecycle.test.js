import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLifecycle } from '../src/lib/lifecycle.js';

test('createLifecycle removes registered event listeners on dispose', () => {
  const lifecycle = createLifecycle();
  const target = new EventTarget();
  let clicks = 0;

  lifecycle.listen(target, 'click', () => {
    clicks += 1;
  });

  target.dispatchEvent(new Event('click'));
  lifecycle.dispose();
  target.dispatchEvent(new Event('click'));

  assert.equal(clicks, 1);
});

test('createLifecycle disposes function and object disposables once', () => {
  const lifecycle = createLifecycle();
  let disposed = 0;

  lifecycle.add(() => {
    disposed += 1;
  });
  lifecycle.addDisposable({
    dispose() {
      disposed += 1;
    },
  });

  lifecycle.dispose();
  lifecycle.dispose();

  assert.equal(disposed, 2);
});

test('createLifecycle immediately disposes registrations added after dispose', () => {
  const lifecycle = createLifecycle();
  let disposed = 0;

  lifecycle.dispose();
  lifecycle.add(() => {
    disposed += 1;
  });

  assert.equal(disposed, 1);
});
