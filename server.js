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
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    img.views++;
    const now = getKSTString();
    let ipInfo = img.ips.find(x => x.ip === ip);
    if (!ipInfo) {
      img.ips.push({ ip, count: 1, firstVisit: now, lastVisit: now });
    } else {
      ipInfo.count++;
      ipInfo.lastVisit = now;
    }
    // Referer 트래킹
    const referer = req.headers['referer'] || '';
    if (referer) {
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