/* server.js — Hwaseon Image Host (Persistent Disk /data)
 * - Express + Session(FileStore@/data/sessions)
 * - Static: ./public
 * - Upload: diskStorage -> /data/uploads/<id>.<ext> (메모리 절약)
 * - Metadata: /data/images.json, /data/users.json (집계형 통계)
 * - Health: /healthz (200)
 * - Bind: 0.0.0.0 + PORT from env
 * - Migration: 기존 ips/visits/referers -> dailyCounts/topReferers로 1회 변환
 */

const express = require('express');
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const ExcelJS = require('exceljs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---- 운영 상수 --------------------------------------------------------------
const DATA_DIR      = '/data';                     // Persistent Disk
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const IMAGES_FILE   = path.join(DATA_DIR, 'images.json');
const UPLOADS_DIR   = path.join(DATA_DIR, 'uploads');
const SESSIONS_DIR  = path.join(DATA_DIR, 'sessions');
const MAX_DAILY_TRAFFIC = 1500;                   // 이미지별 일일 제한
const MAX_REFERERS      = 100;                    // referer의 상한
const MAX_DAYS_KEEP     = 180;                    // 일자 집계 보존일수
const MAX_UPLOAD_MB     = 5;                      // 업로드 제한(MB)

const MAX_VISITORS = 300;          // 이미지별 IP×UA 엔트리 상한
const MAX_VISITS_PER_VISITOR = 10; // 각 방문자에 저장할 최근 시각 상한

// ---- 부팅 가드(디렉토리/파일) ----------------------------------------------
function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch(_){} }
function loadJson(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('[loadJson]', e); }
  try { fs.writeFileSync(file, JSON.stringify(fallback, null, 2)); } catch (_) {}
  return fallback;
}
function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('[saveJson]', e); }
}

ensureDir(DATA_DIR);
ensureDir(UPLOADS_DIR);
ensureDir(SESSIONS_DIR);

// ---- 앱 기본 ---------------------------------------------------------------
app.set('trust proxy', 1);
app.use(express.static('public'));
app.use(express.json());

// 핫링크 허용(CORS 오픈) — 필요시 도메인으로 제한
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// 세션
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
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ---- 데이터 로드 ------------------------------------------------------------
let users  = loadJson(USERS_FILE, []);
let images = loadJson(IMAGES_FILE, []);

// admin 보장
if (!users.some(u => u.id === 'admin')) {
  users.unshift({ id: 'admin', pw: 'hwaseon@00', role: 'admin', createdAt: new Date().toISOString() });
  saveJson(USERS_FILE, users);
}
function persistUsers()  { saveJson(USERS_FILE, users); }
function persistImages() { saveJson(IMAGES_FILE, images); }

// ---- 레거시 -> 집계형 마이그레이션 -----------------------------------------
function migrateLegacyImage(img) {
  if (!img.dailyCounts) img.dailyCounts = {};
  if (!img.topReferers) img.topReferers = {};

  if (Array.isArray(img.ips)) {
    for (const entry of img.ips) {
      const visits = Array.isArray(entry?.visits) ? entry.visits : [];
      for (const v of visits) {
        const t = v?.time;
        if (t && typeof t === 'string' && t.length >= 10) {
          const d = t.slice(0,10); // YYYY-MM-DD
          img.dailyCounts[d] = (img.dailyCounts[d] || 0) + 1;
        }
      }
    }
  }
  if (Array.isArray(img.referers)) {
    for (const r of img.referers) {
      const url = r?.referer;
      const count = r?.count || 0;
      if (url && count > 0) {
        img.topReferers[url] = (img.topReferers[url] || 0) + count;
      }
    }
  }
  const entries = Object.entries(img.topReferers).sort((a,b)=>b[1]-a[1]);
  if (entries.length > MAX_REFERERS) {
    img.topReferers = Object.fromEntries(entries.slice(0, MAX_REFERERS));
  }
  const days = Object.keys(img.dailyCounts).sort(); // asc
  if (days.length > MAX_DAYS_KEEP) {
    const cut = days.length - MAX_DAYS_KEEP;
    for (let i=0;i<cut;i++) delete img.dailyCounts[days[i]];
  }
  delete img.ips;
  delete img.referers;
  return img;
}
let migrated = false;
for (let i=0;i<images.length;i++) {
  const img = images[i];
  if (img && (img.ips || img.referers)) {
    images[i] = migrateLegacyImage(img);
    migrated = true;
  }
}
if (migrated) persistImages();

// ---- 유틸 (블로그 판별) ------------------------------------------------------
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

// ---- Multer: 업로드는 디스크 직저장 -----------------------------------------
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const id  = Date.now().toString() + Math.floor(Math.random()*10000);
    cb(null, `${id}${ext}`);
  }
});
const uploadDisk = multer({
  storage: diskStorage,
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('지원하지 않는 이미지 형식입니다.'), ok);
  },
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

// 교체는 메모리로 받아 **덮어쓰기만** 수행(파일명 유지)
const uploadMem = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('지원하지 않는 이미지 형식입니다.'), ok);
  },
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

// ---- 라우트 ------------------------------------------------------------------

// Health check
app.get('/healthz', (_, res) => res.status(200).send('ok'));

// 로그인/세션
app.get('/login', (req, res) => res.redirect('/login.html'));
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

// 대시보드 페이지
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/dashboard.html', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 사용자/권한
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

// 업로드(디스크 직저장)
app.post('/upload', uploadDisk.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '이미지 파일이 필요합니다.' });

    const filename = req.file.filename;     // "<id>.<ext>"
    const id = path.parse(filename).name;   // "<id>"
    const owner = req.session.user ? req.session.user.id : null;
    const memo  = (req.body?.memo ?? '').toString();
    const url   = `/image/${id}`;

    images.push({
      id, filename, url, memo, owner,
      views: 0,
      dailyCounts: {},       // 집계형
      topReferers: {},       // 집계형
      createdAt: new Date().toISOString()
    });
    persistImages();

    return res.json({ url, memo });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// 이미지 제공(집계/캐시 포함)
app.get('/image/:id', (req, res) => {
  const id = (req.params.id || '').replace(/\.[^/.]+$/,''); // 확장자 붙여도 허용
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
  // 통계: 네이버 블로그만 카운트(자체/렌더 도메인은 제외)
  if (isNaverBlogReferer(referer) && !isMySiteReferer(referer)) {

    // ----- 방문자(IP+UA) 로그: 상한 유지 -----
    const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const now = new Date();

    const key = `${ip}__${ua}`;
    if (!img.visitors) img.visitors = [];

    let v = img.visitors.find(x => x.key === key);
    if (!v) {
      if (img.visitors.length >= MAX_VISITORS) {
        img.visitors.sort((a,b) => (new Date(a.lastAt||0)) - (new Date(b.lastAt||0)));
        img.visitors.splice(0, Math.max(1, img.visitors.length - MAX_VISITORS + 1));
      }
      v = { key, ip, ua, count: 0, visits: [], lastAt: null };
      img.visitors.push(v);
    }
    v.count = (v.count || 0) + 1;
    v.lastAt = now.toISOString();
    if (!Array.isArray(v.visits)) v.visits = [];
    v.visits.push({ time: v.lastAt });
    if (v.visits.length > MAX_VISITS_PER_VISITOR) {
      v.visits.splice(0, v.visits.length - MAX_VISITS_PER_VISITOR);
    }

    img.views = (img.views || 0) + 1;

    if (!img.dailyCounts) img.dailyCounts = {};
    img.dailyCounts[todayStr] = (img.dailyCounts[todayStr] || 0) + 1;

    if (!img.topReferers) img.topReferers = {};
    img.topReferers[referer] = (img.topReferers[referer] || 0) + 1;

    const entries = Object.entries(img.topReferers).sort((a,b)=>b[1]-a[1]);
    if (entries.length > MAX_REFERERS) {
      img.topReferers = Object.fromEntries(entries.slice(0, MAX_REFERERS));
    }

    const days = Object.keys(img.dailyCounts).sort(); // asc
    if (days.length > MAX_DAYS_KEEP) {
      const cut = days.length - MAX_DAYS_KEEP;
      for (let i=0;i<cut;i++) delete img.dailyCounts[days[i]];
    }
  }
  persistImages();

  // 캐시 헤더(교체를 고려하여 짧게)
  const stat = fs.statSync(filePath);
  res.set('Last-Modified', stat.mtime.toUTCString());
  res.set('ETag', `${stat.ino}-${stat.mtimeMs}-${stat.size}`);
  res.set('Cache-Control', 'public, max-age=600, must-revalidate'); // 10분

  // Content-Type
  const ext = path.extname(img.filename).toLowerCase();
  const map = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp' };
  res.set('Content-Type', map[ext] || 'application/octet-stream');

  res.sendFile(filePath);
});

// 상세
app.get('/image/:id/detail', (req, res) => {
  try {
    const img = images.find(i => i.id === req.params.id);
    if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const views = img.views || 0;

    // 가장 많이 불러간 블로그 referer (네이버 본문만)
    let blogUrl = null, blogCount = 0;
    if (img.topReferers && typeof img.topReferers === 'object') {
      const entries = Object.entries(img.topReferers)
        .filter(([u]) => isRealBlogPost(u)) // ★ 필터링 추가
        .sort((a,b)=>b[1]-a[1]);
      if (entries.length) { blogUrl = entries[0][0]; blogCount = entries[0][1]; }
    }

    // 오늘 방문수
    const todayStr = new Date().toISOString().slice(0,10);
    const todayVisits = (img.dailyCounts?.[todayStr]) || 0;

    // ★ visitors 응답에 포함 (프론트에서 표 렌더)
    const visitors = (img.visitors || []).map(x => ({
      ip: x.ip,
      ua: x.ua,
      count: x.count || 0,
      visits: Array.isArray(x.visits) ? x.visits : [],
      lastAt: x.lastAt || null
    }));

    res.json({
      id: img.id,
      filename: img.filename,
      blogUrl,
      blogCount,
      views,
      todayVisits,
      visitors,                 // ★ 추가
      dailyCounts: img.dailyCounts || {},
      topReferers: img.topReferers || {}
    });
  } catch (e) {
    console.error('상세 정보 조회 오류:', e);
    res.status(500).json({ error: '상세 정보 조회 중 오류가 발생했습니다.' });
  }
});

// 일자별 방문
app.get('/image/:id/daily-visits', (req, res) => {
  try {
    const img = images.find(i => i.id === req.params.id);
    if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const dc = img.dailyCounts || {};
    const dailyVisits = Object.entries(dc)
      .map(([date, count]) => ({ date, count }))
      .sort((a,b) => a.date.localeCompare(b.date));
    res.json({ id: img.id, dailyVisits });
  } catch (e) {
    console.error('일자별 방문수 조회 오류:', e);
    res.status(500).json({ error: '일자별 방문수 조회 중 오류가 발생했습니다.' });
  }
});

// 대시보드 데이터
app.get('/dashboard-data', (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    const base = (req.session.user.role === 'admin')
      ? images
      : images.filter(img => img.owner === req.session.user.id);

    // ★ 각 레코드에 blogUrl 필드 계산해 포함
    const withBlog = base.map(img => {
      let blogUrl = null;
      if (img.topReferers && typeof img.topReferers === 'object') {
        const best = Object.entries(img.topReferers)
          .filter(([u]) => isRealBlogPost(u))
          .sort((a,b)=>b[1]-a[1])[0];
        blogUrl = best ? best[0] : null;
      }
      return { ...img, blogUrl };
    });

    res.json(withBlog);
  } catch (e) {
    console.error('Dashboard data error:', e);
    res.status(500).json({ error: '대시보드 데이터 조회 중 오류가 발생했습니다.' });
  }
});

// 대시보드 데이터(엑셀)
app.get('/dashboard-excel', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

    const filtered = (req.session.user.role === 'admin')
      ? images
      : images.filter(i => i.owner === req.session.user.id);

    // 모든 날짜 수집(집계형)
    const allDatesSet = new Set();
    filtered.forEach(img => {
      Object.keys(img.dailyCounts || {}).forEach(d => allDatesSet.add(d));
    });
    const allDates = Array.from(allDatesSet).sort((a,b) => b.localeCompare(a)); // desc

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Dashboard');

    const baseColumns = [
      { header: '이미지 링크', key: 'image', width: 40 },
      { header: '주요 블로그 URL', key: 'blog', width: 40 },
      { header: '메모', key: 'memo', width: 30 },
      { header: '총 방문수', key: 'views', width: 12 }
    ];
    const dateColumns = allDates.map(d => ({ header: d, key: `date_${d}`, width: 12 }));
    ws.columns = [...baseColumns, ...dateColumns];

    filtered.forEach(img => {
      // 블로그 상위 1개 (네이버 본문만)
      let blogUrl = '-';
      if (img.topReferers && typeof img.topReferers === 'object') {
        const entries = Object.entries(img.topReferers)
          .filter(([u]) => isRealBlogPost(u))
          .sort((a,b)=>b[1]-a[1]);
        if (entries.length) blogUrl = entries[0][0];
      }
      const row = {
        image: `${req.protocol}://${req.get('host')}/image/${img.id}`,
        blog: blogUrl,
        memo: img.memo || '',
        views: img.views || 0
      };
      allDates.forEach(d => { row[`date_${d}`] = (img.dailyCounts?.[d]) || 0; });
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

// 삭제
app.delete('/image/:id', (req, res) => {
  try {
    const id = req.params.id;
    const idx = images.findIndex(img => img.id === id);
    if (idx === -1) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const filePath = path.join(UPLOADS_DIR, images[idx].filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (err) { console.error('Error deleting image file:', err); }
    }
    images.splice(idx, 1);
    persistImages();

    res.json({ success: true });
  } catch (e) {
    console.error('이미지 삭제 오류:', e);
    res.status(500).json({ error: '이미지 삭제 중 오류가 발생했습니다.' });
  }
});

// 교체(파일 내용만 덮어쓰기, URL/파일명 유지)
app.post('/replace-image', uploadMem.single('image'), (req, res) => {
  try {
    const id = req.body.id;
    if (!id || !req.file) return res.json({ success: false, error: 'ID 또는 파일 누락' });

    const target = images.find(img => img.id === id);
    if (!target) return res.json({ success: false, error: '이미지 ID 불일치' });

    const imagePath = path.join(UPLOADS_DIR, target.filename);
    fs.writeFileSync(imagePath, req.file.buffer);  // 기존 파일 내용만 교체

    // 프런트에서 캐시 무력화를 원하면, /image/:id?ts=... 형태로 요청 권장.
    res.json({ success: true, newUrl: target.url });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('[Error middleware]', err);
  res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[boot] listening on ${PORT}`);
  console.log(`[boot] DATA_DIR=${DATA_DIR}`);
  console.log(`[boot] UPLOADS_DIR=${UPLOADS_DIR}`);
  console.log(`[boot] SESSIONS_DIR=${SESSIONS_DIR}`);
});