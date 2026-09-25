import type { Finding } from '../instance/doctor.js';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, text: string) => useColor ? `\u001b[${code}m${text}\u001b[0m` : text;

export const out = {
  title: (text: string) => console.log(`\n${paint('1', text)}`),
  line: (text = '') => console.log(text),
  ok: (text: string) => console.log(`${paint('32', '✓')} ${text}`),
  info: (text: string) => console.log(`${paint('2', '·')} ${text}`),
  warn: (text: string) => console.log(`${paint('33', '!')} ${text}`),
  error: (text: string) => console.error(`${paint('31', '✗')} ${text}`),
  json: (value: unknown) => console.log(JSON.stringify(value, null, 2)),
};

export function printFindings(findings: Finding[]): void {
  for (const finding of findings) {
    const text = `[${finding.area}] ${finding.message}`;
    if (finding.level === 'ok') out.ok(text);
    else if (finding.level === 'info') out.info(text);
    else if (finding.level === 'warn') out.warn(text);
    else out.error(text);
  }
}
