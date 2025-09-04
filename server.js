/* server.js — Hwaseon Image Host (Render /data persistent disk)
 * - Express + Session(FileStore@/data/sessions)
 * - Public static: ./public
 * - Image upload: memory → /data/uploads/<id>.<ext>
 * - Metadata: /data/images.json, /data/users.json
 * - Health check: /healthz (200)
 * - Bind: 0.0.0.0 with PORT from env
 */

const express = require('express');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const ExcelJS = require('exceljs');

const app  = express();
const PORT = process.env.PORT || 3000;
const MAX_DAILY_TRAFFIC = 1500;

// ---- Utilities -------------------------------------------------------------
function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
}
function isWritable(dir) {
  try {
    const t = path.join(dir, '.rwtest');
    fs.writeFileSync(t, 'ok');
    fs.unlinkSync(t);
    return true;
  } catch (_) { return false; }
}
function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.error('[loadJson]', e); }
  try { fs.writeFileSync(file, JSON.stringify(fallback, null, 2)); } catch (_) {}
  return fallback;
}
function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('[saveJson]', e); }
}

// ---- Data dirs (prefer /data; fallback to ./data if not writable) ----------
let DATA_DIR = '/data';
if (!isWritable(DATA_DIR)) {
  console.warn('[boot] /data not writable. Falling back to ./data (non-persistent).');
  DATA_DIR = path.join(__dirname, 'data');
}
const USERS_FILE   = path.join(DATA_DIR, 'users.json');
const IMAGES_FILE  = path.join(DATA_DIR, 'images.json');
const UPLOADS_DIR  = path.join(DATA_DIR, 'uploads');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

ensureDir(DATA_DIR);
ensureDir(UPLOADS_DIR);
ensureDir(SESSIONS_DIR);

// ---- App basics ------------------------------------------------------------
app.set('trust proxy', 1); // Render behind proxy
app.use(express.static('public'));
app.use(express.json());

// Very open CORS (이미지 핫링크용)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // 필요 시 도메인 제한 고려
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ---- Sessions --------------------------------------------------------------
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  store: new FileStore({
    path: SESSIONS_DIR,
    ttl: 24 * 60 * 60,
    reapInterval: 60 * 60,
    retries: 0
  }),
  cookie: {
    secure: false,               // Render: HTTPS 종단 앞단이라면 true 고려
    maxAge: 24 * 60 * 60 * 1000  // 24h
  }
}));

// ---- In-memory state (backed by /data json) --------------------------------
let users  = loadJson(USERS_FILE, []);
let images = loadJson(IMAGES_FILE, []);

// Ensure admin
if (!users.some(u => u.id === 'admin')) {
  users.unshift({ id: 'admin', pw: 'hwaseon@00', role: 'admin', createdAt: new Date().toISOString() });
  saveJson(USERS_FILE, users);
}
function persistUsers()  { saveJson(USERS_FILE, users); }
function persistImages() { saveJson(IMAGES_FILE, images); }

// ---- Helpers for referer filtering -----------------------------------------
function isRealBlogPost(url) {
  if (!url) return false;
  return /^https?:\/\/(?:blog|m\.blog)\.naver\.com\/(?:[^/]+\/\d+|PostView\.naver\?blogId=[^&]+&logNo=\d+)/.test(url);
}
function isNaverBlogReferer(url) {
  if (!url) return false;
  if (!/^https?:\/\/(blog|m\.blog)\.naver\.com\//.test(url)) return false;
  if (/PostWriteForm\.naver/.test(url)) return false;
  if (/\/home([/?#]|$)/.test(url)) return false;
  if (/\/section([/?#]|$)/.test(url)) return false;
  if (/\/dashboard([/?#]|$)/.test(url)) return false;
  return true;
}
function isMySiteReferer(url) {
  if (!url) return false;
  return /hwaseon-image\.com|onrender\.com/.test(url);
}

// ---- Multer (memory) -------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('지원하지 않는 이미지 형식입니다.'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ---- Routes ----------------------------------------------------------------

// Health check (Render)
app.get('/healthz', (_, res) => res.status(200).send('ok'));

// Login pages
app.get('/login', (req, res) => res.redirect('/login.html'));

// Auth APIs
app.post('/login', (req, res) => {
  try {
    const { id, pw } = req.body || {};
    if (id === 'hwaseon' && pw === 'hwaseon@00') {
      req.session.user = { id: 'admin', role: 'admin' };
      return res.json({ success: true, role: 'admin' });
    }
    const user = users.find(u => u.id === id && u.pw === pw);
    if (user) {
      req.session.user = { id: user.id, role: user.role };
      return res.json({ success: true, role: user.role });
    }
    res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
  }
});
app.post('/logout', (req, res) => {
  try { req.session.destroy(() => res.json({ success: true })); }
  catch (e) { console.error('Logout error:', e); res.status(500).json({ error: '로그아웃 중 오류가 발생했습니다.' }); }
});
app.get('/me', (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    res.json(req.session.user);
  } catch (e) {
    console.error('Me error:', e);
    res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
  }
});

// Dashboard HTML (auth required)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/dashboard.html', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Dashboard data
app.get('/dashboard-data', (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    const data = (req.session.user.role === 'admin')
      ? images
      : images.filter(img => img.owner === req.session.user.id);
    res.json(data);
  } catch (e) {
    console.error('Dashboard data error:', e);
    res.status(500).json({ error: '대시보드 데이터 조회 중 오류가 발생했습니다.' });
  }
});

// Users admin
app.get('/users', (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin')
      return res.status(403).json({ error: '권한이 없습니다.' });
    res.json(users);
  } catch (e) {
    console.error('Users list error:', e);
    res.status(500).json({ error: '사용자 목록 조회 중 오류가 발생했습니다.' });
  }
});
app.post('/register', (req, res) => {
  try {
    const { id, pw } = req.body || {};
    if (!id || !pw) return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
    if (users.some(u => u.id === id)) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
    const newUser = { id, pw, role: 'user', createdAt: new Date().toISOString() };
    users.push(newUser);
    persistUsers();
    res.json({ success: true, user: newUser });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: '사용자 등록 중 오류가 발생했습니다.' });
  }
});
app.delete('/users/:id', (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin')
      return res.status(403).json({ error: '권한이 없습니다.' });
    const userId = req.params.id;
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    if (users[idx].role === 'admin') return res.status(403).json({ error: '관리자는 삭제할 수 없습니다.' });
    users.splice(idx, 1);
    persistUsers();
    res.json({ success: true });
  } catch (e) {
    console.error('Delete user error:', e);
    res.status(500).json({ error: '사용자 삭제 중 오류가 발생했습니다.' });
  }
});

// Upload (single or memo array -> multi entries)
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '이미지 파일이 필요합니다.' });

    const ext = (path.extname(req.file.originalname) || '').toLowerCase() || '.jpg';
    const owner = req.session.user ? req.session.user.id : null;

    const memos = Array.isArray(req.body.memo) ? req.body.memo : [ (req.body.memo ?? '').toString() ];
    const urls = [];

    for (const m of memos) {
      const id = Date.now().toString() + Math.floor(Math.random() * 10000);
      const filename = `${id}${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filePath, req.file.buffer);

      const url = `/image/${id}`;
      images.push({
        id,
        filename,
        url,
        memo: (m ?? '').toString(),
        owner,
        views: 0,
        ips: [],
        referers: [],
        createdAt: new Date().toISOString()
      });
      urls.push(url);
    }
    persistImages();

    if (urls.length === 1) return res.json({ url: urls[0], memo: memos[0] ?? '' });
    return res.json({ urls, memos });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// Image (CORS preflight handled globally)
app.get('/image/:id', (req, res) => {
  const id = (req.params.id || '').replace(/\.[^/.]+$/,''); // tolerate .jpg suffix
  console.log('Image request:', {
    originalId: req.params.id,
    cleanedId: id,
    referer: req.headers['referer'],
    userAgent: req.headers['user-agent'],
    origin: req.headers['origin'],
    host: req.headers['host']
  });

  const img = images.find(i => i.id === id);
  if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

  const todayStr = new Date().toISOString().slice(0,10);
  if (!img.todayDate || img.todayDate !== todayStr) { img.todayDate = todayStr; img.todayCount = 0; }
  if ((img.todayCount || 0) >= MAX_DAILY_TRAFFIC) {
    return res.status(429).json({ error: '하루 트래픽(1,500회) 초과' });
  }
  img.todayCount = (img.todayCount || 0) + 1;

  const filePath = path.join(UPLOADS_DIR, img.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '이미지 파일을 찾을 수 없습니다.' });

  const referer = req.headers['referer'] || '';
  const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const now = new Date();

  img.views ??= 0;
  if (!Array.isArray(img.ips)) img.ips = [];
  if (!Array.isArray(img.referers)) img.referers = [];

  if (isNaverBlogReferer(referer) && !isMySiteReferer(referer)) {
    img.views += 1;

    let ipInfo = img.ips.find(x => x.ip === ip && x.ua === ua);
    if (!ipInfo) {
      img.ips.push({ ip, ua, count: 1, visits: [{ time: now.toISOString() }] });
    } else {
      ipInfo.count = (ipInfo.count || 0) + 1;
      if (!Array.isArray(ipInfo.visits)) ipInfo.visits = [];
      ipInfo.visits.push({ time: now.toISOString() });
    }

    const existing = img.referers.find(r => r.referer === referer);
    if (existing) existing.count = (existing.count || 0) + 1;
    else img.referers.push({ referer, count: 1, createdAt: now.toISOString() });
  }

  persistImages();

  const ext = path.extname(img.filename).toLowerCase();
  const map = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp' };
  res.set('Content-Type', map[ext] || 'application/octet-stream');
  res.sendFile(filePath);
});

// Image detail
app.get('/image/:id/detail', (req, res) => {
  try {
    const img = images.find(i => i.id === req.params.id);
    if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const views = img.views || 0;

    let unique = img.ips ? img.ips.length : 0;
    if (unique > views) unique = views;

    const todayStr = new Date().toISOString().slice(0,10);
    let todayVisits = 0;
    (img.ips || []).forEach(x => {
      (x.visits || []).forEach(v => {
        if (v.time && v.time.slice(0,10) === todayStr) todayVisits += 1;
      });
    });

    let blogUrl = null, blogCreated = null;
    if (img.referers && img.referers.length > 0) {
      const sorted = img.referers.slice().sort((a,b) => (b.count || 0) - (a.count || 0));
      blogUrl = sorted[0].referer;
      blogCreated = sorted[0].createdAt;
    }

    const ips = (img.ips || []).map(x => ({
      ip: x.ip, ua: x.ua, count: x.count, visits: x.visits || []
    }));

    res.json({
      id: img.id,
      filename: img.filename,
      blogUrl,
      blogCreated,
      views,
      todayVisits,
      ips,
      referers: img.referers || []
    });
  } catch (e) {
    console.error('상세 정보 조회 오류:', e);
    res.status(500).json({ error: '상세 정보 조회 중 오류가 발생했습니다.' });
  }
});

// Daily visits
app.get('/image/:id/daily-visits', (req, res) => {
  try {
    const img = images.find(i => i.id === req.params.id);
    if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const dailyMap = {};
    (img.ips || []).forEach(ipinfo => {
      (ipinfo.visits || []).forEach(v => {
        const date = v.time ? v.time.slice(0,10) : null;
        if (date) dailyMap[date] = (dailyMap[date] || 0) + 1;
      });
    });
    const dailyVisits = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a,b) => a.date.localeCompare(b.date));

    res.json({ id: img.id, dailyVisits });
  } catch (e) {
    console.error('일자별 방문수 조회 오류:', e);
    res.status(500).json({ error: '일자별 방문수 조회 중 오류가 발생했습니다.' });
  }
});

// Delete image (file + metadata)
app.delete('/image/:id', (req, res) => {
  try {
    const id = req.params.id;
    const idx = images.findIndex(img => img.id === id);
    if (idx === -1) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const filePath = path.join(UPLOADS_DIR, images[idx].filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); }
      catch (err) { console.error('Error deleting image file:', err); }
    }
    images.splice(idx, 1);
    persistImages();

    res.json({ success: true });
  } catch (e) {
    console.error('이미지 삭제 오류:', e);
    res.status(500).json({ error: '이미지 삭제 중 오류가 발생했습니다.' });
  }
});

// Excel export (dashboard)
app.get('/dashboard-excel', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

    const filtered = (req.session.user.role === 'admin') ? images : images.filter(i => i.owner === req.session.user.id);

    const allDatesSet = new Set();
    filtered.forEach(img => {
      (img.ips || []).forEach(ipinfo => {
        (ipinfo.visits || []).forEach(v => { if (v.time) allDatesSet.add(v.time.slice(0,10)); });
      });
    });
    const allDates = Array.from(allDatesSet).sort((a,b) => b.localeCompare(a)); // desc

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Dashboard');

    const baseColumns = [
      { header: '이미지 링크', key: 'image', width: 40 },
      { header: '블로그 URL', key: 'blog', width: 40 },
      { header: '메모', key: 'memo', width: 30 },
      { header: '총 방문수', key: 'views', width: 12 }
    ];
    const dateColumns = allDates.map(d => ({ header: d, key: `date_${d}`, width: 12 }));
    ws.columns = [...baseColumns, ...dateColumns];

    filtered.forEach(img => {
      let blogUrl = '-';
      if (img.referers && img.referers.length > 0) {
        const real = img.referers.find(r => isRealBlogPost(r.referer));
        blogUrl = real ? real.referer : '-';
      }
      const dailyMap = {};
      (img.ips || []).forEach(ipinfo => {
        (ipinfo.visits || []).forEach(v => {
          const date = v.time ? v.time.slice(0,10) : null;
          if (date) dailyMap[date] = (dailyMap[date] || 0) + 1;
        });
      });
      const row = {
        image: `${req.protocol}://${req.get('host')}/image/${img.id}`,
        blog: blogUrl,
        memo: img.memo || '',
        views: img.views || 0
      };
      allDates.forEach(d => { row[`date_${d}`] = dailyMap[d] || 0; });
      ws.addRow(row);
    });

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename=dashboard_data.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('Excel download error:', e);
    res.status(500).json({ error: '엑셀 다운로드 중 오류가 발생했습니다.' });
  }
});

// Replace image (content only; URL/filename 유지)
app.post('/replace-image', upload.single('image'), (req, res) => {
  try {
    const id = req.body.id;
    if (!id || !req.file) return res.json({ success: false, error: 'ID 또는 파일 누락' });
    const target = images.find(img => img.id === id);
    if (!target) return res.json({ success: false, error: '이미지 ID 불일치' });

    const imagePath = path.join(UPLOADS_DIR, target.filename);
    fs.writeFileSync(imagePath, req.file.buffer); // overwrite contents only
    res.json({ success: true, newUrl: target.url });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ---- Error handler ---------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[Error middleware]', err);
  res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
});

// ---- Start -----------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[boot] listening on ${PORT}`);
  console.log(`[boot] DATA_DIR=${DATA_DIR}`);
  console.log(`[boot] UPLOADS_DIR=${UPLOADS_DIR}`);
  console.log(`[boot] SESSIONS_DIR=${SESSIONS_DIR}`);
});
