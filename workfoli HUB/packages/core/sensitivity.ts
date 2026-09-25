import { looksLikeSecret } from '../contract/workfoli-contract.mjs';

/**
 * Sinais de conteúdo que não pode circular como contexto comum.
 * - credentials: chaves, tokens, senhas atribuídas (sempre bloqueia).
 * - personalRecords: registros pessoais/clínicos concretos (CPF, "Paciente:", CID, nascimento).
 * Mencionar uma palavra ("não guardar prontuários aqui") não é um registro; um número de CPF é.
 * Heurística conservadora: não certifica ausência de dados sensíveis.
 */
export interface Sensitivity { credentials: boolean; personalRecords: boolean; }

const CREDENTIAL = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9_.-]{24,}/i,
  /\b[A-Za-z0-9_]*(?:api[_-]?key|access[_-]?token|client[_-]?secret|secret[_-]?key|password|senha)\b["'\s]*[:=]\s*["']?(?!(?:example|exemplo|placeholder|changeme|your_|sua_|seu_|xxx|\*+|\$|\{|process\.|import\.|env\.|undefined|null|false|true|<)[^\s"']*)[^\s"',;<>]{8,}/i,
];

const PERSONAL = [
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, // CPF formatado
  /\b(?:cpf|rg)\s*[:nº#]*\s*\d[\d.\-/]{7,}/i,
  /\bpaciente\s*:\s*\S/i,
  /\b(?:data de nascimento|nascimento|dn)\s*:\s*\d{1,2}\/\d{1,2}\/\d{2,4}/i,
  /\bCID(?:-10)?\s*[:-]?\s*[A-TV-Z]\d{2}(?:\.\d)?\b/,
  /\bprontu[aá]rio\s*(?:n[ºo°.]?|#|:)\s*\d/i,
];

export function detectSensitivity(text: string): Sensitivity {
  const sample = text.length > 1_048_576 ? text.slice(0, 1_048_576) : text;
  return {
    credentials: looksLikeSecret(sample) || CREDENTIAL.some(pattern => pattern.test(sample)),
    personalRecords: PERSONAL.some(pattern => pattern.test(sample)),
  };
}

/** Nomes de arquivo que indicam segredo ou material reservado, independentemente do conteúdo. */
export function restrictedName(relativePath: string): boolean {
  const p = relativePath.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return /(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|id_(?:rsa|ed25519|ecdsa)|credentials?(?:[._/-]|$)|secrets?(?:[._/-]|$)|cookies?(?:[._/-]|$))/.test(p)
    || /\.(?:pem|p12|pfx|key|kdbx|keystore)$/.test(p)
    || /(?:nao[-_ ]?publicar|do[-_ ]?not[-_ ]?publish|confidencial|confidential|prontuarios?(?:[._/-]|$)|pacientes?(?:[._/-]|$)|patients?(?:[._/-]|$))/.test(p);
}
