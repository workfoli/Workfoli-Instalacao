import type { KnowledgeItem, ReanalysisPreview } from '../contracts/index.js';
import { markKnowledgeConflicts } from './knowledge-values.js';

const key = (item: KnowledgeItem) => JSON.stringify([item.evidence.fileId, item.field, item.scope ?? '']);
const reviewed = (item: KnowledgeItem) => item.status !== 'pending' || item.origin === 'user';
const equivalent = (a: KnowledgeItem, b: KnowledgeItem) => JSON.stringify([
  a.field, a.value, a.category, a.origin, a.scope, a.evidence, Boolean(a.conflict),
]) === JSON.stringify([b.field, b.value, b.category, b.origin, b.scope, b.evidence, Boolean(b.conflict)]);

/** Reconcile suggestions only. Human decisions, identities and corrections always survive. */
export function reconcileKnowledge(previous: KnowledgeItem[], extracted: KnowledgeItem[]): Omit<ReanalysisPreview, 'token'> {
  const protectedItems = previous.filter(reviewed);
  const protectedKeys = new Set(protectedItems.map(key));
  const used = new Set<string>();
  let added = 0;
  const pending: KnowledgeItem[] = [];
  for (const candidate of extracted) {
    if (protectedKeys.has(key(candidate))) continue;
    const available = previous.filter(item => !reviewed(item) && !used.has(item.id) && key(item) === key(candidate));
    const old = available.find(item => item.value === candidate.value) ?? available[0];
    if (old) {
      used.add(old.id);
      const next = { ...candidate, id: old.id };
      pending.push(next);
    } else { added++; pending.push(candidate); }
  }
  const knowledge = [...protectedItems.map(item => ({ ...item })), ...pending];
  markKnowledgeConflicts(knowledge);
  return {
    added, updated: pending.filter(item => used.has(item.id) && !equivalent(item, previous.find(old => old.id === item.id)!)).length,
    removed: previous.filter(item => !reviewed(item) && !used.has(item.id)).length,
    retainedReviewed: protectedItems.length, previousCount: previous.length,
    knowledge,
  };
}
