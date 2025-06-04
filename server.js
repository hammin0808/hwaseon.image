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

// 세션 미들웨어
app.use(session({
  secret: 'hwaseon-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    secure: true,
    sameSite: 'none',
    domain: '.hwaseon-image.com'
  }
}));

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

app.post('/upload', upload.single('image'), (req, res) => {
  const id = Date.now().toString();
  const { memo } = req.body;
  const filename = req.file.filename;
  const ext = path.extname(filename);
  images.push({ id, filename, memo, views: 0, ips: [], referers: [], owner: req.session.user?.id || 'anonymous', createdAt: getKSTString() });
  saveImages();
  const imageUrl = `${req.protocol}://${req.get('host')}/image/${id}${ext}`;
  res.json({ url: imageUrl, memo });
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
  // ...생성 코드...
});

app.delete('/users/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: '권한 없음' });
  // ...삭제 코드...
});

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 