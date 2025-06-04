const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const DATA_DIR = '/data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const IMAGES_JSON = path.join(DATA_DIR, 'images.json');

// uploads 폴더가 없으면 생성 (프로젝트 내 상대경로)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
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

app.post('/upload', upload.single('image'), (req, res) => {
  const id = Date.now().toString();
  const { memo } = req.body;
  const filename = req.file.filename;
  const ext = path.extname(filename);
  images.push({ id, filename, memo, views: 0, ips: [], referers: [] });
  saveImages();
  const imageUrl = `${req.protocol}://${req.get('host')}/image/${id}${ext}`;
  res.json({ url: imageUrl, memo });
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

app.get('/dashboard-data', (req, res) => {
  res.json(images.map(i => ({
    url: `/image/${i.id}`,
    memo: i.memo,
    views: i.views,
    ips: i.ips,
    referers: i.referers,
    unique: i.ips.length,
    filename: i.filename
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