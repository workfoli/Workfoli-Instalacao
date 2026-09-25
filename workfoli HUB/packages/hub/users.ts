import type { RolePreset } from '../contract/workfoli-contract.mjs';
import type { HubDatabase } from './db.js';
import { now, transaction } from './db.js';
import { AuthError, consumeToken, hashPassword, issueToken, newId, revokeUserSessions, validatePassword, verifyPassword } from './auth.js';
import { CORE_ROLES, sanitizePermissions } from './permissions.js';
import type { RoleDefinition } from './permissions.js';

export interface UserView {
  id: string; name: string; email: string | null; roleId: string; roleName: string; status: 'pending' | 'active' | 'disabled';
  createdAt: string; lastLoginAt: string | null;
}
export interface RoleView extends RoleDefinition { users: number; }

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
const NAME_LIMIT = 120;

export function cleanName(value: unknown, label = 'nome'): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > NAME_LIMIT || /[\u0000-\u001f\u007f]/.test(value)) throw new AuthError(`Informe um ${label} com até ${NAME_LIMIT} caracteres.`);
  return value.trim().normalize('NFC');
}

export function cleanEmail(value: unknown): string {
  if (typeof value !== 'string' || !EMAIL.test(value.trim())) throw new AuthError('Informe um e-mail válido.');
  return value.trim().toLowerCase();
}

export interface CoreRolesDrift { missing: string[]; outdated: string[]; reserved: string[]; }

/** Somente leitura: papéis do Core ausentes, com permissões de outra versão ou com o id ocupado por papel da Base/personalizado. */
export function coreRolesDrift(db: HubDatabase): CoreRolesDrift {
  const drift: CoreRolesDrift = { missing: [], outdated: [], reserved: [] };
  for (const role of CORE_ROLES) {
    const row = db.prepare('SELECT name,description,permissions,source FROM roles WHERE id=?').get(role.id) as { name: string; description: string; permissions: string; source: string } | undefined;
    if (!row) drift.missing.push(role.id);
    else if (row.source !== 'core') drift.reserved.push(role.id);
    else if (row.name !== role.name || row.description !== role.description || row.permissions !== JSON.stringify(role.permissions)) drift.outdated.push(role.id);
  }
  return drift;
}

/**
 * Deixa os papéis do Core iguais aos desta versão (cada versão pode acrescentar papéis ou permissões; eles não
 * são customizáveis). Roda na instalação, ao abrir o Hub e no `update`. Um papel antigo da Base ou personalizado
 * cujo id o Core passou a reservar é preservado com outro id, junto com quem o usa, em vez de receber as
 * permissões do Core sem aprovação.
 */
export function syncCoreRoles(db: HubDatabase): { added: string[]; updated: string[]; preserved: Array<{ from: string; to: string }> } {
  const drift = coreRolesDrift(db);
  const result = { added: [] as string[], updated: [] as string[], preserved: [] as Array<{ from: string; to: string }> };
  if (!drift.missing.length && !drift.outdated.length && !drift.reserved.length) return result;
  const stamp = now();
  transaction(db, () => {
    for (const id of drift.reserved) {
      let to = `${id}-anterior`;
      for (let index = 2; db.prepare('SELECT 1 FROM roles WHERE id=?').get(to); index++) to = `${id}-anterior-${index}`;
      db.prepare('INSERT INTO roles(id,name,description,permissions,source,created_at,updated_at) SELECT ?,name,description,permissions,source,created_at,? FROM roles WHERE id=?').run(to, stamp, id);
      db.prepare('UPDATE users SET role_id=? WHERE role_id=?').run(to, id);
      db.prepare('DELETE FROM roles WHERE id=?').run(id);
      result.preserved.push({ from: id, to });
    }
    for (const role of CORE_ROLES) {
      if (!drift.missing.includes(role.id) && !drift.outdated.includes(role.id) && !drift.reserved.includes(role.id)) continue;
      db.prepare(`INSERT INTO roles(id,name,description,permissions,source,created_at,updated_at) VALUES (?,?,?,?,'core',?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, permissions=excluded.permissions, source='core', updated_at=excluded.updated_at`)
        .run(role.id, role.name, role.description, JSON.stringify(role.permissions), stamp, stamp);
      (drift.outdated.includes(role.id) ? result.updated : result.added).push(role.id);
    }
  });
  return result;
}

/** Papéis do Core sempre presentes; sugestões da Base entram como 'base' somente se ainda não existirem. */
export function seedRoles(db: HubDatabase, presets: readonly RolePreset[] = []): { added: string[] } {
  const added: string[] = [];
  const insert = db.prepare('INSERT OR IGNORE INTO roles(id,name,description,permissions,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  const stamp = now();
  syncCoreRoles(db);
  for (const preset of presets) {
    const permissions = sanitizePermissions(preset.permissions);
    const result = insert.run(preset.id, preset.name, preset.description ?? '', JSON.stringify(permissions), 'base', stamp, stamp);
    if (Number(result.changes) > 0) added.push(preset.id);
  }
  return { added };
}

/** Diferenças entre as sugestões atuais da Base e os papéis 'base' da instância (aplicação exige aprovação). */
export function diffRolePresets(db: HubDatabase, presets: readonly RolePreset[]): Array<{ id: string; change: 'new' | 'changed'; permissions: string[] }> {
  const changes: Array<{ id: string; change: 'new' | 'changed'; permissions: string[] }> = [];
  for (const preset of presets) {
    const permissions = sanitizePermissions(preset.permissions);
    const row = db.prepare('SELECT permissions,source FROM roles WHERE id=?').get(preset.id) as { permissions: string; source: string } | undefined;
    if (!row) changes.push({ id: preset.id, change: 'new', permissions });
    else if (row.source === 'base' && JSON.stringify([...JSON.parse(row.permissions)].sort()) !== JSON.stringify([...permissions].sort())) changes.push({ id: preset.id, change: 'changed', permissions });
  }
  return changes;
}

export function applyRolePresets(db: HubDatabase, presets: readonly RolePreset[]): string[] {
  const applied: string[] = [];
  transaction(db, () => {
    for (const change of diffRolePresets(db, presets)) {
      const preset = presets.find(item => item.id === change.id)!;
      db.prepare(`INSERT INTO roles(id,name,description,permissions,source,created_at,updated_at) VALUES (?,?,?,?,'base',?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, permissions=excluded.permissions, updated_at=excluded.updated_at WHERE roles.source='base'`)
        .run(preset.id, preset.name, preset.description ?? '', JSON.stringify(change.permissions), now(), now());
      applied.push(change.id);
    }
  });
  return applied;
}

export function listRoles(db: HubDatabase): RoleView[] {
  const rows = db.prepare(`SELECT r.id,r.name,r.description,r.permissions,r.source,(SELECT COUNT(*) FROM users u WHERE u.role_id=r.id) AS users
    FROM roles r ORDER BY CASE r.source WHEN 'core' THEN 0 WHEN 'base' THEN 1 ELSE 2 END, r.name`).all() as Array<Record<string, unknown>>;
  return rows.map(row => ({ id: String(row.id), name: String(row.name), description: String(row.description ?? ''), permissions: JSON.parse(String(row.permissions)) as string[], source: row.source as RoleDefinition['source'], users: Number(row.users) }));
}

export function saveCustomRole(db: HubDatabase, input: { id?: unknown; name?: unknown; description?: unknown; permissions?: unknown }): RoleView {
  const name = cleanName(input.name, 'nome de papel');
  const permissions = sanitizePermissions(input.permissions);
  if (!permissions.length) throw new AuthError('Escolha ao menos uma permissão.');
  if (permissions.some(permission => /^(?:users|settings):/.test(permission))) throw new AuthError('Administração de usuários e configurações fica restrita aos papéis Proprietário e Administrador.');
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 300) : '';
  const id = typeof input.id === 'string' && input.id ? input.id : `papel-${newId().slice(0, 8)}`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 40) throw new AuthError('Identificador de papel inválido.');
  const existing = db.prepare('SELECT source FROM roles WHERE id=?').get(id) as { source: string } | undefined;
  if (existing && existing.source === 'core') throw new AuthError('Papéis do Core não podem ser alterados.');
  db.prepare(`INSERT INTO roles(id,name,description,permissions,source,created_at,updated_at) VALUES (?,?,?,?,'custom',?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, permissions=excluded.permissions, source=CASE roles.source WHEN 'base' THEN 'custom' ELSE roles.source END, updated_at=excluded.updated_at`)
    .run(id, name, description, JSON.stringify(permissions), now(), now());
  return listRoles(db).find(role => role.id === id)!;
}

export function deleteRole(db: HubDatabase, id: string): void {
  const role = db.prepare('SELECT source,(SELECT COUNT(*) FROM users WHERE role_id=roles.id) AS users FROM roles WHERE id=?').get(id) as { source: string; users: number } | undefined;
  if (!role) throw new AuthError('Papel não encontrado.', 404);
  if (role.source === 'core') throw new AuthError('Papéis do Core não podem ser removidos.');
  if (Number(role.users) > 0) throw new AuthError('Mova os usuários deste papel antes de removê-lo.');
  db.prepare('DELETE FROM roles WHERE id=?').run(id);
}

function roleExists(db: HubDatabase, id: unknown): id is string {
  return typeof id === 'string' && !!db.prepare('SELECT 1 FROM roles WHERE id=?').get(id);
}

export function listUsers(db: HubDatabase): UserView[] {
  const rows = db.prepare(`SELECT u.id,u.name,u.email,u.role_id,r.name AS role_name,u.status,u.created_at,u.last_login_at
    FROM users u JOIN roles r ON r.id=u.role_id ORDER BY CASE u.role_id WHEN 'owner' THEN 0 ELSE 1 END, u.name`).all() as Array<Record<string, unknown>>;
  return rows.map(row => ({ id: String(row.id), name: String(row.name), email: (row.email as string | null) ?? null, roleId: String(row.role_id), roleName: String(row.role_name), status: row.status as UserView['status'], createdAt: String(row.created_at), lastLoginAt: (row.last_login_at as string | null) ?? null }));
}

function activeOwners(db: HubDatabase): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM users WHERE role_id='owner' AND status='active'").get() as { n: number }).n);
}

/** Cria usuário pendente e devolve o token de ativação (mostrado uma única vez). */
export function inviteUser(db: HubDatabase, actor: { id: string | null; roleId: string }, input: { name?: unknown; roleId?: unknown }, hours = 72): { user: UserView; token: string } {
  const name = cleanName(input.name);
  if (!roleExists(db, input.roleId)) throw new AuthError('Escolha um papel existente.');
  if (input.roleId === 'owner' && actor.roleId !== 'owner') throw new AuthError('Somente o proprietário pode convidar outro proprietário.', 403);
  if (input.roleId === 'manager' && actor.roleId !== 'owner') throw new AuthError('Somente o proprietário concede o acesso de Gestor Workfoli.', 403);
  const id = newId();
  db.prepare("INSERT INTO users(id,name,email,role_id,status,created_at,updated_at) VALUES (?,?,NULL,?,'pending',?,?)").run(id, name, input.roleId, now(), now());
  const token = issueToken(db, 'activation', { userId: id, createdBy: actor.id ?? undefined, hours });
  return { user: listUsers(db).find(user => user.id === id)!, token };
}

/** Garante um proprietário. Sem nenhum, cria um pendente; com `reissue`, gera novo link para o pendente. */
export function ensureOwner(db: HubDatabase, options: { name?: string; reissue?: boolean } = {}): { userId: string; token: string | null; status: 'created' | 'reissued' | 'exists' } {
  const active = db.prepare("SELECT id FROM users WHERE role_id='owner' AND status='active' LIMIT 1").get() as { id: string } | undefined;
  if (active && !options.reissue) return { userId: active.id, token: null, status: 'exists' };
  const pending = db.prepare("SELECT id FROM users WHERE role_id='owner' AND status='pending' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  if (pending) return { userId: pending.id, token: issueToken(db, 'activation', { userId: pending.id, hours: 24 }), status: 'reissued' };
  if (active) throw new AuthError('A instância já tem proprietário ativo. Para recuperar acesso, use `workfoli hub owner --recover`.');
  const id = newId();
  db.prepare("INSERT INTO users(id,name,email,role_id,status,created_at,updated_at) VALUES (?,?,NULL,'owner','pending',?,?)").run(id, cleanName(options.name ?? 'Proprietário'), now(), now());
  return { userId: id, token: issueToken(db, 'activation', { userId: id, hours: 24 }), status: 'created' };
}

/** Recuperação local (CLI com acesso à máquina): novo link de redefinição para um proprietário ativo. */
export function recoverOwner(db: HubDatabase): { userId: string; token: string } {
  const owner = db.prepare("SELECT id FROM users WHERE role_id='owner' AND status='active' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  if (!owner) throw new AuthError('Nenhum proprietário ativo; use `workfoli hub owner` para criar o acesso inicial.');
  return { userId: owner.id, token: issueToken(db, 'activation', { userId: owner.id, hours: 2, meta: { purpose: 'recovery' } }) };
}

/**
 * Primeiro acesso no próprio computador do Hub (`hub start --open`): enquanto o proprietário não tem conta,
 * `issue` emite um link novo para abrir direto no navegador (o anterior deixa de valer). Com conta ativa, nada muda.
 */
export function ownerFirstAccess(db: HubDatabase, options: { issue: boolean }): { pending: boolean; userId: string | null; token: string | null } {
  if (db.prepare("SELECT 1 FROM users WHERE role_id='owner' AND status='active' LIMIT 1").get()) return { pending: false, userId: null, token: null };
  if (!options.issue) return { pending: true, userId: null, token: null };
  const { userId, token } = ensureOwner(db, { reissue: true });
  return { pending: true, userId, token };
}

export async function activateAccount(db: HubDatabase, input: { token?: unknown; email?: unknown; password?: unknown; name?: unknown }): Promise<UserView> {
  const password = validatePassword(input.password);
  const hash = await hashPassword(password);
  const { userId, meta } = consumeToken(db, 'activation', input.token);
  if (!userId) throw new AuthError('Link inválido ou expirado.');
  const user = db.prepare('SELECT id,status,email FROM users WHERE id=?').get(userId) as { id: string; status: string; email: string | null } | undefined;
  if (!user || user.status === 'disabled') throw new AuthError('Esta conta não está disponível.');
  const recovery = meta?.purpose === 'recovery';
  const email = recovery && user.email ? user.email : cleanEmail(input.email);
  const clash = db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(email, userId);
  if (clash) throw new AuthError('Este e-mail já está em uso nesta instância.');
  transaction(db, () => {
    db.prepare("UPDATE users SET email=?, password_hash=?, status='active', updated_at=?" + (input.name ? ', name=?' : '') + ' WHERE id=?')
      .run(...(input.name ? [email, hash, now(), cleanName(input.name), userId] : [email, hash, now(), userId]));
    revokeUserSessions(db, userId);
  });
  return listUsers(db).find(item => item.id === userId)!;
}

export async function authenticate(db: HubDatabase, email: unknown, password: unknown): Promise<UserView> {
  const address = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
  const row = db.prepare("SELECT id,password_hash,status FROM users WHERE email=?").get(address) as { id: string; password_hash: string | null; status: string } | undefined;
  const ok = await verifyPassword(typeof password === 'string' ? password.slice(0, 256) : '', row?.password_hash);
  if (!row || !ok || row.status !== 'active') throw new AuthError('E-mail ou senha incorretos.', 401);
  return listUsers(db).find(user => user.id === row.id)!;
}

export function updateUser(db: HubDatabase, actor: { id: string; roleId: string }, id: string, input: { name?: unknown; roleId?: unknown; status?: unknown }): UserView {
  const target = db.prepare('SELECT id,role_id,status FROM users WHERE id=?').get(id) as { id: string; role_id: string; status: string } | undefined;
  if (!target) throw new AuthError('Usuário não encontrado.', 404);
  const touchesOwner = target.role_id === 'owner' || input.roleId === 'owner';
  if (touchesOwner && actor.roleId !== 'owner') throw new AuthError('Somente o proprietário altera a propriedade da instância.', 403);
  // O acesso da Workfoli à empresa é decisão do proprietário: só ele concede ou retira.
  if ((target.role_id === 'manager' || input.roleId === 'manager') && actor.roleId !== 'owner') throw new AuthError('Somente o proprietário concede ou retira o acesso de Gestor Workfoli.', 403);
  if (input.roleId !== undefined && id === actor.id) throw new AuthError('Você não pode alterar o próprio papel.', 403);
  if (input.status !== undefined && id === actor.id) throw new AuthError('Você não pode desativar a própria conta.', 403);
  const nextRole = input.roleId === undefined ? target.role_id : input.roleId;
  if (!roleExists(db, nextRole)) throw new AuthError('Papel inexistente.');
  const nextStatus = input.status === undefined ? target.status : input.status;
  if (!['active', 'disabled', 'pending'].includes(String(nextStatus)) || (nextStatus === 'pending' && target.status !== 'pending') || (nextStatus === 'active' && target.status === 'pending')) throw new AuthError('Estado inválido para este usuário.');
  return transaction(db, () => {
    const name = input.name === undefined ? (db.prepare('SELECT name FROM users WHERE id=?').get(id) as { name: string }).name : cleanName(input.name);
    db.prepare('UPDATE users SET name=?, role_id=?, status=?, updated_at=? WHERE id=?').run(name, String(nextRole), String(nextStatus), now(), id);
    if (activeOwners(db) < 1) throw new AuthError('A instância precisa manter ao menos um proprietário ativo.');
    if (nextStatus !== 'active' || nextRole !== target.role_id) revokeUserSessions(db, id);
    return listUsers(db).find(user => user.id === id)!;
  });
}

export async function changePassword(db: HubDatabase, userId: string, current: unknown, next: unknown): Promise<void> {
  const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId) as { password_hash: string | null } | undefined;
  if (!row || !(await verifyPassword(typeof current === 'string' ? current : '', row.password_hash))) throw new AuthError('Senha atual incorreta.', 401);
  const hash = await hashPassword(validatePassword(next));
  transaction(db, () => {
    db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(hash, now(), userId);
    revokeUserSessions(db, userId);
  });
}
