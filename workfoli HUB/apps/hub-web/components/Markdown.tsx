import type { ReactNode } from 'react';

/**
 * Renderizador de Markdown seguro: gera elementos React (texto sempre escapado), nunca HTML bruto.
 * Suporta o que as Bases usam: títulos, parágrafos, listas, tarefas, citações, código, tabelas, links http(s), ênfase.
 */
function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const id = `${key}-${index++}`;
    if (match[1]) nodes.push(<code key={id}>{token.slice(1, -1)}</code>);
    else if (match[2]) nodes.push(<strong key={id}>{inline(token.slice(2, -2), id)}</strong>);
    else if (match[3]) nodes.push(<em key={id}>{inline(token.slice(1, -1), id)}</em>);
    else {
      const [, label, url] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
      nodes.push(<a key={id} href={url} target="_blank" rel="noopener noreferrer">{label}</a>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const key = `b${index}`;
    if (!line.trim()) { index++; continue; }
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index]!.trim().startsWith(fence[1]!)) code.push(lines[index++]!);
      index++;
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length, 3);
      const content = inline(heading[2]!, key);
      blocks.push(level === 1 ? <h1 key={key}>{content}</h1> : level === 2 ? <h2 key={key}>{content}</h2> : <h3 key={key}>{content}</h3>);
      index++; continue;
    }
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) { blocks.push(<hr key={key} />); index++; continue; }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index]!)) quote.push(lines[index++]!.replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join(' '), key)}</blockquote>);
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]!)) {
      const header = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index]!.includes('|') && lines[index]!.trim()) rows.push(cells(lines[index++]!));
      blocks.push(<table key={key}><thead><tr>{header.map((cell, i) => <th key={i}>{inline(cell, `${key}h${i}`)}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i}>{inline(cell, `${key}${r}-${i}`)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index]!)) {
        const text = lines[index]!.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
        items.push(task
          ? <li key={index} className="task"><span className={`box${task[1] === ' ' ? '' : ' done'}`} aria-label={task[1] === ' ' ? 'pendente' : 'feito'} />{inline(task[2]!, `${key}${index}`)}</li>
          : <li key={index}>{inline(text, `${key}${index}`)}</li>);
        index++;
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    // A primeira linha sempre é consumida: nenhuma entrada faz o laço parar no mesmo lugar.
    const paragraph: string[] = [lines[index++]!.trim()];
    while (index < lines.length && lines[index]!.trim() && !/^(#{1,4}\s|\s*```|\s*>|\s*(?:[-*+]|\d+[.)])\s+)/.test(lines[index]!)) paragraph.push(lines[index++]!.trim());
    blocks.push(<p key={key}>{inline(paragraph.join(' '), key)}</p>);
  }
  return <div className="markdown">{blocks}</div>;
}
