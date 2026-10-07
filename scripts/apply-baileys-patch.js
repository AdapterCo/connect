// Restore the previously working compatibility patch (commit 7fef371).
// Apply during every clean install/build, without additional npm dependencies.
const fs = require('node:fs');
const path = require('node:path');
const ALLOWED = ['lib/Utils/decode-wa-message.js', 'lib/Socket/messages-recv.js'];

function applyHunks(source, diff) {
  let result = source.replace(/\r\n/g, '\n');
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  let hunks = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('@@ ')) continue;
    hunks++;
    const before = [], after = [];
    for (i++; i < lines.length && !lines[i].startsWith('@@ ') && !lines[i].startsWith('diff --git '); i++) {
      const line = lines[i];
      if (line.startsWith(' ') || line.startsWith('-')) before.push(line.slice(1));
      if (line.startsWith(' ') || line.startsWith('+')) after.push(line.slice(1));
    }
    i--;
    const oldText = before.join('\n'), newText = after.join('\n');
    const at = result.indexOf(oldText);
    if (!oldText || !newText) throw new Error('Invalid Baileys patch hunk.');
    if (at !== -1) {
      if (at !== result.lastIndexOf(oldText)) throw new Error('Ambiguous Baileys patch context.');
      result = result.slice(0, at) + newText + result.slice(at + oldText.length);
    } else if (!result.includes(newText)) {
      throw new Error('Baileys source differs from the validated patch. Installation aborted.');
    }
  }
  if (!hunks) throw new Error('Baileys patch contains no changes.');
  return source.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result;
}

function install() {
  const lib = path.dirname(require.resolve('@whiskeysockets/baileys'));
  const root = path.resolve(lib, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== '6.7.23') throw new Error(`Baileys ${pkg.version}: review the patch before changing the validated version 6.7.23.`);
  const patch = fs.readFileSync(path.join(__dirname, '../patches/@whiskeysockets+baileys+6.7.23.patch'), 'utf8');
  const updates = [];
  for (const section of patch.split(/(?=^diff --git )/m).filter(value => value.startsWith('diff --git '))) {
    const target = /^\+\+\+ b\/node_modules\/@whiskeysockets\/baileys\/(.+)$/m.exec(section)?.[1];
    if (!ALLOWED.includes(target)) throw new Error('Unexpected Baileys patch target.');
    const file = path.join(root, target), original = fs.readFileSync(file, 'utf8');
    updates.push({ file, original, patched: applyHunks(original, section) });
  }
  if (updates.length !== ALLOWED.length || new Set(updates.map(update => update.file)).size !== ALLOWED.length) throw new Error('Incomplete Baileys patch.');
  // Validate both files before writing either of them.
  for (const update of updates) if (update.patched !== update.original) fs.writeFileSync(update.file, update.patched);
  console.log('[Baileys] Historical LID/PN decrypt and self-message retry patch applied (6.7.23).');
}

if (require.main === module) {
  try { install(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { applyHunks };
