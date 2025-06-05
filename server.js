const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fetch = require('node-fetch');
const app = express();
const PORT = 3000;

const DATA_DIR = '/data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const IMAGES_FILE = path.join(DATA_DIR, 'images.json');
const MAX_DAILY_TRAFFIC = 3000;

// 정적 파일 제공
app.use(express.static('public'));
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

// 세션 설정
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    store: new FileStore({
        path: path.join(DATA_DIR, 'sessions'),
        ttl: 24 * 60 * 60,
        reapInterval: 60 * 60,
        retries: 0
    }),
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    }
}));

// 파일에서 데이터 불러오기/저장 함수
function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) { console.error('loadJson error:', e); }
  return fallback;
}
function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) { console.error('saveJson error:', e); }
}

// 1. users, images 불러오기
let users = loadJson(USERS_FILE, []);
let images = loadJson(IMAGES_FILE, []);
// 2. 관리자 계정 없으면 추가
if (!users.some(u => u.id === 'admin')) {
  users.unshift({ id: 'admin', pw: 'hwaseon@00', role: 'admin', createdAt: new Date().toISOString() });
  saveJson(USERS_FILE, users);
}
// 3. users, images 변경시마다 저장 함수
function persistUsers() { saveJson(USERS_FILE, users); }
function persistImages() { saveJson(IMAGES_FILE, images); }

// uploads 디렉토리가 없으면 생성
const uploadsDir = path.join('/data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// 이미지 저장소 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // 파일명 중복 방지를 위해 타임스탬프 추가
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// 이미지 파일 필터링
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('지원하지 않는 이미지 형식입니다.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB 제한
    }
});

// 네이버 블로그 본문 URL만 남기는 함수
function isRealBlogPost(url) {
    // 더 관대한 URL 체크
    return url && (
        url.includes('blog.naver.com') || 
        url.includes('PostView.naver') ||
        url.includes('logNo=')
    );
}

// 이미지 업로드 라우트
app.post('/upload', upload.single('image'), (req, res) => {
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    try {
        if (!req.file) {
            console.error('파일이 없습니다!');
            return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
        }

        let memo = req.body.memo;
        const filename = req.file.filename;
        // owner: 로그인 상태면 user.id, 아니면 null
        const owner = req.session.user ? req.session.user.id : null;

        if (memo === undefined || memo === null) memo = '';

        if (Array.isArray(memo)) {
            const urls = [];
            const memos = [];
            (Array.isArray(memo) ? memo : [memo]).forEach(m => {
                const id = Date.now().toString() + Math.floor(Math.random() * 10000);
                const url = `/image/${id}`;
                images.push({
                    id,
                    filename,
                    url,
                    memo: m,
                    owner,
                    views: 0,
                    ips: [],
                    referers: [],
                    createdAt: new Date().toISOString()
                });
                urls.push(url);
                memos.push(m);
            });
            persistImages();
            return res.json({ urls, memos });
        } else {
            const id = Date.now().toString();
            const url = `/image/${id}`;
            images.push({
                id,
                filename,
                url,
                memo: memo.toString(),
                owner,
                views: 0,
                ips: [],
                referers: [],
                createdAt: new Date().toISOString()
            });
            persistImages();
            return res.json({
                url,
                memo: memo.toString()
            });
        }
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
    }
});

// OPTIONS 요청 처리
app.options('/image/:id', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent',
        'Access-Control-Max-Age': '86400'
    });
    res.status(204).end();
});

// 이미지 제공 라우트
app.get('/image/:id', async (req, res) => {
    // ID에서 확장자 제거
    const id = req.params.id.replace(/\.[^/.]+$/, '');
    
    console.log('Image request:', {
        originalId: req.params.id,
        cleanedId: id,
        referer: req.headers['referer'],
        userAgent: req.headers['user-agent'],
        origin: req.headers['origin'],
        host: req.headers['host']
    });

    const img = images.find(i => i.id === id);
    if (!img) {
        console.log('Image not found:', id);
        return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
    }

    // 하루 트래픽 제한 (3,000회)
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!img.todayDate || img.todayDate !== todayStr) {
        img.todayDate = todayStr;
        img.todayCount = 0;
    }
    if ((img.todayCount || 0) >= MAX_DAILY_TRAFFIC) {
        return res.status(429).json({ error: '하루 트래픽(3,000회) 초과' });
    }
    img.todayCount = (img.todayCount || 0) + 1;

    const filePath = path.join('/data', 'uploads', img.filename);
    if (!fs.existsSync(filePath)) {
        console.log('File not found:', filePath);
        return res.status(404).json({ error: '이미지 파일을 찾을 수 없습니다.' });
    }

    const referer = req.headers['referer'] || '';
    const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const now = new Date();

    // 1분 중복방지: IP+UA별 마지막 방문 시각
    let ipInfo = img.ips.find(x => x.ip === ip && x.ua === ua);
    if (!ipInfo) {
        img.ips.push({ 
            ip, 
            ua, 
            count: 1, 
            firstVisit: now.toISOString(), 
            lastVisit: now.toISOString(), 
            visits: [{ time: now.toISOString() }] 
        });
    } else {
        const last = new Date(ipInfo.lastVisit);
        if (now - last >= 60000) {
            ipInfo.count++;
            ipInfo.lastVisit = now.toISOString();
            ipInfo.visits.push({ time: now.toISOString() });
        }
    }

    // 블로그 URL 기록 (referer가 있으면 무조건 기록)
    if (referer) {
        let refInfo = img.referers.find(x => x.referer === referer);
        if (!refInfo) {
            img.referers.push({ 
                referer, 
                count: 1, 
                firstVisit: now.toISOString(), 
                lastVisit: now.toISOString() 
            });
        } else {
            refInfo.count++;
            refInfo.lastVisit = now.toISOString();
        }
    }
    persistImages();

    // Content-Type 설정
    const ext = path.extname(img.filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';

    // CORS 헤더 추가
    res.set({
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent',
        'Access-Control-Expose-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=31536000',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
    });

    // 반드시 이미지 파일을 전송!
    res.sendFile(filePath);
});

// 이미지 상세 정보 반환 라우트
app.get('/image/:id/detail', (req, res) => {
    try {
        const img = images.find(i => i.id === req.params.id);
        if (!img) {
            return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
        }
        // 유니크 방문자 수(IP+UA)
        const unique = img.ips ? img.ips.length : 0;
        // 전체 방문수
        const views = img.ips ? img.ips.reduce((sum, x) => sum + (x.count || 0), 0) : 0;
        // 오늘 방문수
        const todayStr = new Date().toISOString().slice(0, 10);
        let todayVisits = 0;
        if (img.ips) {
            img.ips.forEach(x => {
                if (x.visits) {
                    todayVisits += x.visits.filter(v => v.time.slice(0, 10) === todayStr).length;
                }
            });
        }
        // 블로그 referer(가장 많이 불러간 것, 없으면 첫 번째)
        let blogUrl = null, blogCreated = null;
        if (img.referers && img.referers.length > 0) {
            // 가장 많이 불러간 referer, 없으면 첫 번째
            const sorted = img.referers.slice().sort((a, b) => b.count - a.count || new Date(a.firstVisit) - new Date(b.firstVisit));
            blogUrl = sorted[0].referer;
            blogCreated = sorted[0].firstVisit;
        }
        // 접속 로그(IP, UA, 방문수)
        const ips = (img.ips || []).map(x => ({ ip: x.ip, ua: x.ua, count: x.count }));
        res.json({
            id: img.id,
            filename: img.filename,
            blogUrl,
            blogCreated,
            views,
            todayVisits,
            unique,
            ips,
            referers: img.referers || []
        });
    } catch (error) {
        console.error('상세 정보 조회 오류:', error);
        res.status(500).json({ error: '상세 정보 조회 중 오류가 발생했습니다.' });
    }
});

// 로그인 페이지 라우트
app.get('/login', (req, res) => {
    res.redirect('/login.html');
});

// 로그인 라우트
app.post('/login', (req, res) => {
    try {
        const { id, pw } = req.body;
        // 관리자 로그인
        if (id === 'hwaseon' && pw === 'hwaseon@00') {
            req.session.user = { id: 'admin', role: 'admin' };
            return res.json({ success: true, role: 'admin' });
        }
        // 일반 사용자 로그인
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

// 로그아웃 라우트
app.post('/logout', (req, res) => {
    try {
        req.session.destroy();
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: '로그아웃 중 오류가 발생했습니다.' });
    }
});

// 사용자 정보 조회 라우트
app.get('/me', (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        res.json(req.session.user);
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
    }
});

// 대시보드 데이터 라우트
app.get('/dashboard-data', (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        // 관리자: 전체(소유자 없는 것도), 일반 사용자: 본인만
        if (req.session.user.role === 'admin') {
            return res.json(images);
        } else {
            return res.json(images.filter(img => img.owner === req.session.user.id));
        }
    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({ error: '대시보드 데이터 조회 중 오류가 발생했습니다.' });
    }
});

// 대시보드 페이지 - 인증 필요
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 대시보드 페이지 (기존 경로도 유지)
app.get('/dashboard.html', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 사용자 목록 조회 라우트
app.get('/users', (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: '권한이 없습니다.' });
        }
        res.json(users);
    } catch (error) {
        console.error('Users list error:', error);
        res.status(500).json({ error: '사용자 목록 조회 중 오류가 발생했습니다.' });
    }
});

// 사용자 등록 라우트
app.post('/register', (req, res) => {
    try {
        const { id, pw } = req.body;
        // 필수 필드 검증
        if (!id || !pw) {
            return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
        }
        // 아이디 중복 검사
        if (users.some(user => user.id === id)) {
            return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
        }
        // 새 사용자 추가
        const newUser = {
            id,
            pw, // 비밀번호 저장
            role: 'user',
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        persistUsers();
        res.json({ success: true, user: newUser });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: '사용자 등록 중 오류가 발생했습니다.' });
    }
});

// 사용자 삭제 라우트
app.delete('/users/:id', (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: '권한이 없습니다.' });
        }

        const userId = req.params.id;
        const userIndex = users.findIndex(user => user.id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        // 관리자는 삭제할 수 없음
        if (users[userIndex].role === 'admin') {
            return res.status(403).json({ error: '관리자는 삭제할 수 없습니다.' });
        }

        users.splice(userIndex, 1);
        persistUsers();
        res.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: '사용자 삭제 중 오류가 발생했습니다.' });
    }
});

app.delete('/image/:id', (req, res) => {
    try {
        const id = req.params.id;
        console.log('Deleting image:', id);
        
        const idx = images.findIndex(img => img.id === id);
        if (idx === -1) {
            console.log('Image not found for deletion:', id);
            return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
        }

        // 파일 삭제
        const filePath = path.join('/data', 'uploads', images[idx].filename);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log('Image file deleted:', filePath);
            } catch (err) {
                console.error('Error deleting image file:', err);
            }
        } else {
            console.log('Image file not found:', filePath);
        }

        // 메타데이터 삭제
        images.splice(idx, 1);
        
        // 변경사항 저장
        persistImages();
        console.log('Image metadata deleted and persisted');

        res.json({ success: true });
    } catch (error) {
        console.error('이미지 삭제 오류:', error);
        res.status(500).json({ error: '이미지 삭제 중 오류가 발생했습니다.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Uploads directory: ${uploadsDir}`);
});

// 에러 핸들링 미들웨어 (모든 라우트 정의 이후에 위치)
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
});
