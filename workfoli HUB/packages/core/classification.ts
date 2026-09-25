import type { Category } from '../contracts/index.js';
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const excludedCategories = new Set<Category>(['dependencies', 'history', 'build', 'system']);
export function categoryFor(filePath: string): Category {
  const p = normalize(filePath);
  const segments = p.split('/');
  if (segments.includes('node_modules') || segments.includes('.venv') || segments.includes('vendor')) return 'dependencies';
  if (segments.includes('.git')) return 'history';
  if (segments.some(s => ['dist', 'build', '.next', 'coverage'].includes(s))) return 'build';
  if (segments.some(s => ['__macosx', '.cache', '__pycache__'].includes(s)) || /(?:^|\/)(?:\.ds_store|thumbs\.db|desktop\.ini)$/.test(p)) return 'system';
  if (segments.some(s => ['.agents', '.claude', '.codex', '.vscode', '.idea', 'skills'].includes(s)) || /(?:^|\/)(?:(?:claude|agents|skill)\.md|\.mcp\.json)$/.test(p)) return 'legacy';
  if (segments.includes('core') && segments.includes('leanai')) return 'legacy';
  if (segments.some(s => ['identidade', 'identity', 'branding', 'marca'].includes(s)) || /(?:brand|design)[-_ ]?guide|(?:^|\/)marca\.md$/.test(p)) return 'identity';
  if (segments.includes('marketing')) return 'marketing';
  if (segments.some(s => ['saidas', 'conteudo', 'content', 'outputs'].includes(s))) return 'content';
  if (segments.some(s => ['dados', 'data'].includes(s)) || /\.(?:csv|xlsx?|ods|sqlite|db)$/.test(p)) return 'data';
  if (segments.some(s => ['landing-page', 'website', 'site', 'www'].includes(s))) return 'site';
  if (/\.(?:png|jpe?g|gif|webp|svg|avif|ico|mp4|mov|mp3|wav|woff2?|ttf|otf)$/.test(p)) return 'media';
  if (/\.(?:md|txt|pdf|docx?|odt|pptx?)$/.test(p)) return 'documentation';
  if (/\.(?:[cm]?js|tsx?|py|sh|ps1|bat|cmd|html?|css|scss|json|ya?ml|toml|xml|go|rs|java|sql)$/.test(p)) return 'code';
  return 'other';
}

export function restrictedPath(filePath: string): boolean {
  const p = normalize(filePath);
  return /(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|id_(?:rsa|ed25519)|credentials?(?:[._/-]|$)|secrets?(?:[._/-]|$)|tokens?(?:[._/-]|$)|cookies?(?:[._/-]|$)|sessions?(?:[._/-]|$)|auth(?:[._-]|$))/.test(p)
    || /\.(?:pem|p12|pfx|key|kdbx)$/.test(p)
    || /(?:nao[-_ ]?public|do[-_ ]?not[-_ ]?publish|confidenc|confidential|prontuario|pacientes?|patient|documentos?[-_ ]?clinicos?)/.test(p);
}

export function sensitiveText(text: string): boolean {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/.test(text)) return true;
  if (/\bBearer\s+[A-Za-z0-9_.-]{24,}/i.test(text)) return true;
  const assignments = text.matchAll(/\b[A-Za-z0-9_]*(?:api[_-]?key|access[_-]?token|secret|password|senha|client[_-]?secret)\b["'\s]*[:=]\s*["']?([^\s"',;<>]{6,})/gi);
  for (const [, value] of assignments) {
    if (!/^(?:example|exemplo|placeholder|changeme|your_|sua_|seu_|xxx|\*+|\$|\{|process\.|import\.|env\.|undefined|null|false|true)/i.test(value)) return true;
  }
  return /\b(?:na[oã]o publicar|do not publish|uso confidencial|confidential material|prontu[aá]rio|dados (?:cl[ií]nicos|de pacientes))\b/i.test(text);
}

