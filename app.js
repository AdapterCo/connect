const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { UPLOAD_DIR } = require('./src/config/index');
const authenticateToken = require('./src/middleware/authMiddleware');
const { generalLimiter, authLimiter, apiLimiter, uploadLimiter } = require('./src/middleware/rateLimitMiddleware');


const authRoutes = require('./src/routes/authRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const instanceRoutes = require('./src/routes/instanceRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const userRoutes = require('./src/routes/userRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const scheduleRoutes = require('./src/routes/scheduleRoutes');
const superadminRoutes = require('./src/routes/superadminRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const billingRoutes = require('./src/routes/billingRoutes');
const passwordResetRoutes = require('./src/routes/passwordResetRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const catalogRoutes = require('./src/routes/catalogRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const printerRoutes = require('./src/routes/printerRoutes');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [`https://${process.env.DOMAIN || 'connect.adapterco.com.br'}`]
    : '*',
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));


app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/register-tenant', authLimiter);

app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIMETYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `upload_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido.'));
    }
  }
});

app.post('/api/upload', authenticateToken, uploadLimiter, upload.single('file'), (req, res) => {
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

app.use('/api/auth', authRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/api/chats', apiLimiter, chatRoutes);
app.use('/api/chats', apiLimiter, scheduleRoutes);
app.use('/api/instances', apiLimiter, instanceRoutes);
app.use('/api/settings', apiLimiter, settingsRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api', paymentRoutes);
app.use('/api', reportRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/billing', apiLimiter, billingRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/orders', apiLimiter, orderRoutes);
app.use('/api/printers', apiLimiter, printerRoutes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Máximo 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
