const nodemailer = require('nodemailer');

// SMTP da plataforma, configurado por variaveis de ambiente (ver .env.example).
let transport = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getTransport() {
  if (transport) return transport;
  if (!isConfigured()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 usa TLS direto; nas demais portas o STARTTLS e obrigatorio.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    requireTLS: port !== 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    // O conteudo e sempre texto gerado pelo servidor: nada de arquivos ou URLs.
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
  return transport;
}

// Endereco publico do painel usado nos links enviados por e-mail.
function appUrl() {
  const base = process.env.APP_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'http://localhost:5173');
  return base.replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function sendPasswordReset({ to, name, token }) {
  const mailer = getTransport();
  if (!mailer) {
    console.warn('[Mail] SMTP nao configurado: e-mail de recuperacao de senha nao enviado.');
    return false;
  }

  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const greeting = name ? `Olá, ${name}!` : 'Olá!';

  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Redefinição de senha - Adapter Connect',
    text: `${greeting}\n\nRecebemos um pedido para redefinir a sua senha. Acesse o link abaixo (válido por 1 hora):\n\n${link}\n\nSe você não fez este pedido, ignore este e-mail: sua senha continua a mesma.`,
    html: `<p>${escapeHtml(greeting)}</p>
<p>Recebemos um pedido para redefinir a sua senha. O link é válido por <strong>1 hora</strong>:</p>
<p><a href="${escapeHtml(link)}">Redefinir minha senha</a></p>
<p style="color:#666">Se você não fez este pedido, ignore este e-mail: sua senha continua a mesma.</p>`
  });
  return true;
}

// Permite aos testes capturar os e-mails sem um servidor SMTP.
function setTransportForTests(testTransport) {
  transport = testTransport;
}

module.exports = { isConfigured, sendPasswordReset, setTransportForTests, appUrl };
