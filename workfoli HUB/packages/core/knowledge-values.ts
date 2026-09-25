import type { KnowledgeItem } from '../contracts/index.js';

/** Compare asserted values, without mistaking font asset paths for different families. */
export function knowledgeComparisonValue(item: Pick<KnowledgeItem, 'field' | 'value'>): string {
  let value = item.value;
  if (item.field === 'brand.typography') {
    const families = /^([^\n+]+\([^)]*\)\s*\+\s*[^\n+(]+\([^)]*\))/.exec(value);
    if (families) value = families[1]!;
  }
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

export function markKnowledgeConflicts(items: KnowledgeItem[]): void {
  const key = (item: KnowledgeItem) => JSON.stringify([item.field, (item.scope ?? '').toLocaleLowerCase('pt-BR')]);
  const values = new Map<string, Set<string>>();
  for (const item of items.filter(item => item.status !== 'rejected')) {
    const group = values.get(key(item)) ?? new Set<string>();
    group.add(knowledgeComparisonValue(item)); values.set(key(item), group);
  }
  for (const item of items) {
    delete item.conflict;
    if (item.status !== 'rejected' && (values.get(key(item))?.size ?? 0) > 1) item.conflict = true;
  }
}
