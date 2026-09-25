const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, '.claude', 'skills');
const target = path.join(root, '.agents', 'skills');

function listDirectories(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const sourceNames = listDirectories(source)
  .filter((name) => fs.existsSync(path.join(source, name, 'SKILL.md')));

// Sem skills na origem, não tocar no destino: evita apagar as skills do Codex por engano.
if (sourceNames.length === 0) {
  console.error(`Nenhuma skill encontrada em ${path.relative(root, source)}. Nada foi alterado.`);
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });

for (const name of listDirectories(target)) {
  if (!sourceNames.includes(name)) {
    fs.rmSync(path.join(target, name), { recursive: true, force: true });
  }
}

// Recria cada skill do zero, para que arquivos removidos na origem também saiam do destino.
for (const name of sourceNames) {
  const destination = path.join(target, name);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(path.join(source, name), destination, { recursive: true });
}

console.log(`Skills sincronizadas: ${sourceNames.length}`);
console.log(`Origem: ${path.relative(root, source)}`);
console.log(`Destino: ${path.relative(root, target)}`);
