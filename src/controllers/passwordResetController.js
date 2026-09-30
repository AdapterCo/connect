const { prisma } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { passwordError } = require('../middleware/validationMiddleware');
const { disconnectUser } = require('../config/socket');

const mailService = require('../services/mailService');

const TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_REQUESTED_MESSAGE = 'Se a conta existir e tiver e-mail cadastrado, enviaremos um link de recuperação.';

// Apenas o hash do token fica no banco: um vazamento da tabela nao permite
// redefinir senhas. O token original so existe no link entregue ao usuario.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isTokenFormat(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

async function requestPasswordReset(req, res) {
  try {
    // Aceita o nome de usuario ou o e-mail cadastrado.
    const identifier = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase()
      : typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!identifier || identifier.length > 254) {
      return res.status(400).json({ error: 'Informe o usuário ou e-mail.' });
    }

    const user = await prisma.user.findFirst({
      where: identifier.includes('@') ? { email: identifier } : { username: identifier }
    });

    // Resposta identica em todos os casos: nao revela se a conta existe nem se
    // tem e-mail cadastrado.
    if (!user || !user.email) {
      return res.json({ success: true, message: RESET_REQUESTED_MESSAGE });
    }

    await prisma.passwordResetToken.deleteMany({
      where: { user_id: user.id, used: false }
    });

    const token = crypto.randomBytes(32).toString('hex');

    await prisma.passwordResetToken.create({
      data: {
        user_id: user.id,
        token: hashToken(token),
        expires_at: new Date(Date.now() + TOKEN_TTL_MS)
      }
    });

    // Envio em segundo plano: o tempo de resposta nao depende do SMTP.
    mailService.sendPasswordReset({ to: user.email, name: user.name, token })
      .catch(error => console.error('[Mail] Falha ao enviar recuperacao de senha:', error.code || error.name));

    res.json({ success: true, message: RESET_REQUESTED_MESSAGE });
  } catch (error) {
    console.error('Erro ao solicitar reset de senha:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
}

async function validateResetToken(req, res) {
  try {
    const { token } = req.params;

    if (!isTokenFormat(token)) {
      return res.json({ valid: false, error: 'Token inválido ou já utilizado.' });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: hashToken(token) },
      include: { user: { select: { name: true, username: true } } }
    });

    if (!resetToken || resetToken.used) {
      return res.json({ valid: false, error: 'Token inválido ou já utilizado.' });
    }

    if (new Date() > resetToken.expires_at) {
      return res.json({ valid: false, error: 'Token expirado.' });
    }

    res.json({
      valid: true,
      user: resetToken.user
    });
  } catch (error) {
    console.error('Erro ao validar token:', error);
    res.status(500).json({ error: 'Erro ao validar token.' });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    }

    const invalidPassword = passwordError(newPassword);
    if (invalidPassword) {
      return res.status(400).json({ error: invalidPassword });
    }

    if (!isTokenFormat(token)) {
      return res.status(400).json({ error: 'Token inválido ou já utilizado.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const tokenHash = hashToken(token);
    let userId = null;

    const outcome = await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({ where: { token: tokenHash } });
      if (!resetToken || resetToken.used) return 'invalid';
      if (new Date() > resetToken.expires_at) return 'expired';

      // Marca como usado de forma condicional: duas requisicoes simultaneas com o
      // mesmo token nao conseguem redefinir a senha duas vezes.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, used: false },
        data: { used: true }
      });
      if (!claimed.count) return 'invalid';

      await tx.user.update({
        where: { id: resetToken.user_id },
        data: { password: hashedPassword, session_version: { increment: 1 }, status: 'offline' }
      });
      userId = resetToken.user_id;
      return 'ok';
    });

    if (outcome === 'expired') {
      return res.status(400).json({ error: 'Token expirado. Solicite um novo link de recuperação.' });
    }
    if (outcome !== 'ok') {
      return res.status(400).json({ error: 'Token inválido ou já utilizado.' });
    }

    // Sessoes antigas foram invalidadas; encerra tambem as conexoes em tempo real.
    disconnectUser(userId);
    res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Erro ao resetar senha:', error);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
}

module.exports = {
  requestPasswordReset,
  validateResetToken,
  resetPassword
};
