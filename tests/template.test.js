import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('template aspect ratio and zoom produce matching FFmpeg framing', () => {
  const script = [
    'import json',
    'from python_engine.pipeline import crop_filter',
    "print(json.dumps([crop_filter({'aspectRatio':'9:16','zoom':1}), crop_filter({'aspectRatio':'1:1','zoom':1.2})]))"
  ].join('; ');
  const output = execFileSync(process.env.PYTHON_EXECUTABLE || 'python', ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  const [vertical, squareZoomed] = JSON.parse(output);
  assert.match(vertical, /crop=1080:1920/);
  assert.match(squareZoomed, /scale=1296:1296/);
  assert.match(squareZoomed, /crop=1080:1080/);
});
