const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const DATA_DIR = "/data"
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const IMAGES_JSON = path.join(DATA_DIR, 'images.json');
const USERS_JSON = path.join(DATA_DIR, 'users.json');

console.log('=== Server Startup Debug Info ===');
console.log('DATA_DIR:', DATA_DIR);
console.log('UPLOADS_DIR:', UPLOADS_DIR);
console.log('IMAGES_JSON:', IMAGES_JSON);
console.log('USERS_JSON:', USERS_JSON);
console.log('Directory exists:', fs.existsSync(DATA_DIR));
console.log('Users file exists:', fs.existsSync(USERS_JSON));
console.log('Images file exists:', fs.existsSync(IMAGES_JSON));

if (!fs.existsSync(UPLOADS_DIR)) {
  console.log('Creating UPLOADS_DIR:', UPLOADS_DIR);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// images.json에서 데이터 복원
let images = [];
if (fs.existsSync(IMAGES_JSON)) {
  try {
    images = JSON.parse(fs.readFileSync(IMAGES_JSON, 'utf-8'));
  } catch (e) {
    images = [];
  }
}
function saveImages() {
  fs.writeFileSync(IMAGES_JSON, JSON.stringify(images, null, 2));
}

// users.json에서 데이터 복원
let users = [];
if (fs.existsSync(USERS_JSON)) {
  try {
    const usersData = fs.readFileSync(USERS_JSON, 'utf-8');
    console.log('Users file content:', usersData);
    users = JSON.parse(usersData);
  } catch (e) {
    console.error('Error loading users:', e);
    users = [];
  }
} else {
  console.log('Creating default admin user');
  users = [{ id: 'hwaseon', pw: bcrypt.hashSync('hwaseon@00', 8), role: 'admin', createdAt: getKSTString() }];
  fs.writeFileSync(USERS_JSON, JSON.stringify(users, null, 2));
}
function saveUsers() {
  fs.writeFileSync(USERS_JSON, JSON.stringify(users, null, 2));
}

// 세션 미들웨어
app.use(session({
  secret: 'hwaseon-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage });

function getKSTString() {
  const now = new Date();
  return now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\./g, '-').replace(' 오전', '').replace(' 오후', '').replace(/\s+/g, ' ').trim();
}

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

app.post('/login', (req, res) => {
  const { id, pw } = req.body;
  console.log('Login attempt:', { id, pw });
  console.log('Available users:', users);
  const user = users.find(u => u.id === id);
  if (!user) {
    console.log('User not found');
    return res.status(401).json({ error: '존재하지 않는 계정입니다.' });
  }
  if (!bcrypt.compareSync(pw, user.pw)) {
    console.log('Password mismatch');
    return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
  }
  console.log('Login successful:', { id: user.id, role: user.role });
  req.session.user = { id: user.id, role: user.role };
  res.json({ success: true, id: user.id, role: user.role });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// 관리자만 계정 생성
app.post('/register', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한 없음' });
  const { id, pw } = req.body;
  if (!id || !pw) return res.status(400).json({ error: '필수 입력값 누락' });
  if (users.find(u => u.id === id)) return res.status(409).json({ error: '이미 존재하는 아이디' });
  users.push({ id, pw: bcrypt.hashSync(pw, 8), role: 'user', createdAt: getKSTString() });
  saveUsers();
  res.json({ success: true });
});

app.post('/upload', requireLogin, upload.single('image'), (req, res) => {
  let memos = req.body['memo[]'] || req.body.memo;
  if (!Array.isArray(memos)) memos = memos ? [memos] : [];
  if (!req.file || memos.length === 0) return res.status(400).json({ error: '이미지와 메모를 모두 입력하세요.' });
  const ext = path.extname(req.file.filename);
  const urls = [];
  const memosOut = [];
  for (const memo of memos) {
    const id = Date.now().toString() + Math.floor(Math.random()*100000).toString();
    const newFilename = id + ext;
    fs.copyFileSync(path.join(UPLOADS_DIR, req.file.filename), path.join(UPLOADS_DIR, newFilename));
    images.push({ id, filename: newFilename, memo, views: 0, ips: [], referers: [], owner: req.session.user.id, createdAt: getKSTString() });
    urls.push(`${req.protocol}://${req.get('host')}/image/${id}${ext}`);
    memosOut.push(memo);
  }
  saveImages();
  fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
  res.json({ urls, memos: memosOut });
});

app.get('/image/:id', (req, res) => {
  const id = req.params.id.split('.')[0]; // 확장자 제거
  const img = images.find(i => i.id === id);
  if (!img) return res.status(404).send('Not found');
  const isDashboard = req.query.dashboard === '1';
  const botIpPatterns = [
    /^110\.93\.146\./,
    /^220\.230\.168\./
    // 필요시 추가
  ];
  const botUaPatterns = [
    /Yeti/i,
    /NaverBot/i,
    /Daumoa/i,
    /Googlebot/i,
    /bingbot/i
    // 필요시 추가
  ];
  const ipRaw = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const ip = Array.isArray(ipRaw) ? ipRaw[0] : (ipRaw || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const isBotIp = botIpPatterns.some(re => re.test(ip));
  const isBotUa = botUaPatterns.some(re => re.test(ua));
  const referer = req.headers['referer'] || '';
  const isRealBlog =
    referer &&
    !referer.includes('/dashboard') &&
    !referer.includes('/image/') &&
    !referer.includes('onrender.com') &&
    !referer.includes('localhost') &&
    !referer.includes('127.0.0.1') &&
    !referer.includes(req.get('host')) &&
    !/\/(write|postwrite|edit|compose|admin|preview|PostWriteForm)/i.test(referer);

  // IP + User-Agent 조합으로 방문자 구분
  const visitorKey = ip + '|' + ua;

  if (!isDashboard && !isBotIp && !isBotUa && isRealBlog) {
    const now = getKSTString();
    let ipInfo = img.ips.find(x => x.visitorKey === visitorKey);
    let shouldCount = true;
    if (ipInfo) {
      const last = new Date(ipInfo.lastVisit.replace(/-/g, '/'));
      const curr = new Date(now.replace(/-/g, '/'));
      const diffSec = (curr - last) / 1000;
      if (diffSec < 60) shouldCount = false;
    }
    if (shouldCount) {
      img.views++;
      if (!ipInfo) {
        img.ips.push({ ip, ua, visitorKey, count: 1, firstVisit: now, lastVisit: now });
      } else {
        ipInfo.count++;
        ipInfo.lastVisit = now;
      }
      let refInfo = img.referers.find(x => x.referer === referer);
      if (!refInfo) {
        img.referers.push({ referer, count: 1, firstVisit: now, lastVisit: now });
      } else {
        refInfo.count++;
        refInfo.lastVisit = now;
      }
    }
  }
  // Content-Type 지정
  const ext = path.extname(img.filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.webp') contentType = 'image/webp';
  res.set('Content-Type', contentType);
  res.sendFile(path.join(UPLOADS_DIR, img.filename));
});

app.get('/dashboard-data', requireLogin, (req, res) => {
  const user = req.session.user;
  let filtered;
  if (user.role === 'admin') {
    // 관리자: 모든 데이터(소유자 없는 데이터 포함)
    filtered = images;
  } else {
    // 일반 사용자: owner가 본인인 데이터만
    filtered = images.filter(i => i.owner === user.id);
  }
  res.json(filtered.map(i => ({
    url: `/image/${i.id}`,
    memo: i.memo,
    views: i.views,
    ips: i.ips,
    referers: i.referers,
    unique: i.ips.length,
    filename: i.filename,
    owner: i.owner,
    createdAt: i.createdAt
  })));
});

app.delete('/image/:id', (req, res) => {
  const idx = images.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const filename = images[idx].filename;
  images.splice(idx, 1);
  saveImages();
  fs.unlink(path.join(UPLOADS_DIR, filename), () => {});
  res.json({ success: true });
});

// 현재 로그인한 사용자 정보 반환
app.get('/me', (req, res) => {
  if (!req.session.user) return res.json({});
  res.json({ id: req.session.user.id, role: req.session.user.role });
});

// 관리자만 사용자 목록/삭제 API
app.get('/users', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한 없음' });
  res.json(users.map(u => ({ id: u.id, createdAt: u.createdAt, role: u.role })));
});
app.delete('/users/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한 없음' });
  const { id } = req.params;
  if (id === 'hwaseon') return res.status(400).json({ error: '관리자 계정은 삭제할 수 없습니다.' });
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: '존재하지 않는 계정' });
  users.splice(idx, 1);
  saveUsers();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 