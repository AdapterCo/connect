const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { UPLOAD_DIR } = require('./src/config/index');
const authenticateToken = require('./src/middleware/authMiddleware');
const { generalLimiter, authLimiter, apiLimiter, uploadLimiter } = require('./src/middleware/rateLimitMiddleware');
const { requestId, noStoreApi, requireJsonContentType } = require('./src/middleware/securityMiddleware');


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

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "connect-src": ["'self'", "wss:", "https:"],
      "font-src": ["'self'", "data:"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "media-src": ["'self'", "blob:"],
      "object-src": ["'none'"],
      "script-src": ["'self'", "https://cdn.jsdelivr.net"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "upgrade-insecure-requests": []
    }
  },
  crossOriginEmbedderPolicy: false
}));

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [`https://${process.env.DOMAIN || 'connect.adapterco.com.br'}`]
    : '*',
  credentials: true
};

app.use(cors(corsOptions));
app.use(requestId);
app.use(noStoreApi);
app.use(requireJsonContentType);
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if (req.originalUrl && req.originalUrl.includes('/webhook/')) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));


app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/register-tenant', authLimiter);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use('/uploads', express.static(UPLOAD_DIR, {
  dotfiles: 'deny',
  fallthrough: false,
  immutable: true,
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; sandbox");
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

const ALLOWED_MIMETYPES = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['video/mp4', ['.mp4']],
  ['video/quicktime', ['.mov']],
  ['audio/mpeg', ['.mp3']],
  ['audio/ogg', ['.ogg']],
  ['audio/mp4', ['.m4a', '.mp4']],
  ['audio/wav', ['.wav']],
  ['application/pdf', ['.pdf']],
  ['application/msword', ['.doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/vnd.ms-excel', ['.xls']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']],
  ['text/plain', ['.txt']]
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const allowedExtensions = ALLOWED_MIMETYPES.get(file.mimetype) || [];
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    const ext = allowedExtensions.includes(originalExt) ? originalExt : allowedExtensions[0];
    const uniqueName = `upload_${Date.now()}_${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ALLOWED_MIMETYPES.get(file.mimetype);
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions || !allowedExtensions.includes(originalExt)) {
      cb(new Error('Tipo de arquivo não permitido.'));
    } else {
      cb(null, true);
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
    filename: path.basename(req.file.originalname),
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
    console.error('[Error Handler]', err);
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
