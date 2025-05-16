const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage });

let images = []; // {id, filename, memo, views, ips: [{ip, count, firstVisit, lastVisit}], referers: [{referer, count, firstVisit, lastVisit}]}

function getKSTString() {
  const now = new Date();
  return now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\./g, '-').replace(' 오전', '').replace(' 오후', '').replace(/\s+/g, ' ').trim();
}

// uploads 폴더가 없으면 생성 (Render 등 클라우드 환경 대비)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.post('/upload', upload.single('image'), (req, res) => {
  const id = Date.now().toString();
  const { memo } = req.body;
  const filename = req.file.filename;
  images.push({ id, filename, memo, views: 0, ips: [], referers: [] });
  const imageUrl = `${req.protocol}://${req.get('host')}/image/${id}`;
  res.json({ url: imageUrl, memo });
});

app.get('/image/:id', (req, res) => {
  const img = images.find(i => i.id === req.params.id);
  if (!img) return res.status(404).send('Not found');
  const isDashboard = req.query.dashboard === '1';
  if (!isDashboard) {
    // 실제 클라이언트 IP만 저장
    const ipRaw = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ip = Array.isArray(ipRaw) ? ipRaw[0] : (ipRaw || '').split(',')[0].trim();
    img.views++;
    const now = getKSTString();
    let ipInfo = img.ips.find(x => x.ip === ip);
    if (!ipInfo) {
      img.ips.push({ ip, count: 1, firstVisit: now, lastVisit: now });
    } else {
      ipInfo.count++;
      ipInfo.lastVisit = now;
    }
    // 블로그 글 주소만 기록 (대시보드/이미지/내부 접근 등은 제외)
    const referer = req.headers['referer'] || '';
    if (
      referer &&
      !referer.includes('/dashboard') &&
      !referer.includes('/image/') &&
      !referer.includes('onrender.com')
    ) {
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
  res.sendFile(path.join(__dirname, 'uploads', img.filename));
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
  fs.unlink(path.join(__dirname, 'uploads', filename), () => {});
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 