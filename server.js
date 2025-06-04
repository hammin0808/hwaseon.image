const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

// 도메인 설정
const BASE_URL = process.env.NODE_ENV === 'production'
  ? (process.env.DOMAIN || 'https://your-domain.com')
  : `http://localhost:${PORT}`;

// 필요한 디렉토리 설정
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const IMAGES_JSON = path.join(DATA_DIR, 'images.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// 필요한 디렉토리 생성
[DATA_DIR, UPLOADS_DIR, SESSIONS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

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

// 사용자 데이터 로드 함수
function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      // 기본 관리자 계정 생성
      const defaultAdmin = {
        users: [{
          id: '1',
          username: 'admin',
          passwordHash: '$2a$10$YourHashedPasswordHere', // 실제 해시된 비밀번호로 변경 필요
          isAdmin: true,
          createdAt: new Date().toISOString()
        }]
      };
      fs.writeFileSync(USERS_FILE, JSON.stringify(defaultAdmin, null, 2));
      return defaultAdmin;
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error loading users:', error);
    return { users: [] };
  }
}

// 세션 설정
app.use(session({
  secret: 'hwaseon-secret-key',
  resave: true,
  saveUninitialized: true,
  store: new FileStore({
    path: SESSIONS_DIR,
    ttl: 24 * 60 * 60,
    reapInterval: 60 * 60,
    retries: 0
  }),
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// 세션 디버깅 미들웨어
app.use((req, res, next) => {
  console.log('Session Debug:', {
    sessionID: req.sessionID,
    user: req.session.user,
    path: req.path
  });
  next();
});

app.use(express.static('public'));
app.use(express.json());

// 로그인 미들웨어
const requireLogin = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// 로그인 라우트
app.post('/login', async (req, res) => {
  const { password } = req.body;
  
  try {
    const userData = loadUsers();
    const adminUser = userData.users.find(u => u.isAdmin);
    
    if (!adminUser) {
      return res.status(401).json({ error: 'Admin account not found' });
    }
    
    const isValidPassword = await bcrypt.compare(password, adminUser.passwordHash);
    
    if (isValidPassword) {
      req.session.user = {
        id: adminUser.id,
        username: adminUser.username,
        isAdmin: true
      };
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 로그아웃 라우트
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// 로그인 상태 확인 라우트
app.get('/login-status', (req, res) => {
  res.json({ 
    isLoggedIn: !!req.session.user,
    user: req.session.user ? {
      username: req.session.user.username,
      isAdmin: req.session.user.isAdmin
    } : null
  });
});

app.post('/upload', upload.single('image'), (req, res) => {
  const id = Date.now().toString();
  const { memo } = req.body;
  const filename = req.file.filename;
  const ext = path.extname(filename);
  images.push({ id, filename, memo, views: 0, ips: [], referers: [] });
  saveImages();
  const imageUrl = `${BASE_URL}/image/${id}${ext}`;
  res.json({ url: imageUrl, memo });
});

// 이미지 제공 라우트 추가
app.get('/image/:id', (req, res) => {
  const { id } = req.params;
  const image = images.find(img => img.id === id);
  
  if (!image) {
    return res.status(404).send('Image not found');
  }
  
  const imagePath = path.join(UPLOADS_DIR, image.filename);
  res.sendFile(imagePath);
});

app.get('/dashboard-data', requireLogin, (req, res) => {
  // 모든 사용자에게 images 전체를 보여줌 (owner, role 무관)
  res.json(images.map(i => ({
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 