#!/usr/bin/env node
// Valida o manifesto desta Base (workfoli.base.json) com o contrato Workfoli. Sem dependências.
// Uso: npm run validar   (ou: node scripts/validar.mjs)
// A validação completa (credenciais em arquivos, .gitignore, lock do template) existia
// nas ferramentas arquivadas; este validador funciona de forma independente.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_MANIFEST_FILE, formatIssues, validateBaseManifest } from './workfoli-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, BASE_MANIFEST_FILE);

if (!existsSync(file)) {
  console.error(`✗ ${BASE_MANIFEST_FILE} não encontrado na raiz da Base.`);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
} catch {
  console.error(`✗ ${BASE_MANIFEST_FILE} não é um JSON válido.`);
  process.exit(2);
}

const result = validateBaseManifest(data);
if (!result.ok) {
  console.error(`✗ Manifesto inválido:\n${formatIssues(result.errors)}`);
  process.exit(2);
}

const manifest = result.value;
const missing = [
  manifest.context.memory, manifest.context.identity, manifest.context.tasks, manifest.identity.guide, manifest.identity.logo, manifest.identity.symbol,
  ...manifest.context.knowledge, ...manifest.services.map(item => item.path), ...manifest.projects.map(item => item.path), ...manifest.assets.map(item => item.path),
].filter(value => value && !existsSync(path.join(root, ...value.split('/'))));

for (const warning of result.warnings) console.warn(`! ${warning.path}: ${warning.message}`);
for (const value of [...new Set(missing)]) console.warn(`! caminho declarado não existe: ${value}`);

if (manifest.status === 'template') {
  console.log('✓ Template da Base válido. Para criar a Base de uma empresa: copie o modelo para uma pasta vazia e rode /instalar ou $instalar.');
} else {
  console.log(`✓ Base válida: ${manifest.company.name} — ${manifest.services.length} serviço(s), ${manifest.projects.length} projeto(s), ${manifest.integrations.length} integração(ões).`);
}
