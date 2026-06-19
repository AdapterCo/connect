const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function firstExisting(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate));
}

function npmCliPath() {
  const execDir = path.dirname(process.execPath);
  return firstExisting([
    process.env.npm_execpath,
    path.join(execDir, 'node_modules/npm/bin/npm-cli.js'),
    '/usr/local/lib/node_modules/npm/bin/npm-cli.js',
    '/usr/lib/node_modules/npm/bin/npm-cli.js'
  ]);
}

const npmCli = npmCliPath();
const prismaCli = path.join(__dirname, '../node_modules/prisma/build/index.js');

if (!npmCli) {
  console.error('npm CLI nao encontrado para executar checks DevSecOps.');
  process.exit(1);
}

if (!fs.existsSync(prismaCli)) {
  console.error('Prisma CLI local nao encontrado. Execute npm install antes.');
  process.exit(1);
}

const commands = [
  [process.execPath, [npmCli, 'run', 'check:all-js']],
  [process.execPath, [prismaCli, 'validate']],
  [process.execPath, [npmCli, 'run', 'security:smoke']],
  [process.execPath, [npmCli, 'run', 'secret:scan']],
  [process.execPath, [npmCli, 'audit', '--audit-level=high']]
];

for (const [command, args] of commands) {
  console.log(`\n> ${path.basename(command)} ${args.map((arg) => path.basename(arg) === arg ? arg : arg).join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\nDevSecOps local checks passed.');
