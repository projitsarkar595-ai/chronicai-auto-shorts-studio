import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthorizedVideoSource } from '../backend/video-url.js';

test('authorized public video URL validation', () => {
  assert.equal(getAuthorizedVideoSource('https://www.facebook.com/watch?v=123'), 'Facebook');
  assert.equal(getAuthorizedVideoSource('https://www.instagram.com/reel/abc123/'), 'Instagram');
  assert.equal(getAuthorizedVideoSource('https://www.instagram.com/p/abc123/'), 'Instagram');
  assert.equal(getAuthorizedVideoSource('https://www.youtube.com/watch?v=abc123'), 'YouTube');
  assert.equal(getAuthorizedVideoSource('https://www.youtube.com/shorts/abc123'), 'YouTube');
  assert.equal(getAuthorizedVideoSource('https://youtu.be/abc123'), 'YouTube');
  assert.equal(getAuthorizedVideoSource('https://www.instagram.com/private-account/'), null);
  assert.equal(getAuthorizedVideoSource('https://www.youtube.com/'), null);
  assert.equal(getAuthorizedVideoSource('https://evil.example/video'), null);
  assert.equal(getAuthorizedVideoSource('https://www.youtube.com:8443/watch?v=123'), null);
  assert.equal(getAuthorizedVideoSource('javascript:alert(1)'), null);
});
