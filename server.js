const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fetch = require('node-fetch');
const ExcelJS = require('exceljs');
const app = express();
const PORT = process.env.PORT || 3000;

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



// 네이버 블로그 본문 URL만 남기는 함수 (글 작성폼, 홈 등은 false)
function isRealBlogPost(url) {
    if (!url) return false;
    // /아이디/숫자 또는 /PostView.naver?blogId=...&logNo=... 형식 모두 허용
    return /^https?:\/\/(?:blog|m\.blog)\.naver\.com\/(?:[^/]+\/\d+|PostView\.naver\?blogId=[^&]+&logNo=\d+)/.test(url);
}

function isNaverBlogReferer(url) {
  if (!url) return false;
  // 네이버 블로그 도메인에서 온 요청
  if (!/^https?:\/\/(blog|m\.blog)\.naver\.com\//.test(url)) return false;
  // 글쓰기/작성폼/홈/관리 등은 제외
  if (
    /PostWriteForm\.naver/.test(url) || // 글쓰기 폼
    /\/home([/?#]|$)/.test(url) ||      // 홈
    /\/section([/?#]|$)/.test(url) ||   // 섹션
    /\/dashboard([/?#]|$)/.test(url)    // 대시보드/관리
  ) return false;
  return true;
}
function isMySiteReferer(url) {
  if (!url) return false;
  return /hwaseon-image\.com|onrender\.com/.test(url);
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

    // 기본 속성 초기화
    img.views ??= 0;
    if (!Array.isArray(img.ips)) img.ips = [];
    if (!Array.isArray(img.referers)) img.referers = [];

    // 네이버 블로그에서만 조회수 및 방문자 기록
    if (isNaverBlogReferer(referer) && !isMySiteReferer(referer)) {
        img.views += 1;
        // 접속로그(IP+UA별 방문수 누적)
        let ipInfo = img.ips.find(x => x.ip === ip && x.ua === ua);
        if (!ipInfo) {
            img.ips.push({
                ip,
                ua,
                count: 1,
                visits: [{ time: now.toISOString() }]
            });
        } else {
            ipInfo.count++;
            if (!Array.isArray(ipInfo.visits)) ipInfo.visits = [];
            ipInfo.visits.push({ time: now.toISOString() });
        }
        // 리퍼러 로그 기록
        const existing = img.referers.find(r => r.referer === referer);
        if (existing) {
            existing.count = (existing.count || 0) + 1;
        } else {
            img.referers.push({
                referer,
                count: 1
            });
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

    res.set('Content-Type', contentType);
    res.sendFile(filePath);
});



// 이미지 상세 정보 반환 라우트
app.get('/image/:id/detail', (req, res) => {
    try {
        const img = images.find(i => i.id === req.params.id);
        if (!img) {
            return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
        }

        // ✅ 조회수: img.views 그대로 사용
        const views = img.views || 0;

        // ✅ 방문 유저 수: ip+ua 조합의 개수
        let unique = img.ips ? img.ips.length : 0;
        if (unique > views) unique = views;

        // ✅ 오늘 방문수 계산
        const todayStr = new Date().toISOString().slice(0, 10);
        let todayVisits = 0;
        if (img.ips) {
            img.ips.forEach(x => {
                if (x.visits) {
                    todayVisits += x.visits.filter(v => v.time.slice(0, 10) === todayStr).length;
                }
            });
        }

        // ✅ 가장 많이 불러간 블로그 referer (없으면 첫 번째)
        let blogUrl = null, blogCreated = null;
        if (img.referers && img.referers.length > 0) {
            const sorted = img.referers.slice().sort((a, b) =>
                b.count - a.count
            );
            blogUrl = sorted[0].referer;
            blogCreated = sorted[0].createdAt;
        }

        // ✅ IP + UA + 방문수 정리
        const ips = (img.ips || []).map(x => ({
            ip: x.ip,
            ua: x.ua,
            count: x.count
        }));

        res.json({
            id: img.id,
            filename: img.filename,
            blogUrl,
            blogCreated,
            views,         // ✅ 서버 내 카운트된 조회수 기준
            todayVisits,   // 오늘 총 방문 수
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

// 대시보드 데이터 엑셀 다운로드
app.get('/dashboard-excel', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const filteredImages = req.session.user.role === 'admin'
            ? images
            : images.filter(img => img.owner === req.session.user.id);

        // 워크북/시트 생성
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Dashboard');

        // 헤더 추가
        worksheet.addRow(['이미지 링크', '블로그 URL', '메모', '총 방문수']);

        // 데이터 추가
        filteredImages.forEach(img => {
            const blogUrl = img.referers && img.referers.length > 0
                ? img.referers.sort((a, b) => b.count - a.count)[0].referer
                : '';
            worksheet.addRow([
                `https://hwaseon-image.com/image/${img.id}`,
                blogUrl,
                img.memo || '',
                img.views || 0
            ]);
        });

        // 응답 헤더
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=dashboard_data.xlsx');

        // 파일 스트림으로 전송
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel download error:', error);
        res.status(500).json({ error: '엑셀 다운로드 중 오류가 발생했습니다.' });
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
