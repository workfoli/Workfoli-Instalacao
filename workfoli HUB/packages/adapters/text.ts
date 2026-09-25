import iconv from 'iconv-lite';

/** Decode preserved text without evaluating imported content. */
export function decodeText(bytes: Buffer): string | undefined {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return iconv.decode(bytes.subarray(2), 'utf16-le');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return iconv.decode(bytes.subarray(2), 'utf16-be');
  if (bytes.includes(0)) return undefined;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return iconv.decode(bytes, 'windows-1252'); }
}
