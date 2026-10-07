# Versão do WhatsApp

Conforme solicitado pelo usuário, usar Baileys 7. A versão publicada e fixada
no package.json e no package-lock.json é `7.0.0-rc14`.

Não retornar à série 6.7.x nem reaplicar patches específicos dessa série.
O build Docker instala a versão fixada por meio de `npm ci`.

Preservar `src/services/aiService.js`: as alterações da integração WhatsApp
não devem modificar o script de atendimento personalizado.
