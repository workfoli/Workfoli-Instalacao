import { randomUUID } from 'node:crypto';
import { now } from '../db.js';
import type { HubDatabase } from '../db.js';
import type { CrmEntityType } from './history.js';

export function tagsOf(db: HubDatabase, type: CrmEntityType, id: string): string[] {
  return (db.prepare(`SELECT t.name FROM crm_entity_tags et JOIN crm_tags t ON t.id=et.tag_id
    WHERE et.entity_type=? AND et.entity_id=? ORDER BY t.name COLLATE NOCASE`).all(type, id) as Array<{ name: string }>).map(row => row.name);
}

function tagId(db: HubDatabase, name: string): string {
  const existing = db.prepare('SELECT id FROM crm_tags WHERE name=? COLLATE NOCASE').get(name) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare('INSERT INTO crm_tags(id,name,created_at) VALUES (?,?,?)').run(id, name, now());
  return id;
}

/** Substitui as etiquetas da entidade. Devolve o que entrou e o que saiu (para o histórico). */
export function setTags(db: HubDatabase, type: CrmEntityType, id: string, next: string[]): { added: string[]; removed: string[] } {
  const current = tagsOf(db, type, id);
  const lower = (list: string[]) => new Set(list.map(item => item.toLowerCase()));
  const nextSet = lower(next), currentSet = lower(current);
  const added = next.filter(tag => !currentSet.has(tag.toLowerCase()));
  const removed = current.filter(tag => !nextSet.has(tag.toLowerCase()));
  for (const tag of added) db.prepare('INSERT OR IGNORE INTO crm_entity_tags(tag_id,entity_type,entity_id,created_at) VALUES (?,?,?,?)').run(tagId(db, tag), type, id, now());
  for (const tag of removed) {
    db.prepare(`DELETE FROM crm_entity_tags WHERE entity_type=? AND entity_id=? AND tag_id=(SELECT id FROM crm_tags WHERE name=? COLLATE NOCASE)`).run(type, id, tag);
  }
  return { added, removed };
}

export function addTag(db: HubDatabase, type: CrmEntityType, id: string, tag: string): boolean {
  const result = db.prepare('INSERT OR IGNORE INTO crm_entity_tags(tag_id,entity_type,entity_id,created_at) VALUES (?,?,?,?)').run(tagId(db, tag), type, id, now());
  return Number(result.changes) > 0;
}

export function listTags(db: HubDatabase): Array<{ name: string; uses: number }> {
  return (db.prepare(`SELECT t.name, COUNT(et.entity_id) AS uses FROM crm_tags t LEFT JOIN crm_entity_tags et ON et.tag_id=t.id
    GROUP BY t.id ORDER BY t.name COLLATE NOCASE`).all() as Array<{ name: string; uses: number }>).map(row => ({ name: row.name, uses: Number(row.uses) }));
}
