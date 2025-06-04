const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const FileStore = require('session-file-store')(session);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const isProd = process.env.NODE_ENV === 'production';

// CORS 미들웨어 (세션보다 먼저)
app.use(cors({
  origin: isProd ? ['https://hwaseon-image.com', 'https://hwaseon-image.onrender.com'] : ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const IMAGES_JSON = path.join(DATA_DIR, 'images.json');
const USERS_JSON = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
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
    users = JSON.parse(fs.readFileSync(USERS_JSON, 'utf-8'));
  } catch (e) {
    users = [];
  }
} else {
  // 최초 실행 시 관리자 계정 생성
  users = [{ id: 'hwaseon', pw: bcrypt.hashSync('hwaseon@00', 8), role: 'admin', createdAt: getKSTString() }];
  fs.writeFileSync(USERS_JSON, JSON.stringify(users, null, 2));
}
function saveUsers() {
  fs.writeFileSync(USERS_JSON, JSON.stringify(users, null, 2));
}

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

// 세션 미들웨어 (파일 기반, 환경별 secure/sameSite 분기)
app.use(session({
  secret: 'hwaseon-secret',
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    path: './sessions',
    ttl: 24 * 60 * 60,
    reapInterval: 60 * 60,
    retries: 0
  }),
  cookie: {
    httpOnly: true,
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProd ? 'none' : 'lax'
  }
}));

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

app.post('/upload', upload.single('image'), (req, res) => {
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
    images.push({
      id,
      filename: newFilename,
      memo,
      views: 0,
      ips: [],
      referers: [],
      owner: req.session.user?.id || 'anonymous',
      createdAt: getKSTString()
    });
    urls.push(`${req.protocol}://${req.get('host')}/image/${id}${ext}`);
    memosOut.push(memo);
  }
  saveImages();
  fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
  res.json({ urls, memos: memosOut });
});

app.get('/dashboard-data', requireLogin, (req, res) => {
  const user = req.session.user;
  let filtered;
  if (user.role === 'admin') {
    filtered = images;
  } else {
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

app.get('/me', (req, res) => {
  if (!req.session.user) return res.json({});
  res.json({ id: req.session.user.id, role: req.session.user.role });
});

app.get('/users', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한 없음' });
  res.json(users.map(u => ({ id: u.id, createdAt: u.createdAt, role: u.role })));
});

app.post('/register', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한 없음' });
  const { id, pw } = req.body;
  if (!id || !pw) return res.status(400).json({ error: '필수 입력값 누락' });
  if (users.find(u => u.id === id)) return res.status(409).json({ error: '이미 존재하는 아이디' });
  users.push({ id, pw: bcrypt.hashSync(pw, 8), role: 'user', createdAt: getKSTString() });
  saveUsers();
  res.json({ success: true });
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

// 관리자 로그인 API
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: '비밀번호를 입력해주세요.' });
  }
  if (password !== 'hwaseon@00') {
    return res.status(401).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
  }
  req.session.user = {
    id: 'admin',
    username: 'hwaseonad',
    isAdmin: true
  };
  req.session.save(err => {
    if (err) {
      return res.status(500).json({ success: false, message: '세션 저장 오류' });
    }
    res.json({ success: true, user: req.session.user });
  });
});

// 관리자 인증 미들웨어
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(401).json({ success: false, message: '관리자 권한이 필요합니다.' });
  }
  next();
}

// 로그인
app.post('/login', (req, res) => {
  const { id, pw } = req.body;
  const user = users.find(u => u.id === id);
  if (!user) return res.status(401).json({ error: '존재하지 않는 계정입니다.' });
  if (!bcrypt.compareSync(pw, user.pw)) return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
  req.session.user = { id: user.id, role: user.role };
  res.json({ success: true, id: user.id, role: user.role });
});

// 로그아웃
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/image/:id', (req, res) => {
  // id에서 확장자 제거
  const id = req.params.id.split('.')[0];
  const img = images.find(i => i.id === id);
  if (!img) return res.status(404).send('Not found');
  const ext = path.extname(img.filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.webp') contentType = 'image/webp';
  res.set('Content-Type', contentType);
  res.sendFile(path.join(UPLOADS_DIR, img.filename));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 