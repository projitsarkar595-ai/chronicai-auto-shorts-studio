import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { google } from 'googleapis';
import { DatabaseSync } from 'node:sqlite';

const app = express();
const port = Number(process.env.PORT || 4000);
const root = process.cwd();
const wingetFfmpegRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
if (fs.existsSync(wingetFfmpegRoot)) {
  const bin = fs.readdirSync(wingetFfmpegRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.toLowerCase().startsWith('gyan.ffmpeg'))
    .map(entry => path.join(wingetFfmpegRoot, entry.name))
    .map(packageDir => {
      const nested = fs.readdirSync(packageDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.toLowerCase().startsWith('ffmpeg-'))
        .map(entry => path.join(packageDir, entry.name, 'bin'));
      return nested[0];
    })
    .find(Boolean);
  if (bin) process.env.PATH = `${bin};${process.env.PATH || ''}`;
}
const dataDir = path.join(root, 'storage');
for (const dir of ['original', 'clips', 'thumbnails', 'exports', 'templates', 'uploads', 'models']) fs.mkdirSync(path.join(dataDir, dir), { recursive: true });
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });

const db = new DatabaseSync(path.join(root, 'chronicai.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,title TEXT,status TEXT,source TEXT,error TEXT,created_at TEXT,progress REAL DEFAULT 0,downloaded_bytes INTEGER DEFAULT 0,total_bytes INTEGER DEFAULT 0,download_speed REAL DEFAULT 0,file_path TEXT,template_id TEXT);
CREATE TABLE IF NOT EXISTS clips(id TEXT PRIMARY KEY,job_id TEXT,title TEXT,description TEXT,caption TEXT,hashtags TEXT,transcript TEXT,duration REAL,path TEXT,approved INTEGER DEFAULT 0,uploaded INTEGER DEFAULT 0,created_at TEXT,template_id TEXT);
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,name TEXT,settings TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,clip_id TEXT,youtube_id TEXT,status TEXT,error TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
`);
const jobColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map(column => column.name));
for (const [name, type] of [['progress', 'REAL DEFAULT 0'], ['downloaded_bytes', 'INTEGER DEFAULT 0'], ['total_bytes', 'INTEGER DEFAULT 0'], ['download_speed', 'REAL DEFAULT 0'], ['file_path', 'TEXT'], ['template_id', 'TEXT']]) {
  if (!jobColumns.has(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
}
const clipColumns = new Set(db.prepare('PRAGMA table_info(clips)').all().map(column => column.name));
if (!clipColumns.has('template_id')) db.exec('ALTER TABLE clips ADD COLUMN template_id TEXT');
const templateCount = db.prepare('SELECT COUNT(*) AS count FROM templates').get().count;
if (!templateCount) {
  db.prepare('INSERT INTO templates(id,name,settings,created_at) VALUES(?,?,?,?)').run('default', 'Cinematic Vertical', JSON.stringify({aspectRatio:'9:16',zoom:1.12,captionsEnabled:true,captionColor:'#FFFFFF',captionFontSize:48,captionPosition:'bottom'}), new Date().toISOString());
}
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('default_template_id', 'default');

app.use(helmet({ crossOriginResourcePolicy: false }));
const configuredFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({
  origin(origin, callback) {
    const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
    callback(null, !origin || origin === configuredFrontend || isLocalDevOrigin);
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use('/storage', express.static(dataDir));
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

const upload = multer({
  dest: path.join(dataDir, 'uploads'),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowedTypes = ['video/mp4','video/quicktime','video/webm','video/x-matroska','application/octet-stream'];
    const allowedExtensions = /\.(mp4|mov|webm|mkv)$/i;
    cb(null, allowedTypes.includes(file.mimetype) && allowedExtensions.test(file.originalname));
  }
});

function logError(jobId, message) {
  fs.appendFileSync(path.join(root, 'logs', 'app.log'), `${new Date().toISOString()} ${jobId} ${message}\n`);
}

function defaultTemplateId() {
  return db.prepare('SELECT value FROM settings WHERE key=?').get('default_template_id')?.value || 'default';
}

function findTemplate(id) {
  const row = db.prepare('SELECT id,name,settings FROM templates WHERE id=?').get(id);
  return row ? { ...row, settings: JSON.parse(row.settings || '{}') } : null;
}

function resolveTemplate(id) {
  return findTemplate(id || defaultTemplateId());
}

function validateTemplateSettings(input = {}) {
  const aspectRatio = input.aspectRatio || '9:16';
  const zoom = input.zoom === undefined ? 1.12 : Number(input.zoom);
  const captionsEnabled = input.captionsEnabled !== false;
  const captionColor = input.captionColor || '#FFFFFF';
  const captionFontSize = input.captionFontSize === undefined ? 48 : Number(input.captionFontSize);
  const captionPosition = input.captionPosition || 'bottom';
  if (!['9:16', '1:1', '16:9'].includes(aspectRatio)) return { error: 'Aspect ratio must be 9:16, 1:1, or 16:9.' };
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 1.3) return { error: 'Zoom must be between 1.00 and 1.30.' };
  if (!/^#[0-9a-fA-F]{6}$/.test(captionColor)) return { error: 'Caption color must be a six-digit hex color.' };
  if (!Number.isInteger(captionFontSize) || captionFontSize < 24 || captionFontSize > 80) return { error: 'Caption font size must be from 24 to 80.' };
  if (!['top', 'middle', 'bottom'].includes(captionPosition)) return { error: 'Caption position must be top, middle, or bottom.' };
  return { settings: { aspectRatio, zoom, captionsEnabled, captionColor, captionFontSize, captionPosition } };
}

function runPipeline(jobId, inputPath, title = 'Imported video', template = resolveTemplate()) {
  db.prepare('UPDATE jobs SET status=?, title=?, progress=0 WHERE id=?').run('processing', title, jobId);
  const python = process.env.PYTHON_EXECUTABLE || 'python';
  const script = path.join(root, 'python_engine', 'pipeline.py');
  const proc = spawn(python, [script, '--job-id', jobId, '--input', inputPath, '--output', path.join(dataDir, 'clips'), '--gemini-key', process.env.GEMINI_API_KEY || '', '--template-json', JSON.stringify(template?.settings || {}), '--whisper-model', process.env.WHISPER_MODEL || 'base', '--model-dir', path.join(dataDir, 'models')], { cwd: root });
  let output = '';
  let pipelineError = '';
  proc.stdout.on('data', chunk => { output += chunk.toString(); });
  proc.stderr.on('data', chunk => {
    const text = chunk.toString();
    pipelineError += text;
    logError(jobId, text.trim());
  });
  proc.on('close', code => {
    if (code !== 0) {
      const details = pipelineError.trim().split(/\r?\n/).filter(Boolean).at(-1)?.slice(0, 300);
      db.prepare('UPDATE jobs SET status=?,error=? WHERE id=?').run('failed', details ? `Video pipeline failed: ${details}` : 'Video pipeline failed. Check logs for details.', jobId);
      return;
    }
    try {
      const result = JSON.parse(output.trim().split('\n').filter(Boolean).at(-1));
      for (const clip of result.clips || []) {
        db.prepare('INSERT INTO clips(id,job_id,title,description,caption,hashtags,transcript,duration,path,created_at,template_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(crypto.randomUUID(), jobId, clip.title || 'AI Short', clip.description || '', clip.caption || '', JSON.stringify(clip.hashtags || []), clip.transcript || '', clip.duration || 30, clip.path, new Date().toISOString(), template?.id || null);
      }
      db.prepare('UPDATE jobs SET status=?,progress=100 WHERE id=?').run('completed', jobId);
    } catch (error) {
      logError(jobId, error.message);
      db.prepare('UPDATE jobs SET status=?,error=? WHERE id=?').run('failed', 'Invalid pipeline output', jobId);
    }
  });
}

function validateFacebookUrl(value) {
  try {
    const u = new URL(value);
    if (!['www.facebook.com','facebook.com','fb.watch','m.facebook.com'].includes(u.hostname.toLowerCase())) return false;
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

app.get('/api/dashboard', (req, res) => {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  res.json({
    imported: count('jobs'), clips: count('clips'),
    approved: db.prepare('SELECT COUNT(*) AS n FROM clips WHERE approved=1').get().n,
    uploaded: db.prepare('SELECT COUNT(*) AS n FROM clips WHERE uploaded=1').get().n,
    failed: db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='failed'").get().n
  });
});

app.get('/api/jobs', (req, res) => {
  res.json(db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all());
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json(job);
});

app.get('/api/clips', (req, res) => {
  res.json(db.prepare(`
    SELECT clips.*,
      (SELECT youtube_id FROM uploads WHERE clip_id=clips.id AND status='uploaded' ORDER BY created_at DESC LIMIT 1) AS youtube_id
    FROM clips ORDER BY created_at DESC
  `).all().map(c => ({...c, hashtags: JSON.parse(c.hashtags || '[]'), approved: Boolean(c.approved), uploaded: Boolean(c.uploaded)})));
});

app.post('/api/clips/:id/approve', (req, res) => {
  db.prepare('UPDATE clips SET approved=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/clips/:id', (req, res) => {
  const clip = db.prepare('SELECT id,path FROM clips WHERE id=?').get(req.params.id);
  if (!clip) return res.status(404).json({ error: 'Clip not found.' });

  const clipsDirectory = path.resolve(dataDir, 'clips');
  const clipPath = path.resolve(root, clip.path);
  const relativePath = path.relative(clipsDirectory, clipPath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return res.status(400).json({ error: 'Clip file path is invalid; refusing to delete it.' });
  }

  try {
    if (fs.existsSync(clipPath)) fs.unlinkSync(clipPath);
    db.prepare('DELETE FROM clips WHERE id=?').run(clip.id);
    res.json({ ok: true });
  } catch (error) {
    logError(clip.id, `Clip deletion failed: ${error.message}`);
    res.status(500).json({ error: 'Could not delete the clip. Check server logs and try again.' });
  }
});

app.get('/api/templates', (req, res) => {
  res.json(db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all().map(t => ({...t, settings: JSON.parse(t.settings)})));
});

app.post('/api/templates', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const validation = validateTemplateSettings(req.body.settings);
  if (!name) return res.status(400).json({ error: 'Template name is required.' });
  if (validation.error) return res.status(400).json({ error: validation.error });
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO templates(id,name,settings,created_at) VALUES(?,?,?,?)').run(id, name, JSON.stringify(validation.settings), new Date().toISOString());
  res.status(201).json({ id, name, settings: validation.settings });
});

app.put('/api/templates/:id', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const validation = validateTemplateSettings(req.body.settings);
  if (!name) return res.status(400).json({ error: 'Template name is required.' });
  if (validation.error) return res.status(400).json({ error: validation.error });
  const result = db.prepare('UPDATE templates SET name=?,settings=? WHERE id=?')
    .run(name, JSON.stringify(validation.settings), req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Template not found.' });
  res.json({ id: req.params.id, name, settings: validation.settings });
});

app.post('/api/templates/:id/duplicate', (req, res) => {
  const original = findTemplate(req.params.id);
  if (!original) return res.status(404).json({ error: 'Template not found.' });
  const id = crypto.randomUUID();
  const name = `${original.name} copy`.slice(0, 80);
  db.prepare('INSERT INTO templates(id,name,settings,created_at) VALUES(?,?,?,?)')
    .run(id, name, JSON.stringify(original.settings), new Date().toISOString());
  res.status(201).json({ id, name, settings: original.settings });
});

app.delete('/api/templates/:id', (req, res) => {
  if (req.params.id === 'default') return res.status(400).json({ error: 'The built-in template cannot be deleted.' });
  const result = db.prepare('DELETE FROM templates WHERE id=?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Template not found.' });
  if (defaultTemplateId() === req.params.id) {
    db.prepare('UPDATE settings SET value=? WHERE key=?').run('default', 'default_template_id');
  }
  res.json({ ok: true });
});

app.get('/api/settings', (req, res) => {
  res.json({ defaultTemplateId: defaultTemplateId() });
});

app.put('/api/settings/default-template', (req, res) => {
  const id = String(req.body.templateId || '');
  if (!findTemplate(id)) return res.status(400).json({ error: 'Choose a saved template.' });
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run('default_template_id', id);
  res.json({ defaultTemplateId: id });
});

app.post('/api/assistant/chat', async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  if (!message) return res.status(400).json({ error: 'Write a question for the assistant.' });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini is not configured. Add GEMINI_API_KEY to .env and restart the API.' });
  }

  const history = Array.isArray(req.body.history) ? req.body.history.slice(-8)
    .filter(item => item && ['user', 'model'].includes(item.role) && typeof item.text === 'string')
    .map(item => ({ role: item.role, parts: [{ text: item.text.slice(0, 2000) }] })) : [];
  const context = {
    app: 'ChronicAI Auto Shorts Studio',
    videoJobs: db.prepare("SELECT status, error FROM jobs ORDER BY created_at DESC LIMIT 10").all(),
    counts: {
      clips: db.prepare('SELECT COUNT(*) AS count FROM clips').get().count,
      approvedClips: db.prepare('SELECT COUNT(*) AS count FROM clips WHERE approved=1').get().count,
      uploadedClips: db.prepare('SELECT COUNT(*) AS count FROM clips WHERE uploaded=1').get().count
    },
    configuration: {
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      youtubeClientConfigured: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
      youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:4000/api/youtube/callback',
      youtubeConnected: Boolean(youtubeTokens?.refresh_token)
    }
  };
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const contents = [
    { role: 'user', parts: [{ text: `You are the troubleshooting assistant inside ChronicAI Auto Shorts Studio. Help the user solve app, video processing, Gemini, and YouTube OAuth/upload problems. Reply in the language the user uses (Bengali/Banglish when appropriate), with short, numbered steps. Be honest about limitations; never claim an action was completed unless the app context proves it. Never request or reveal API keys, OAuth secrets, access tokens, or passwords. Use the current app status below as factual context. If diagnosing OAuth redirect_uri_mismatch, compare the exact configured redirect URI and explain that it must be added under Authorized redirect URIs in the Google Cloud OAuth Web application client.\n\nCurrent app status (contains no credentials): ${JSON.stringify(context)}` }] },
    ...history,
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.3, maxOutputTokens: 700 } }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 'Gemini rejected the API key or its permissions. Check the key and API access in Google AI Studio.' :
        response.status === 429 ? 'Gemini rate limit reached. Wait briefly and try again.' :
          'Gemini could not answer right now. Check the model name and API status, then try again.';
      return res.status(502).json({ error: status });
    }
    const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!answer) return res.status(502).json({ error: 'Gemini returned an empty answer. Please rephrase your question and try again.' });
    res.json({ answer });
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Gemini took too long to respond. Try again in a moment.' : 'Could not reach Gemini. Check your internet connection and try again.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/import/url', async (req, res) => {
  const { url, ownershipConfirmed } = req.body;
  if (ownershipConfirmed !== true) return res.status(400).json({ error: 'Confirm that you own or are authorized to use this video.' });
  if (!validateFacebookUrl(url)) return res.status(400).json({ error: 'Enter a valid public Facebook or fb.watch video URL.' });
  const template = resolveTemplate(req.body.templateId);
  if (!template) return res.status(400).json({ error: 'Selected template was not found. Choose a saved template and try again.' });
  const id = crypto.randomUUID();
  const output = path.join(dataDir, 'original', `${id}.mp4`);
  const relativeOutput = path.relative(root, output).split(path.sep).join('/');
  db.prepare('INSERT INTO jobs(id,title,status,source,created_at,file_path,template_id) VALUES(?,?,?,?,?,?,?)').run(id, 'Facebook import', 'importing', url, new Date().toISOString(), relativeOutput, template.id);
  res.status(202).json({ ok: true, jobId: id });

  db.prepare('UPDATE jobs SET status=? WHERE id=?').run('downloading', id);
  const proc = spawn(process.env.PYTHON_EXECUTABLE || 'python', [path.join(root, 'python_engine', 'video_import.py'), '--url', url, '--output', output], { cwd: root });
  let error = '';
  let stdoutBuffer = '';
  proc.stdout.on('data', chunk => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      const match = line.match(/^CHRONICAI_PROGRESS:([^:]+):([^:]+):([^:]+):([^:]+)$/);
      if (!match) continue;
      const downloaded = Number(match[1]) || 0;
      const total = Number(match[2]) || Number(match[3]) || 0;
      const speed = Number(match[4]) || 0;
      const progress = total > 0 ? Math.min(99, downloaded / total * 100) : 0;
      db.prepare('UPDATE jobs SET progress=?,downloaded_bytes=?,total_bytes=?,download_speed=? WHERE id=?')
        .run(progress, downloaded, total, speed, id);
    }
  });
  proc.stderr.on('data', c => { error += c.toString(); });
  proc.on('close', code => {
    if (code === 0 && fs.existsSync(output)) {
      db.prepare('UPDATE jobs SET progress=100 WHERE id=?').run(id);
      runPipeline(id, output, 'Facebook import', template);
    }
    else {
      const message = error.includes('yt-dlp') ? 'Authorized source import unavailable. Upload a local copy instead.' : 'Video could not be retrieved from the authorized source.';
      db.prepare('UPDATE jobs SET status=?,error=? WHERE id=?').run('failed', message, id);
      logError(id, message);
    }
  });
});

app.post('/api/import/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A valid MP4, MOV, WebM, or MKV video is required.' });
  const template = resolveTemplate(req.body.templateId);
  if (!template) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Selected template was not found. Choose a saved template and try again.' });
  }
  const id = crypto.randomUUID();
  const extension = path.extname(req.file.originalname).toLowerCase();
  const originalPath = path.join(dataDir, 'original', `${id}${extension}`);
  const relativePath = path.relative(root, originalPath).split(path.sep).join('/');
  fs.renameSync(req.file.path, originalPath);
  db.prepare('INSERT INTO jobs(id,title,status,source,created_at,file_path,template_id) VALUES(?,?,?,?,?,?,?)').run(id, req.file.originalname, 'queued', 'local upload', new Date().toISOString(), relativePath, template.id);
  res.status(202).json({ ok: true, jobId: id });
  runPipeline(id, originalPath, req.file.originalname, template);
});

let youtubeTokens = null;
const pendingYouTubeOAuth = new Map();
function youtubeClient() {
  return new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET, process.env.YOUTUBE_REDIRECT_URI);
}
app.get('/api/youtube/status', (req, res) => res.json({
  connected: Boolean(youtubeTokens?.refresh_token),
  configured: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI)
}));
app.get('/api/youtube/auth', (req, res) => {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) {
    return res.status(400).json({ error: 'Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI in .env.' });
  }
  const configuredFrontend = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
  let frontendOrigin = configuredFrontend.origin;
  try {
    const requestedOrigin = new URL(String(req.query.frontendOrigin || configuredFrontend.origin)).origin;
    if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestedOrigin) || requestedOrigin === configuredFrontend.origin) {
      frontendOrigin = requestedOrigin;
    }
  } catch {
    return res.status(400).json({ error: 'Invalid frontend origin.' });
  }
  for (const [state, pending] of pendingYouTubeOAuth) {
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) pendingYouTubeOAuth.delete(state);
  }
  const state = crypto.randomBytes(32).toString('hex');
  pendingYouTubeOAuth.set(state, { frontendOrigin, createdAt: Date.now() });
  const auth = youtubeClient();
  res.redirect(auth.generateAuthUrl({ access_type: 'offline', prompt:'consent', state, scope: ['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'] }));
});
app.get('/api/youtube/callback', async (req, res) => {
  const pending = pendingYouTubeOAuth.get(String(req.query.state || ''));
  if (!pending || !req.query.code) return res.status(400).send('YouTube authorization expired or was not started by this app. Please connect again.');
  pendingYouTubeOAuth.delete(String(req.query.state));
  try {
    const auth = youtubeClient();
    const { tokens } = await auth.getToken(req.query.code);
    youtubeTokens = tokens;
    res.redirect(`${pending.frontendOrigin}/?page=youtube`);
  } catch (error) {
    res.status(400).send('YouTube authorization failed.');
  }
});
app.post('/api/youtube/upload/:clipId', async (req, res) => {
  if (!youtubeTokens?.refresh_token) return res.status(400).json({ error: 'Connect a YouTube account first.' });
  const privacy = req.body.privacy || 'private';
  if (!['private', 'unlisted', 'public'].includes(privacy)) {
    return res.status(400).json({ error: 'Privacy must be private, unlisted, or public.' });
  }
  const clip = db.prepare('SELECT * FROM clips WHERE id=?').get(req.params.clipId);
  if (!clip || !clip.approved) return res.status(400).json({ error: 'Only approved clips can be uploaded.' });
  if (clip.uploaded) return res.status(409).json({ error: 'This clip has already been uploaded to YouTube.' });
  const absolute = path.resolve(root, clip.path);
  if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'Clip file is missing.' });
  try {
    const auth = youtubeClient(); auth.setCredentials(youtubeTokens);
    const youtube = google.youtube({ version:'v3', auth });
    const response = await youtube.videos.insert({
      part:['snippet','status'], notifySubscribers:false,
      requestBody:{ snippet:{title:clip.title.slice(0,100),description:clip.description,tags:JSON.parse(clip.hashtags || '[]')}, status:{privacyStatus:privacy,selfDeclaredMadeForKids:false} },
      media:{ body:fs.createReadStream(absolute), mimeType:'video/mp4' }
    });
    db.prepare('UPDATE clips SET uploaded=1 WHERE id=?').run(clip.id);
    db.prepare('INSERT INTO uploads(id,clip_id,youtube_id,status,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),clip.id,response.data.id,'uploaded',new Date().toISOString());
    res.json({ ok:true, youtubeId:response.data.id });
  } catch (error) {
    db.prepare('INSERT INTO uploads(id,clip_id,status,error,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),clip.id,'failed',error.message,new Date().toISOString());
    res.status(502).json({ error:'YouTube upload failed.', detail:error.message });
  }
});

app.get('/api/health', (req,res)=>res.json({ok:true}));
app.use((err, req, res, next) => {
  logError('server', err.message);
  res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Video exceeds 2 GB limit.' : 'Unexpected server error.' });
});
app.listen(port, () => console.log(`ChronicAI API listening on http://localhost:${port}`));
