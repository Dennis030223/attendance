const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const IMAGES_DIR = path.join(ROOT, 'images');
const CERT_DIR = path.join(ROOT, 'certs');
const REPORTS_DIR = path.join(ROOT, 'reports');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.csv');
const HEADER = 'ID,Name,Office,Date,Time In,Time Out,Status,File Location';

let httpsEnabled = false;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
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

function handlePdfSave(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    if (!chunks.length) return sendJson(res, 400, { ok: false, error: 'empty body' });
    const buf = Buffer.concat(chunks);
    if (!buf.length) return sendJson(res, 400, { ok: false, error: 'empty body' });
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(REPORTS_DIR, 'attendance-' + stamp + '.pdf');
    writeFileRetry(file, buf, 0, (err) => {
      if (err) return sendJson(res, 500, { ok: false, error: err.message });
      sendJson(res, 200, { ok: true, path: path.relative(ROOT, file) });
    });
  });
}

function getLanIps() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((n) => {
      if (n && n.family === 'IPv4' && !n.internal) out.push(n.address);
    });
  });
  return out;
}

function ensureCertificate() {
  if (fs.existsSync(path.join(CERT_DIR, 'key.pem')) && fs.existsSync(path.join(CERT_DIR, 'cert.pem'))) {
    return true;
  }
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const ips = getLanIps();
  const alt = ['DNS.1 = localhost', 'IP.1 = 127.0.0.1']
    .concat(ips.map((ip, i) => 'IP.' + (i + 2) + ' = ' + ip))
    .join('\n');
  const cfgFile = path.join(CERT_DIR, 'openssl.cnf');
  const cfg = [
    '[req]',
    'distinguished_name = dn',
    'prompt = no',
    'x509_extensions = v3',
    '',
    '[dn]',
    'CN = Attendance Tracker',
    '',
    '[v3]',
    'basicConstraints = CA:FALSE',
    'keyUsage = digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    'subjectAltName = @alt',
    '',
    '[alt]',
    alt
  ].join('\n');
  fs.writeFileSync(cfgFile, cfg);
  const res = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', path.join(CERT_DIR, 'key.pem'),
    '-out', path.join(CERT_DIR, 'cert.pem'),
    '-days', '825', '-config', cfgFile
  ], { stdio: 'ignore' });
  return res.status === 0;
}

const handler = (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/ping') {
    sendJson(res, 200, { ok: true, v: 2 });
    return;
  }

  if (url.pathname === '/api/host') {
    const ips = getLanIps();
    const proto = httpsEnabled ? 'https' : 'http';
    const lanIp = ips[0] || os.hostname();
    const host = (req.headers.host || '').split(':')[0];
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0];
    let publicUrl = null;
    if (forwardedProto && !/^localhost/i.test(host) && !ips.includes(host)) {
      publicUrl = forwardedProto + '://' + host;
    } else if (fs.existsSync(path.join(ROOT, 'public-url.txt'))) {
      const saved = fs.readFileSync(path.join(ROOT, 'public-url.txt'), 'utf8').trim();
      if (saved) publicUrl = saved;
    }
    sendJson(res, 200, {
      url: publicUrl || proto + '://' + lanIp + ':' + PORT,
      local: proto + '://localhost:' + PORT,
      public: publicUrl,
      ips,
      port: PORT,
      https: httpsEnabled
    });
    return;
  }

  if (url.pathname === '/api/pdf') {
    if (req.method === 'POST') {
      handlePdfSave(req, res);
    } else {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }
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
};

function startServer(server, scheme) {
  const lanIp = getLanIps()[0] || 'localhost';
  server.listen(PORT, () => {
    const url = scheme + '://localhost:' + PORT;
    console.log('Attendance Tracker running at  ' + url);
    console.log('LAN (for other devices):      ' + scheme + '://' + lanIp + ':' + PORT);
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
}

if (ensureCertificate()) {
  httpsEnabled = true;
  const cert = fs.readFileSync(path.join(CERT_DIR, 'cert.pem'));
  const key = fs.readFileSync(path.join(CERT_DIR, 'key.pem'));
  startServer(https.createServer({ key, cert }, handler), 'https');
  console.log('HTTPS enabled — camera works on other devices over the network.');
} else {
  console.log('Could not create HTTPS certificate — using HTTP (camera needs localhost).');
  startServer(http.createServer(handler), 'http');
}