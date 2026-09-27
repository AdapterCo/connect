const express = require('express');

const cors = require('cors');

const multer = require('multer');

const path = require('path');

const fs = require('fs');



const { UPLOAD_DIR } = require('./src/config/index');

const authenticateToken = require('./src/middleware/authMiddleware');



const authRoutes = require('./src/routes/authRoutes');

const chatRoutes = require('./src/routes/chatRoutes');

const instanceRoutes = require('./src/routes/instanceRoutes');

const settingsRoutes = require('./src/routes/settingsRoutes');

const userRoutes = require('./src/routes/userRoutes');

const productRoutes = require('./src/routes/productRoutes');

const reportRoutes = require('./src/routes/reportRoutes');

const scheduleRoutes = require('./src/routes/scheduleRoutes');



const app = express();



app.disable('x-powered-by');
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('X-Frame-Options', 'DENY'); next(); });

app.use(express.json());

// Authenticate attachments before the public static middleware can serve them.
app.use('/uploads', (req, res, next) => {
  const tokenCookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('crm_media='));
  if (!req.headers.authorization && tokenCookie) req.headers.authorization = 'Bearer ' + tokenCookie.slice('crm_media='.length);
  next();
}, authenticateToken, async (req, res, next) => {
  try {
    const { canAccessMedia } = require('./src/utils/media');
    if (!await canAccessMedia(req.user, '/uploads' + req.path)) return res.status(404).end();
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch { res.status(404).end(); }
}, express.static(UPLOAD_DIR), (req, res) => res.status(404).end());
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));



if (!fs.existsSync(UPLOAD_DIR)) {

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

}



const storage = multer.diskStorage({

  destination: (req, file, cb) => {

    cb(null, UPLOAD_DIR);

  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname).toLowerCase();

    const uniqueName = `${require('./src/utils/media').ownerPrefix(req.user)}_${require('crypto').randomUUID()}${ext}`;

    cb(null, uniqueName);

  }

});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mp3|ogg|wav|pdf|txt)$/i.test(file.originalname);
  cb(allowed ? null : new Error('Tipo de arquivo nao permitido.'), allowed);
} });



app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {

  if (!req.file) {

    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

  }

  const relativeUrl = `/uploads/${req.file.filename}`;

  res.json({

    success: true,

    url: relativeUrl,

    mimetype: req.file.mimetype,

    filename: req.file.originalname,

    size: req.file.size

  });

});



app.use((err, req, res, next) => { if (err) return res.status(400).json({ error: 'Upload invalido. Limite: 20 MB; imagens, audio, video, PDF ou TXT.' }); next(); });

app.use('/api/auth', authRoutes);

app.use('/api/chats', chatRoutes);

app.use('/api/chats', scheduleRoutes);

app.use('/api/instances', instanceRoutes);

app.use('/api/settings', settingsRoutes);

app.use('/api/users', userRoutes);

app.use('/api/products', productRoutes);

app.use('/api', reportRoutes);



app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }));



app.get('*', (req, res) => {

  res.sendFile(path.join(__dirname, 'public', 'index.html'));

});



module.exports = app;
