// Gera resources/icon.ico a partir de resources/icon.png (símbolo oficial da Workfoli, 256 px).
// ICO com PNG embutido (suportado pelo Windows Vista+ e pelo electron-builder).
import * as fs from 'node:fs/promises';
const png = await fs.readFile('resources/icon.png');
if (png.readUInt32BE(16) !== 256 || png.readUInt32BE(20) !== 256) throw new Error('resources/icon.png precisa ter 256x256.');
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(0, 6); header.writeUInt8(0, 7);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await fs.writeFile('resources/icon.ico', Buffer.concat([header, png]));
console.log('resources/icon.ico gerado.');
