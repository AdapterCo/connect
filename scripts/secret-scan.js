/**
 * scripts/secret-scan.js
 * [M1] Verificacao local de segredos hardcoded no codigo-fonte
 *
 * Detecta padroes suspeitos de secrets, API keys e tokens hardcoded.
 * Nao substitui ferramentas como gitleaks ou trufflehog, mas serve como
 * verificacao rapida antes de um commit.
 *
 * Uso:
 *   node scripts/secret-scan.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCAN_DIRS = ['src', 'scripts', 'app.js', 'server.js'];
const IGNORE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', 'auth_info_baileys',
  'secret-scan.js', 'security-smoke-test.js'
];

// Padroes de secrets (regex, descricao, severidade)
const SECRET_PATTERNS = [
  // Apenas atribuicoes literais: key = 'valor', nao strings de log/mensagem
  { re: /(?:^|[\s,({])(?:password|secret|apikey|api_key)\s*=\s*['"][^'"]{8,}['"]/gmi, desc: 'Possivel credencial hardcoded (atribuicao)', sev: 'HIGH' },
  { re: /sk-[a-zA-Z0-9]{20,}/g, desc: 'OpenAI API Key', sev: 'CRITICAL' },
  { re: /AIza[0-9A-Za-z\-_]{35}/g, desc: 'Google API Key', sev: 'CRITICAL' },
  { re: /APP_USR-[0-9a-f\-]{30,}/g, desc: 'Mercado Pago Access Token', sev: 'CRITICAL' },
  { re: /(?:TEST|APP)_USR-[0-9a-zA-Z\-]{20,}/g, desc: 'Mercado Pago Token', sev: 'HIGH' },
  { re: /xai-[a-zA-Z0-9]{20,}/g, desc: 'xAI Grok API Key', sev: 'CRITICAL' },
  { re: /ghp_[a-zA-Z0-9]{36}/g, desc: 'GitHub Personal Access Token', sev: 'CRITICAL' },
  { re: /change-this-secret/gi, desc: 'Placeholder de secret nao alterado', sev: 'HIGH' },
  { re: /your-secret-here/gi, desc: 'Placeholder de secret nao alterado', sev: 'HIGH' },
  { re: /(?:JWT_SECRET|ENCRYPTION_KEY)\s*=\s*['"][^'"]{1,15}['"]/gi, desc: 'JWT/Encryption key muito curta', sev: 'HIGH' },
];

const IGNORE_EXTENSIONS = ['.md', '.json', '.lock', '.log', '.png', '.jpg', '.svg', '.ico', '.woff', '.ttf'];

let findings = 0;
let scanned = 0;

function shouldIgnore(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return IGNORE_PATTERNS.some(p => normalized.includes(p));
}

function scanFile(filePath) {
  if (shouldIgnore(filePath)) return;
  const ext = path.extname(filePath);
  if (IGNORE_EXTENSIONS.includes(ext)) return;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch { return; }

  scanned++;
  const lines = content.split('\n');

  for (const { re, desc, sev } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNum - 1]?.trim() || '';
      // Ignorar linhas que sao claramente exemplos ou comentarios
      if (line.startsWith('//') || line.startsWith('#') || line.startsWith('*') || line.includes('example') || line.includes('placeholder')) continue;
      console.log(`[${sev}] ${path.relative(process.cwd(), filePath)}:${lineNum}`);
      console.log(`       Padrao: ${desc}`);
      console.log(`       Linha:  ${line.substring(0, 120)}\n`);
      findings++;
    }
  }
}

function scanPath(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    scanFile(target);
  } else if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      const full = path.join(target, entry);
      if (shouldIgnore(full)) continue;
      const s = fs.statSync(full);
      if (s.isDirectory()) {
        scanPath(full);
      } else {
        scanFile(full);
      }
    }
  }
}

console.log('\n[Secret Scan] Verificando segredos hardcoded...\n');
for (const d of SCAN_DIRS) {
  scanPath(path.resolve(d));
}

console.log(`\nArquivos escaneados: ${scanned}`);
if (findings === 0) {
  console.log('Nenhum segredo hardcoded detectado.\n');
  process.exit(0);
} else {
  console.log(`ATENCAO: ${findings} ocorrencia(s) suspeita(s) encontrada(s). Revise antes de fazer commit.\n`);
  process.exit(1);
}
