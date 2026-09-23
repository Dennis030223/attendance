const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const IMAGES_DIR = path.join(ROOT, 'images');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.csv');
const HEADER = 'ID,Name,Office,Date,Time In,Time Out,Status,File Location';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'application/json; charset=utf-8' });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj));
}

function writeFileRetry(file, data, attempts, cb) {
  attempts = attempts || 0;
  const opts = Buffer.isBuffer(data) ? null : 'utf8';
  fs.writeFile(file, data, opts, (err) => {
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM') && attempts < 20) {
      setTimeout(() => writeFileRetry(file, data, attempts + 1, cb), 100);
      return;
    }
    cb(err);
  });
}

function readFileRetry(file, attempts, cb) {
  attempts = attempts || 0;
  fs.readFile(file, 'utf8', (err, data) => {
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM') && attempts < 20) {
      setTimeout(() => readFileRetry(file, attempts + 1, cb), 100);
      return;
    }
    cb(err, data);
  });
}

function safeResolve(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const resolved = path.normalize(path.join(ROOT, decoded));
  return resolved.startsWith(ROOT) ? resolved : null;
}

function handleAttendanceWrite(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    body = (body || '').trim();

    if (req.method === 'PUT') {
      const content = body || (HEADER + '\r\n');
      writeFileRetry(ATTENDANCE_FILE, content + (content.endsWith('\r\n') ? '' : '\r\n'), 0, (err) => {
        if (err) return sendJson(res, 500, { ok: false, error: err.message });
        sendJson(res, 200, { ok: true });
      });
      return;
    }

    const lines = body.replace(/\r\n/g, '\n').split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== '');
    const dataRows = lines.filter((l, i) => !(i === 0 && l.trim() === HEADER));
    if (!dataRows.length) {
      sendJson(res, 200, { ok: true, ignored: true });
      return;
    }
    readFileRetry(ATTENDANCE_FILE, 0, (readErr, existing) => {
      let text;
      if (readErr || !existing || !existing.trim()) {
        text = HEADER + '\r\n' + dataRows.join('\r\n') + '\r\n';
      } else {
        text = existing.replace(/\s+$/, '') + '\r\n' + dataRows.join('\r\n') + '\r\n';
      }
      writeFileRetry(ATTENDANCE_FILE, text, 0, (err) => {
        if (err) return sendJson(res, 500, { ok: false, error: err.message });
        sendJson(res, 200, { ok: true });
      });
    });
  });
}

function sanitizeFileBase(name) {
  const cleaned = String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '_');
  return cleaned || 'photo';
}

const IMAGE_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

function handleImageSave(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let parsed;
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      return sendJson(res, 400, { ok: false, error: 'bad request' });
    }
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(parsed.dataUrl || ''));
    if (!m) return sendJson(res, 400, { ok: false, error: 'invalid image data' });
    const ext = IMAGE_EXT[m[1]] || '.jpg';
    const base = sanitizeFileBase(parsed.filename).replace(/\.[^.]+$/, '');
    const filename = base + ext;
    const buf = Buffer.from(m[2], 'base64');
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    writeFileRetry(path.join(IMAGES_DIR, filename), buf, 0, (err) => {
      if (err) return sendJson(res, 500, { ok: false, error: err.message });
      sendJson(res, 200, { ok: true, path: 'images/' + filename });
    });
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/ping') {
    sendJson(res, 200, { ok: true, v: 2 });
    return;
  }

  if (url.pathname === '/api/image') {
    if (req.method === 'POST') {
      handleImageSave(req, res);
    } else {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }
    return;
  }

  if (url.pathname === '/api/attendance') {
    if (req.method === 'POST' || req.method === 'PUT') {
      handleAttendanceWrite(req, res);
    } else if (req.method === 'GET') {
      readFileRetry(ATTENDANCE_FILE, 0, (err, text) => {
        if (err) return sendJson(res, 404, { ok: false, error: 'attendance.csv not found' });
        send(res, 200, text, 'text/csv; charset=utf-8');
      });
    } else {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }
    return;
  }

  let filePath = safeResolve(url.pathname);
  if (!filePath) return send(res, 403, 'Forbidden');
  if (url.pathname === '/') filePath = path.join(ROOT, 'index.html');

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not Found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, () => {
  const url = 'http://localhost:' + PORT;
  console.log('Attendance Tracker running at  ' + url);
  console.log('Attendance auto-saves to     ' + ATTENDANCE_FILE);
  console.log('API v2 — photo endpoint /api/image enabled');
  if (!process.argv.includes('--no-open')) {
    const open = (cmd, args) => {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
      child.unref();
    };
    if (process.platform === 'win32') open('cmd', ['/c', 'start', '', url]);
    else if (process.platform === 'darwin') open('open', [url]);
    else open('xdg-open', [url]);
  }
});