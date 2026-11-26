import test from 'node:test';
import assert from 'node:assert/strict';

test('Facebook URL validation shape', () => {
  const validate = (value) => {
    try {
      const u = new URL(value);
      return ['www.facebook.com','facebook.com','fb.watch','m.facebook.com'].includes(u.hostname) && ['https:','http:'].includes(u.protocol);
    } catch { return false; }
  };
  assert.equal(validate('https://www.facebook.com/watch?v=123'), true);
  assert.equal(validate('https://evil.example/video'), false);
  assert.equal(validate('javascript:alert(1)'), false);
});
