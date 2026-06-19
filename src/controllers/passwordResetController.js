const { prisma } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function requestPasswordReset(req, res) {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Usuário é obrigatório.' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() }
    });

    if (!user) {
      return res.json({ success: true, message: 'Se o usuário existir, um link de recuperação será gerado.' });
    }

    await prisma.passwordResetToken.deleteMany({
      where: { user_id: user.id, used: false }
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        user_id: user.id,
        token,
        expires_at: expiresAt
      }
    });

    res.json({
      success: true,
      message: 'Se o usuário existir, instruções de recuperação serão enviadas.'
    });
  } catch (error) {
    console.error('Erro ao solicitar reset de senha:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
}

async function validateResetToken(req, res) {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token é obrigatório.' });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
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

    if (newPassword.length < 10) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 10 caracteres.' });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'Senha muito longa.' });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token }
    });

    if (!resetToken || resetToken.used) {
      return res.status(400).json({ error: 'Token inválido ou já utilizado.' });
    }

    if (new Date() > resetToken.expires_at) {
      return res.status(400).json({ error: 'Token expirado. Solicite um novo link de recuperação.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.user_id },
        data: { password: hashedPassword, session_version: { increment: 1 }, status: 'offline' }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      })
    ]);

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
