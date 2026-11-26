import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('spoken caption segments are clipped and shifted to the output timeline', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'chronicai-caption-test-'));
  try {
    const script = [
      'import json, sys',
      'from python_engine.pipeline import write_clip_srt, ass_color',
      "segments = [{'start': 2.5, 'end': 5.0, 'text': 'spoken words'}, {'start': 8.0, 'end': 9.0, 'text': 'outside clip'}]",
      'path = sys.argv[1]',
      'write_clip_srt(segments, 3.0, 4.0, path)',
      "print(json.dumps({'srt': open(path, encoding='utf-8').read(), 'color': ass_color('#12ABCF')}))"
    ].join('; ');
    const output = execFileSync(process.env.PYTHON_EXECUTABLE || 'python', ['-c', script, path.join(tempDir, 'clip.srt')], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    const result = JSON.parse(output);
    assert.match(result.srt, /00:00:00,000 --> 00:00:02,000/);
    assert.match(result.srt, /spoken words/);
    assert.doesNotMatch(result.srt, /outside clip/);
    assert.equal(result.color, '&H00CFAB12');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
