/* eslint-disable no-console */
// -*- coding: utf-8 -*-

const express = require('express');
const multer = require('multer');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== 경로/상수 (로컬 고정) ===== */
const ROOT_DIR     = path.resolve(__dirname);
const DATA_DIR     = path.join(ROOT_DIR, 'data');         // 로컬: ./data
const USERS_FILE   = path.join(DATA_DIR, 'users.json');
const IMAGES_FILE  = path.join(DATA_DIR, 'images.json');
const UPLOADS_DIR  = path.join(DATA_DIR, 'uploads');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const MAX_DAILY_TRAFFIC = 1500;

// 관리자 기본값: 로컬 테스트 UX에 맞춤(관리자 탭은 PW만)
const ADMIN_ID = process.env.ADMIN_ID || 'hwaseon';
const ADMIN_PW = process.env.ADMIN_PW || 'hwaseon@00';

// 필수 디렉터리 보장
[DATA_DIR, UPLOADS_DIR, SESSIONS_DIR].forEach(p => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

/* ===== 유틸 ===== */
function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.error('loadJson error:', e); }
  return fallback;
}
function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('saveJson error:', e); }
}
function persistUsers() { saveJson(USERS_FILE, users); }
function persistImages() { saveJson(IMAGES_FILE, images); }

/* ===== 초기 데이터 ===== */
let users = loadJson(USERS_FILE, []);
let images = loadJson(IMAGES_FILE, []);

// 관리자 계정 보장 (ADMIN_ID/ADMIN_PW)
if (!users.some(u => u.id === ADMIN_ID)) {
  users.unshift({ id: ADMIN_ID, pw: ADMIN_PW, role: 'admin', createdAt: new Date().toISOString() });
  persistUsers();
}

/* ===== 미들웨어 ===== */
app.use(express.static(path.join(ROOT_DIR, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 폼 전송 대응

// CORS (같은 오리진이면 문제 없음. 필요시 조정)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

/* ===== 업로드 ===== */
const fileFilter = (req, file, cb) => {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('지원하지 않는 이미지 형식입니다.'), false);
};
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

/* ===== 블로그/리퍼러 판별 ===== */
function isRealBlogPost(url) {
  if (!url) return false;
  return /^https?:\/\/(?:blog|m\.blog)\.naver\.com\/(?:[^/]+\/\d+|PostView\.naver\?blogId=[^&]+&logNo=\d+)/.test(url);
}
function isNaverBlogReferer(url) {
  if (!url) return false;
  if (!/^https?:\/\/(blog|m\.blog)\.naver\.com\//.test(url)) return false;
  if (/PostWriteForm\.naver/.test(url) || /\/home([/?#]|$)/.test(url) || /\/section([/?#]|$)/.test(url) || /\/dashboard([/?#]|$)/.test(url)) return false;
  return true;
}
function isMySiteReferer(url) {
  if (!url) return false;
  return /hwaseon-image\.com|onrender\.com/.test(url);
}

/* ===== 라우트 ===== */

// 로그인 페이지
app.get('/login', (req, res) => res.redirect('/login.html'));

// 로그인 (관리자 PW-only 허용)
app.post('/login', (req, res) => {
  try {
    const { id, pw, admin } = req.body || {};

    // 관리자: PW만 들어와도 허용
    const adminPwOnly = pw && (!id || id === '' || admin === true);
    if (adminPwOnly) {
      if (pw === ADMIN_PW) {
        req.session.user = { id: ADMIN_ID, role: 'admin' };
        return res.json({ success: true, role: 'admin' });
      }
      return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
    }

    // 일반 로그인
    if (!id || !pw) return res.status(400).json({ error: 'ID/PW가 비어 있습니다.' });

    // 관리자 일반 로그인도 허용
    if (id === ADMIN_ID && pw === ADMIN_PW) {
      req.session.user = { id: ADMIN_ID, role: 'admin' };
      return res.json({ success: true, role: 'admin' });
    }

    const user = users.find(u => u.id === id && u.pw === pw);
    if (user) {
      req.session.user = { id: user.id, role: user.role };
      return res.json({ success: true, role: user.role });
    }
    res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
  }
});

// 로그아웃
app.post('/logout', (req, res) => {
  try { req.session.destroy(() => res.json({ success: true })); }
  catch (e) { console.error('Logout error:', e); res.status(500).json({ error: '로그아웃 중 오류가 발생했습니다.' }); }
});

// 사용자 정보
app.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.session.user);
});

// 대시보드 페이지 (인증)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(ROOT_DIR, 'public', 'dashboard.html'));
});
app.get('/dashboard.html', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(ROOT_DIR, 'public', 'dashboard.html'));
});

// 대시보드 데이터
app.get('/dashboard-data', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.user.role === 'admin') return res.json(images);
  res.json(images.filter(img => img.owner === req.session.user.id));
});

// 사용자 목록(관리자)
app.get('/users', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한이 없습니다.' });
  res.json(users);
});

// 사용자 등록
app.post('/register', (req, res) => {
  try {
    const { id, pw } = req.body;
    if (!id || !pw) return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
    if (users.some(u => u.id === id)) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
    const newUser = { id, pw, role: 'user', createdAt: new Date().toISOString() };
    users.push(newUser); persistUsers();
    res.json({ success: true, user: newUser });
  } catch (e) { console.error('Register error:', e); res.status(500).json({ error: '사용자 등록 중 오류가 발생했습니다.' }); }
});

// 사용자 삭제(관리자)
app.delete('/users/:id', (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한이 없습니다.' });
    const userId = req.params.id;
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    if (users[idx].role === 'admin') return res.status(403).json({ error: '관리자는 삭제할 수 없습니다.' });
    users.splice(idx, 1); persistUsers();
    res.json({ success: true });
  } catch (e) { console.error('Delete user error:', e); res.status(500).json({ error: '사용자 삭제 중 오류가 발생했습니다.' }); }
});

// 업로드 (메모리 → 디스크 저장)
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    const owner = req.session.user ? req.session.user.id : null;
    const memos = Array.isArray(req.body.memo) ? req.body.memo : [req.body.memo ?? ''];

    const created = [];
    for (const m of memos) {
      const id = Date.now().toString() + Math.floor(Math.random() * 10000);
      const ext = (path.extname(req.file.originalname || '').toLowerCase() || '.jpg').replace(/[^.\w]/g, '');
      const filename = `${id}${ext}`;
      const imagePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(imagePath, req.file.buffer);

      const url = `/image/${id}`;
      images.push({
        id, filename, url,
        memo: String(m || ''),
        owner, views: 0, ips: [], referers: [],
        createdAt: new Date().toISOString()
      });
      created.push({ id, url });
    }
    persistImages();

    if (created.length > 1) return res.json({ urls: created.map(c => c.url), memos: memos.map(x => String(x || '')) });
    return res.json({ url: created[0].url, memo: String(memos[0] || '') });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// OPTIONS
app.options('/image/:id', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent',
    'Access-Control-Max-Age': '86400'
  });
  res.status(204).end();
});

// 이미지 제공
app.get('/image/:id', (req, res) => {
  const id = String(req.params.id || '').replace(/\.[^/.]+$/, '');
  const img = images.find(i => i.id === id);
  if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

  // 일일 트래픽 제한 (1,500회)
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!img.todayDate || img.todayDate !== todayStr) { img.todayDate = todayStr; img.todayCount = 0; }
  if ((img.todayCount || 0) >= MAX_DAILY_TRAFFIC) return res.status(429).json({ error: '하루 트래픽(1,500회) 초과' });
  img.todayCount = (img.todayCount || 0) + 1;

  const filePath = path.join(UPLOADS_DIR, img.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '이미지 파일을 찾을 수 없습니다.' });

  // 카운트 정책(네이버 블로그만)
  const referer = req.headers['referer'] || '';
  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const now = new Date();

  img.views ??= 0;
  if (!Array.isArray(img.ips)) img.ips = [];
  if (!Array.isArray(img.referers)) img.referers = [];

  if (isNaverBlogReferer(referer) && !isMySiteReferer(referer)) {
    img.views += 1;

    let ipInfo = img.ips.find(x => x.ip === ip && x.ua === ua);
    if (!ipInfo) img.ips.push({ ip, ua, count: 1, visits: [{ time: now.toISOString() }] });
    else { ipInfo.count++; (ipInfo.visits ||= []).push({ time: now.toISOString() }); }

    const existing = img.referers.find(r => r.referer === referer);
    if (existing) existing.count = (existing.count || 0) + 1;
    else img.referers.push({ referer, count: 1, createdAt: now.toISOString() });
  }

  persistImages();

  const ext = path.extname(img.filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.webp') contentType = 'image/webp';

  res.set('Content-Type', contentType);
  res.sendFile(filePath);
});

// 이미지 상세
app.get('/image/:id/detail', (req, res) => {
  try {
    const img = images.find(i => i.id === req.params.id);
    if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const views = img.views || 0;
    let unique = img.ips ? img.ips.length : 0;
    if (unique > views) unique = views;

    const todayStr = new Date().toISOString().slice(0, 10);
    let todayVisits = 0;
    (img.ips || []).forEach(x => (x.visits || []).forEach(v => { if (v.time?.slice(0,10) === todayStr) todayVisits += 1; }));

    let blogUrl = null, blogCreated = null;
    if (img.referers && img.referers.length > 0) {
      const sorted = img.referers.slice().sort((a,b) => b.count - a.count);
      blogUrl = sorted[0].referer; blogCreated = sorted[0].createdAt;
    }

    const ips = (img.ips || []).map(x => ({ ip: x.ip, ua: x.ua, count: x.count, visits: x.visits || [] }));

    res.json({ id: img.id, filename: img.filename, blogUrl, blogCreated, views, todayVisits, ips, referers: img.referers || [] });
  } catch (e) { console.error('상세 정보 조회 오류:', e); res.status(500).json({ error: '상세 정보 조회 중 오류가 발생했습니다.' }); }
});

// 일자별 방문수
app.get('/image/:id/daily-visits', (req, res) => {
  try {
    const img = images.find(i => i.id === req.params.id);
    if (!img) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const dailyMap = {};
    (img.ips || []).forEach(ipinfo => (ipinfo.visits || []).forEach(v => {
      const date = v.time?.slice(0,10); if (date) dailyMap[date] = (dailyMap[date] || 0) + 1;
    }));
    const dailyVisits = Object.entries(dailyMap).map(([date,count]) => ({ date, count }))
      .sort((a,b) => a.date.localeCompare(b.date));
    res.json({ id: img.id, dailyVisits });
  } catch (e) { console.error('일자별 방문수 조회 오류:', e); res.status(500).json({ error: '일자별 방문수 조회 중 오류가 발생했습니다.' }); }
});

// 이미지 삭제
app.delete('/image/:id', (req, res) => {
  try {
    const id = req.params.id;
    const idx = images.findIndex(img => img.id === id);
    if (idx === -1) return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });

    const filePath = path.join(UPLOADS_DIR, images[idx].filename);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (err) { console.error('파일 삭제 오류:', err); } }

    images.splice(idx, 1); persistImages();
    res.json({ success: true });
  } catch (e) { console.error('이미지 삭제 오류:', e); res.status(500).json({ error: '이미지 삭제 중 오류가 발생했습니다.' }); }
});

// Excel 다운로드 (현재 Host 기반 링크)
app.get('/dashboard-excel', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

    const filteredImages = req.session.user.role === 'admin' ? images : images.filter(img => img.owner === req.session.user.id);

    const allDatesSet = new Set();
    filteredImages.forEach(img => (img.ips || []).forEach(ipinfo => (ipinfo.visits || []).forEach(v => { if (v.time) allDatesSet.add(v.time.slice(0,10)); })));
    const allDates = Array.from(allDatesSet).sort((a,b) => b.localeCompare(a));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dashboard');

    const base = `${req.protocol}://${req.headers.host}`; // ← 로컬/운영 모두 자연스러움
    const baseColumns = [
      { header: '이미지 링크', key: 'image', width: 40 },
      { header: '블로그 URL', key: 'blog', width: 40 },
      { header: '메모', key: 'memo', width: 30 },
      { header: '총 방문수', key: 'views', width: 12 },
    ];
    const dateColumns = allDates.map(date => ({ header: date, key: `date_${date}`, width: 12 }));
    worksheet.columns = [...baseColumns, ...dateColumns];

    filteredImages.forEach(img => {
      let blogUrl = '-';
      if (img.referers && img.referers.length > 0) {
        const real = img.referers.find(r => isRealBlogPost(r.referer));
        blogUrl = real ? real.referer : '-';
      }
      const dailyMap = {};
      (img.ips || []).forEach(ipinfo => (ipinfo.visits || []).forEach(v => {
        const date = v.time ? v.time.slice(0,10) : null;
        if (date) dailyMap[date] = (dailyMap[date] || 0) + 1;
      }));

      const row = { image: `${base}/image/${img.id}`, blog: blogUrl, memo: img.memo || '', views: img.views || 0 };
      allDates.forEach(date => { row[`date_${date}`] = dailyMap[date] || 0; });
      worksheet.addRow(row);
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=dashboard_data.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) { console.error('Excel download error:', e); res.status(500).json({ error: '엑셀 다운로드 중 오류가 발생했습니다.' }); }
});

// 이미지 교체(덮어쓰기)
app.post('/replace-image', upload.single('image'), (req, res) => {
  const id = req.body.id;
  const file = req.file;
  if (!id || !file) return res.json({ success: false, error: 'ID 또는 파일 누락' });

  try {
    const target = images.find(img => img.id === id);
    if (!target) return res.json({ success: false, error: '이미지 ID 불일치' });

    const imagePath = path.join(UPLOADS_DIR, target.filename);
    fs.writeFileSync(imagePath, file.buffer); // 파일 내용 덮어쓰기
    persistImages();
    res.json({ success: true, newUrl: target.url });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ===== 서버 시작 ===== */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`DATA_DIR: ${DATA_DIR}`);
  console.log(`UPLOADS_DIR: ${UPLOADS_DIR}`);
  console.log(`SESSIONS_DIR: ${SESSIONS_DIR}`);
});

/* ===== 에러 핸들러 ===== */
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
});
