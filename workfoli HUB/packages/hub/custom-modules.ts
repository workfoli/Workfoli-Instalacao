import * as fs from 'node:fs';
import path from 'node:path';
import { MODULE_IDS } from '../contract/workfoli-contract.mjs';
import { readJsonFile } from '../instance/fsutil.js';

/**
 * Módulos customizados declarativos (CUSTOM MODULES da empresa). Sem código: campos e rótulos.
 * Vivem em `hub/modules/<id>/module.json` e só carregam se listados em `workfoli.hub.json`.
 */
export type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'number' | 'email' | 'phone' | 'select' | 'checkbox';
export interface CustomField { id: string; label: string; type: FieldType; required: boolean; options?: string[]; }
export interface CustomModule {
  id: string; label: string; description: string; icon: string; entityLabel: string; fields: CustomField[]; listFields: string[];
}
export interface CustomModuleLoad { modules: CustomModule[]; errors: Array<{ id: string; message: string }>; }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TYPES: readonly FieldType[] = ['text', 'textarea', 'date', 'time', 'number', 'email', 'phone', 'select', 'checkbox'];
const ICONS = new Set(['calendar', 'clipboard-list', 'file-text', 'package', 'star', 'tag', 'truck', 'wrench', 'users', 'briefcase', 'layers', 'heart']);

function label(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error('rótulo inválido');
  return value.trim();
}

export function validateCustomModule(input: unknown, expectedId: string): CustomModule {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('module.json precisa ser um objeto');
  const allowed = ['$schema', 'format', 'schemaVersion', 'id', 'label', 'description', 'icon', 'entityLabel', 'fields', 'listFields'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('campo não previsto em module.json');
  if (value.format !== 'workfoli-module' || value.schemaVersion !== 1) throw new Error('formato ou versão não suportados');
  if (value.id !== expectedId || !SLUG.test(expectedId) || (MODULE_IDS as readonly string[]).includes(expectedId)) throw new Error('id precisa ser igual ao nome da pasta e diferente dos módulos do Core');
  if (!Array.isArray(value.fields) || !value.fields.length || value.fields.length > 30) throw new Error('declare de 1 a 30 campos');
  const fields: CustomField[] = value.fields.map((raw: unknown) => {
    const field = raw as Record<string, unknown>;
    if (!field || typeof field !== 'object' || Object.keys(field).some(key => !['id', 'label', 'type', 'required', 'options'].includes(key))) throw new Error('campo inválido');
    if (typeof field.id !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(field.id)) throw new Error('id de campo inválido');
    if (!TYPES.includes(field.type as FieldType)) throw new Error('tipo de campo inválido');
    const result: CustomField = { id: field.id, label: label(field.label, 60), type: field.type as FieldType, required: field.required === true };
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || !field.options.length || field.options.length > 30) throw new Error('select precisa de opções');
      result.options = field.options.map(option => label(option, 60));
    }
    return result;
  });
  if (new Set(fields.map(field => field.id)).size !== fields.length) throw new Error('campos repetidos');
  const listFields = Array.isArray(value.listFields) ? value.listFields.filter((id): id is string => typeof id === 'string' && fields.some(field => field.id === id)).slice(0, 6) : fields.slice(0, 4).map(field => field.id);
  return {
    id: expectedId, label: label(value.label, 40), description: typeof value.description === 'string' ? value.description.slice(0, 300) : '',
    icon: typeof value.icon === 'string' && ICONS.has(value.icon) ? value.icon : 'layers', entityLabel: value.entityLabel ? label(value.entityLabel, 40) : 'Registro',
    fields, listFields,
  };
}

export function loadCustomModules(hubDir: string, ids: readonly string[]): CustomModuleLoad {
  const result: CustomModuleLoad = { modules: [], errors: [] };
  for (const id of ids) {
    try {
      const file = path.join(hubDir, 'modules', id, 'module.json');
      if (!fs.existsSync(file)) throw new Error('module.json não encontrado');
      result.modules.push(validateCustomModule(readJsonFile(file, 256 * 1024), id));
    } catch (error) { result.errors.push({ id, message: (error as Error).message }); }
  }
  return result;
}

/** Valida um registro contra a definição do módulo (servidor é a autoridade, não o formulário). */
export function validateRecord(module: CustomModule, input: unknown): Record<string, string | number | boolean | null> {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Registro inválido.');
  const record: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(value)) if (!module.fields.some(field => field.id === key)) throw new Error('Campo não previsto no módulo.');
  for (const field of module.fields) {
    const raw = value[field.id];
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) throw new Error(`Preencha "${field.label}".`);
      record[field.id] = null; continue;
    }
    if (field.type === 'checkbox') { if (typeof raw !== 'boolean') throw new Error(`"${field.label}" inválido.`); record[field.id] = raw; continue; }
    if (field.type === 'number') { const number = Number(raw); if (!Number.isFinite(number)) throw new Error(`"${field.label}" precisa ser número.`); record[field.id] = number; continue; }
    if (typeof raw !== 'string' || raw.length > (field.type === 'textarea' ? 5000 : 300) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)) throw new Error(`"${field.label}" inválido.`);
    const text = raw.trim();
    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`"${field.label}" precisa ser uma data.`);
    if (field.type === 'time' && !/^\d{2}:\d{2}$/.test(text)) throw new Error(`"${field.label}" precisa ser um horário.`);
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error(`"${field.label}" precisa ser um e-mail.`);
    if (field.type === 'select' && !field.options!.includes(text)) throw new Error(`"${field.label}" fora das opções.`);
    record[field.id] = text;
  }
  return record;
}
