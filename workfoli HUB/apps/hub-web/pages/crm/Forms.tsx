import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Notice, useToast } from '../../components/ui';
import { CustomFields, OwnerSelect, PrioritySelect, SourceSelect, TagsField, missingFrom, moneyInput, valueOf } from '../../components/crm';
import type { FormState } from '../../components/crm';
import { ApiError, errorMessage, get, patch, post } from '../../lib/api';
import { RELATIONSHIPS } from '../../lib/crm';
import type { Contact, CrmSettings, CrmStage, EntityType, Lead, Opportunity, Organization } from '../../lib/crm';

const fieldsFor = (settings: CrmSettings, entity: EntityType) => settings.config.customFields.filter(field => field.entity === entity);
const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value.replace(',', '.')));

function DuplicateNotice({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.code !== 'duplicate' || !error.details) return null;
  const details = error.details as { id?: string; name?: string };
  return <Notice tone="info">Já existe: <strong>{details.name}</strong>. Abra o cadastro existente ou marque “Cadastrar mesmo assim”.</Notice>;
}

function useForm(open: boolean) {
  const [form, setForm] = useState<FormState>({});
  const [custom, setCustom] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm({}); setCustom(null); setError(null); } }, [open]);
  return { form, setForm, custom, setCustom, error, setError, busy, setBusy, set: (key: string, value: unknown) => setForm(current => ({ ...current, [key]: value })) };
}

// ————————————————— Lead —————————————————

export function LeadDialog({ settings, lead, open, onClose, onSaved }: { settings: CrmSettings; lead?: Lead | null; open: boolean; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const toast = useToast();
  const state = useForm(open);
  const { form, set } = state;
  const fields = fieldsFor(settings, 'lead');
  const custom = state.custom ?? lead?.custom ?? {};
  const save = async () => {
    state.setBusy(true); state.setError(null);
    const body = {
      name: valueOf(form, 'name', lead?.name), email: valueOf(form, 'email', lead?.email), phone: valueOf(form, 'phone', lead?.phone), company: valueOf(form, 'company', lead?.company),
      sourceId: valueOf(form, 'sourceId', lead ? lead.source?.id : 'manual'), ownerId: valueOf(form, 'ownerId', lead?.owner?.id), priority: valueOf(form, 'priority', lead?.priority ?? 'normal'),
      message: valueOf(form, 'message', lead?.message), ...(fields.length ? { custom } : {}), ...(form.tags ? { tags: form.tags } : {}),
    };
    try {
      const saved = lead ? await patch<Lead>(`/api/crm/leads/${lead.id}`, body) : await post<Lead>('/api/crm/leads', body);
      toast(lead ? 'Lead atualizado.' : `${settings.labels.lead} registrado.`);
      onSaved(saved);
    } catch (cause) { state.setError(cause); } finally { state.setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={lead ? `Editar ${settings.labels.lead.toLowerCase()}` : `Novo ${settings.labels.lead.toLowerCase()}`} description={lead ? undefined : 'Pessoa ou empresa interessada, ainda não qualificada. Converta em contato e oportunidade quando fizer sentido.'} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={state.busy} disabled={!valueOf(form, 'name', lead?.name).trim()} onClick={save}>Salvar</Button></>}>
      <div className="form">
        {state.error ? <Notice>{errorMessage(state.error)}</Notice> : null}
        <div className="form-row">
          <Field label="Nome"><input className="input" value={valueOf(form, 'name', lead?.name)} maxLength={160} onChange={event => set('name', event.target.value)} /></Field>
          <Field label="Empresa"><input className="input" value={valueOf(form, 'company', lead?.company)} maxLength={160} onChange={event => set('company', event.target.value)} /></Field>
        </div>
        <div className="form-row">
          <Field label="E-mail"><input className="input" type="email" value={valueOf(form, 'email', lead?.email)} onChange={event => set('email', event.target.value)} /></Field>
          <Field label="Telefone"><input className="input" type="tel" value={valueOf(form, 'phone', lead?.phone)} onChange={event => set('phone', event.target.value)} /></Field>
        </div>
        <div className="form-row">
          <SourceSelect settings={settings} value={valueOf(form, 'sourceId', lead ? lead.source?.id : 'manual')} onChange={value => set('sourceId', value)} />
          <OwnerSelect settings={settings} value={valueOf(form, 'ownerId', lead?.owner?.id)} onChange={value => set('ownerId', value)} />
        </div>
        <div className="form-row">
          <PrioritySelect value={valueOf(form, 'priority', lead?.priority)} onChange={value => set('priority', value)} />
          <TagsField value={(form.tags as string[] | undefined) ?? lead?.tags ?? []} onChange={value => set('tags', value)} />
        </div>
        <Field label="Mensagem ou interesse" help="Evite dados sensíveis (saúde, documentos): eles pedem módulos com controles próprios."><textarea className="textarea" rows={3} value={valueOf(form, 'message', lead?.message)} maxLength={5000} onChange={event => set('message', event.target.value)} /></Field>
        <CustomFields fields={fields} values={custom} onChange={(id, value) => state.setCustom({ ...custom, [id]: value })} />
      </div>
    </Dialog>
  );
}

// ————————————————— Contato —————————————————

export function ContactDialog({ settings, contact, open, onClose, onSaved }: { settings: CrmSettings; contact?: Contact | null; open: boolean; onClose: () => void; onSaved: (contact: Contact) => void }) {
  const toast = useToast();
  const state = useForm(open);
  const { form, set } = state;
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const fields = fieldsFor(settings, 'contact');
  const custom = state.custom ?? contact?.custom ?? {};
  const save = async () => {
    state.setBusy(true); state.setError(null);
    const organizationName = valueOf(form, 'organizationName', contact?.organization?.name);
    const body = {
      name: valueOf(form, 'name', contact?.name), email: valueOf(form, 'email', contact?.email), phone: valueOf(form, 'phone', contact?.phone), jobTitle: valueOf(form, 'jobTitle', contact?.jobTitle),
      relationship: valueOf(form, 'relationship', contact?.relationship ?? 'prospect'), sourceId: valueOf(form, 'sourceId', contact?.source?.id), ownerId: valueOf(form, 'ownerId', contact?.owner?.id),
      notes: valueOf(form, 'notes', contact?.notes), ...(organizationName ? { organizationName } : contact?.organization ? { organizationId: null } : {}),
      ...(fields.length ? { custom } : {}), ...(form.tags ? { tags: form.tags } : {}), ...(allowDuplicate ? { allowDuplicate: true } : {}),
    };
    try {
      const saved = contact ? await patch<Contact>(`/api/crm/contacts/${contact.id}`, body) : await post<Contact>('/api/crm/contacts', body);
      toast(contact ? 'Contato atualizado.' : `${settings.labels.contact} cadastrado.`);
      onSaved(saved);
    } catch (cause) { state.setError(cause); } finally { state.setBusy(false); }
  };
  const duplicate = state.error instanceof ApiError && state.error.code === 'duplicate';
  return (
    <Dialog open={open} onClose={onClose} title={contact ? `Editar ${settings.labels.contact.toLowerCase()}` : `Novo ${settings.labels.contact.toLowerCase()}`} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={state.busy} disabled={!valueOf(form, 'name', contact?.name).trim()} onClick={save}>Salvar</Button></>}>
      <div className="form">
        {duplicate ? <DuplicateNotice error={state.error} /> : state.error ? <Notice>{errorMessage(state.error)}</Notice> : null}
        {duplicate ? <label className="checkbox"><input type="checkbox" checked={allowDuplicate} onChange={event => setAllowDuplicate(event.target.checked)} />Cadastrar mesmo assim (pessoas diferentes com o mesmo e-mail)</label> : null}
        <div className="form-row">
          <Field label="Nome"><input className="input" value={valueOf(form, 'name', contact?.name)} maxLength={160} onChange={event => set('name', event.target.value)} /></Field>
          <Field label="Relação">
            <select className="select" value={valueOf(form, 'relationship', contact?.relationship ?? 'prospect')} onChange={event => set('relationship', event.target.value)}>
              {Object.entries(RELATIONSHIPS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="E-mail"><input className="input" type="email" value={valueOf(form, 'email', contact?.email)} onChange={event => set('email', event.target.value)} /></Field>
          <Field label="Telefone"><input className="input" type="tel" value={valueOf(form, 'phone', contact?.phone)} onChange={event => set('phone', event.target.value)} /></Field>
        </div>
        <div className="form-row">
          <Field label={settings.labels.organization} help="Digite o nome: reaproveita a empresa se já existir."><input className="input" value={valueOf(form, 'organizationName', contact?.organization?.name)} maxLength={160} onChange={event => set('organizationName', event.target.value)} /></Field>
          <Field label="Cargo"><input className="input" value={valueOf(form, 'jobTitle', contact?.jobTitle)} maxLength={120} onChange={event => set('jobTitle', event.target.value)} /></Field>
        </div>
        <div className="form-row">
          <SourceSelect settings={settings} value={valueOf(form, 'sourceId', contact?.source?.id)} onChange={value => set('sourceId', value)} />
          <OwnerSelect settings={settings} value={valueOf(form, 'ownerId', contact?.owner?.id)} onChange={value => set('ownerId', value)} />
        </div>
        <TagsField value={(form.tags as string[] | undefined) ?? contact?.tags ?? []} onChange={value => set('tags', value)} />
        <Field label="Observações" help="Evite dados sensíveis (saúde, documentos): eles pedem módulos com controles próprios."><textarea className="textarea" rows={3} value={valueOf(form, 'notes', contact?.notes)} maxLength={5000} onChange={event => set('notes', event.target.value)} /></Field>
        <CustomFields fields={fields} values={custom} onChange={(id, value) => state.setCustom({ ...custom, [id]: value })} />
      </div>
    </Dialog>
  );
}

// ————————————————— Empresa —————————————————

export function OrganizationDialog({ settings, organization, open, onClose, onSaved }: { settings: CrmSettings; organization?: Organization | null; open: boolean; onClose: () => void; onSaved: (organization: Organization) => void }) {
  const toast = useToast();
  const state = useForm(open);
  const { form, set } = state;
  const fields = fieldsFor(settings, 'organization');
  const custom = state.custom ?? organization?.custom ?? {};
  const save = async () => {
    state.setBusy(true); state.setError(null);
    const body = {
      name: valueOf(form, 'name', organization?.name), website: valueOf(form, 'website', organization?.website), email: valueOf(form, 'email', organization?.email),
      phone: valueOf(form, 'phone', organization?.phone), notes: valueOf(form, 'notes', organization?.notes), ownerId: valueOf(form, 'ownerId', organization?.owner?.id),
      sourceId: valueOf(form, 'sourceId', organization?.source?.id), ...(fields.length ? { custom } : {}), ...(form.tags ? { tags: form.tags } : {}),
    };
    try {
      const saved = organization ? await patch<Organization>(`/api/crm/organizations/${organization.id}`, body) : await post<Organization>('/api/crm/organizations', body);
      toast(organization ? 'Empresa atualizada.' : `${settings.labels.organization} cadastrada.`);
      onSaved(saved);
    } catch (cause) { state.setError(cause); } finally { state.setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={organization ? `Editar ${settings.labels.organization.toLowerCase()}` : `Nova ${settings.labels.organization.toLowerCase()}`} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={state.busy} disabled={!valueOf(form, 'name', organization?.name).trim()} onClick={save}>Salvar</Button></>}>
      <div className="form">
        {state.error ? (state.error instanceof ApiError && state.error.code === 'duplicate' ? <DuplicateNotice error={state.error} /> : <Notice>{errorMessage(state.error)}</Notice>) : null}
        <div className="form-row">
          <Field label="Nome"><input className="input" value={valueOf(form, 'name', organization?.name)} maxLength={160} onChange={event => set('name', event.target.value)} /></Field>
          <Field label="Site"><input className="input" type="url" placeholder="https://" value={valueOf(form, 'website', organization?.website)} onChange={event => set('website', event.target.value)} /></Field>
        </div>
        <div className="form-row">
          <Field label="E-mail"><input className="input" type="email" value={valueOf(form, 'email', organization?.email)} onChange={event => set('email', event.target.value)} /></Field>
          <Field label="Telefone"><input className="input" type="tel" value={valueOf(form, 'phone', organization?.phone)} onChange={event => set('phone', event.target.value)} /></Field>
        </div>
        <div className="form-row">
          <SourceSelect settings={settings} value={valueOf(form, 'sourceId', organization?.source?.id)} onChange={value => set('sourceId', value)} />
          <OwnerSelect settings={settings} value={valueOf(form, 'ownerId', organization?.owner?.id)} onChange={value => set('ownerId', value)} />
        </div>
        <TagsField value={(form.tags as string[] | undefined) ?? organization?.tags ?? []} onChange={value => set('tags', value)} />
        <Field label="Observações"><textarea className="textarea" rows={3} value={valueOf(form, 'notes', organization?.notes)} maxLength={5000} onChange={event => set('notes', event.target.value)} /></Field>
        <CustomFields fields={fields} values={custom} onChange={(id, value) => state.setCustom({ ...custom, [id]: value })} />
      </div>
    </Dialog>
  );
}

// ————————————————— Oportunidade —————————————————

/** Contatos e empresas para escolher (carregados quando o formulário abre). */
function usePeople(open: boolean) {
  const [people, setPeople] = useState<{ contacts: Contact[]; organizations: Organization[] }>({ contacts: [], organizations: [] });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([get<{ items: Contact[] }>('/api/crm/contacts?limit=500'), get<{ items: Organization[] }>('/api/crm/organizations?limit=500')])
      .then(([contacts, organizations]) => { if (alive) setPeople({ contacts: contacts.items, organizations: organizations.items }); }).catch(() => { /* formulário segue sem a lista */ });
    return () => { alive = false; };
  }, [open]);
  return people;
}

export function OpportunityDialog({ settings, opportunity, defaults, open, onClose, onSaved }: {
  settings: CrmSettings; opportunity?: Opportunity | null; defaults?: { contactId?: string; organizationId?: string; pipelineId?: string; stageId?: string };
  open: boolean; onClose: () => void; onSaved: (opportunity: Opportunity) => void;
}) {
  const toast = useToast();
  const state = useForm(open);
  const { form, set } = state;
  const people = usePeople(open);
  const fields = fieldsFor(settings, 'opportunity');
  const custom = state.custom ?? opportunity?.custom ?? {};
  const pipelineId = valueOf(form, 'pipelineId', opportunity?.pipelineId ?? defaults?.pipelineId ?? settings.config.pipelines.find(item => item.default)?.id);
  const pipeline = settings.config.pipelines.find(item => item.id === pipelineId) ?? settings.config.pipelines[0];
  const firstOpen = pipeline?.stages.find(stage => stage.kind === 'open');
  const stageId = valueOf(form, 'stageId', defaults?.stageId ?? firstOpen?.id);
  const missing = missingFrom(state.error);
  const save = async () => {
    state.setBusy(true); state.setError(null);
    const body = {
      title: valueOf(form, 'title', opportunity?.title), value: numberOrNull(valueOf(form, 'value', moneyInput(opportunity?.valueCents))),
      expectedCloseDate: valueOf(form, 'expectedCloseDate', opportunity?.expectedCloseDate), priority: valueOf(form, 'priority', opportunity?.priority ?? 'normal'),
      contactId: valueOf(form, 'contactId', opportunity?.contact?.id ?? defaults?.contactId), organizationId: valueOf(form, 'organizationId', opportunity?.organization?.id ?? defaults?.organizationId),
      ownerId: valueOf(form, 'ownerId', opportunity?.owner?.id), sourceId: valueOf(form, 'sourceId', opportunity?.source?.id), notes: valueOf(form, 'notes', opportunity?.notes),
      ...(fields.length ? { custom } : {}), ...(form.tags ? { tags: form.tags } : {}),
      ...(opportunity ? {} : { pipelineId, stageId, ...(form.lostReason ? { lostReason: form.lostReason } : {}) }),
    };
    if (!opportunity && !body.ownerId) delete (body as Record<string, unknown>).ownerId;
    try {
      const saved = opportunity ? await patch<Opportunity>(`/api/crm/opportunities/${opportunity.id}`, body) : await post<Opportunity>('/api/crm/opportunities', body);
      toast(opportunity ? 'Oportunidade atualizada.' : `${settings.labels.opportunity} criada.`);
      onSaved(saved);
    } catch (cause) { state.setError(cause); } finally { state.setBusy(false); }
  };
  const stage = pipeline?.stages.find(item => item.id === stageId);
  return (
    <Dialog open={open} onClose={onClose} title={opportunity ? `Editar ${settings.labels.opportunity.toLowerCase()}` : `Nova ${settings.labels.opportunity.toLowerCase()}`} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={state.busy} disabled={!valueOf(form, 'title', opportunity?.title).trim()} onClick={save}>Salvar</Button></>}>
      <div className="form">
        {state.error ? <Notice>{errorMessage(state.error)}{missing.length ? <div className="faint">Preencha e salve de novo.</div> : null}</Notice> : null}
        <Field label="Título" help="O que está sendo negociado (ex.: Site institucional — Padaria Central)."><input className="input" value={valueOf(form, 'title', opportunity?.title)} maxLength={160} onChange={event => set('title', event.target.value)} /></Field>
        {!opportunity ? (
          <div className="form-row">
            {settings.config.pipelines.length > 1 ? (
              <Field label="Funil"><select className="select" value={pipelineId} onChange={event => { set('pipelineId', event.target.value); set('stageId', ''); }}>{settings.config.pipelines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            ) : null}
            <Field label="Etapa"><select className="select" value={stageId} onChange={event => set('stageId', event.target.value)}>{pipeline?.stages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          </div>
        ) : null}
        {!opportunity && stage?.kind === 'lost' ? (
          <Field label="Motivo da perda"><select className="select" value={valueOf(form, 'lostReason')} onChange={event => set('lostReason', event.target.value)}><option value="">Escolha</option>{settings.config.lostReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></Field>
        ) : null}
        <div className="form-row">
          <Field label={`Valor (${settings.config.currency})`} help={stage?.requiredFields?.includes('value') ? `Obrigatório na etapa ${stage.name}.` : undefined}>
            <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={valueOf(form, 'value', moneyInput(opportunity?.valueCents))} onChange={event => set('value', event.target.value)} />
          </Field>
          <Field label="Previsão de fechamento"><input className="input" type="date" value={valueOf(form, 'expectedCloseDate', opportunity?.expectedCloseDate)} onChange={event => set('expectedCloseDate', event.target.value)} /></Field>
        </div>
        <div className="form-row">
          <Field label={settings.labels.contact}>
            <select className="select" value={valueOf(form, 'contactId', opportunity?.contact?.id ?? defaults?.contactId)} onChange={event => set('contactId', event.target.value)}>
              <option value="">Sem vínculo</option>
              {opportunity?.contact && !people.contacts.some(item => item.id === opportunity.contact!.id) ? <option value={opportunity.contact.id}>{opportunity.contact.name}</option> : null}
              {people.contacts.map(item => <option key={item.id} value={item.id}>{item.name}{item.organization ? ` — ${item.organization.name}` : ''}</option>)}
            </select>
          </Field>
          <Field label={settings.labels.organization}>
            <select className="select" value={valueOf(form, 'organizationId', opportunity?.organization?.id ?? defaults?.organizationId)} onChange={event => set('organizationId', event.target.value)}>
              <option value="">{opportunity ? 'Sem vínculo' : 'A do contato (se houver)'}</option>
              {opportunity?.organization && !people.organizations.some(item => item.id === opportunity.organization!.id) ? <option value={opportunity.organization.id}>{opportunity.organization.name}</option> : null}
              {people.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <OwnerSelect settings={settings} value={valueOf(form, 'ownerId', opportunity?.owner?.id)} onChange={value => set('ownerId', value)} label={opportunity ? 'Responsável' : 'Responsável (padrão: você)'} />
          <SourceSelect settings={settings} value={valueOf(form, 'sourceId', opportunity?.source?.id)} onChange={value => set('sourceId', value)} />
        </div>
        <div className="form-row">
          <PrioritySelect value={valueOf(form, 'priority', opportunity?.priority)} onChange={value => set('priority', value)} />
          <TagsField value={(form.tags as string[] | undefined) ?? opportunity?.tags ?? []} onChange={value => set('tags', value)} />
        </div>
        <Field label="Observações"><textarea className="textarea" rows={3} value={valueOf(form, 'notes', opportunity?.notes)} maxLength={5000} onChange={event => set('notes', event.target.value)} /></Field>
        <CustomFields fields={fields} values={custom} onChange={(id, value) => state.setCustom({ ...custom, [id]: value })} />
      </div>
    </Dialog>
  );
}

// ————————————————— Mudar de etapa (regras da Base + motivo de perda) —————————————————

export interface MoveRequest { opportunity: Opportunity; stage: CrmStage; pipelineId: string; missing: string[]; beforeId?: string; }

/**
 * Aparece quando a etapa de destino exige campos ainda vazios ou é de perda. Envia o movimento com o
 * complemento numa única chamada (se a regra recusar, nada muda).
 */
export function MoveDialog({ settings, request, onClose, onDone }: { settings: CrmSettings; request: MoveRequest | null; onClose: () => void; onDone: (opportunity: Opportunity) => void }) {
  const toast = useToast();
  const state = useForm(!!request);
  const { form, set } = state;
  const people = usePeople(!!request && request.stage.requiredFields?.some(key => key === 'contactId' || key === 'organizationId') === true);
  if (!request) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  const { opportunity, stage } = request;
  const required = new Set(stage.requiredFields ?? []);
  const lost = stage.kind === 'lost';
  const customFields = settings.config.customFields.filter(field => field.entity === 'opportunity' && required.has(`custom.${field.id}`));
  const custom = state.custom ?? opportunity.custom ?? {};
  const move = async () => {
    state.setBusy(true); state.setError(null);
    const patchBody: Record<string, unknown> = {};
    if (required.has('value')) patchBody.value = numberOrNull(valueOf(form, 'value', moneyInput(opportunity.valueCents)));
    if (required.has('expectedCloseDate')) patchBody.expectedCloseDate = valueOf(form, 'expectedCloseDate', opportunity.expectedCloseDate);
    if (required.has('ownerId')) patchBody.ownerId = valueOf(form, 'ownerId', opportunity.owner?.id);
    if (required.has('contactId')) patchBody.contactId = valueOf(form, 'contactId', opportunity.contact?.id);
    if (required.has('organizationId')) patchBody.organizationId = valueOf(form, 'organizationId', opportunity.organization?.id);
    if (required.has('sourceId')) patchBody.sourceId = valueOf(form, 'sourceId', opportunity.source?.id);
    if (customFields.length) patchBody.custom = Object.fromEntries(customFields.map(field => [field.id, custom[field.id] ?? null]));
    try {
      const saved = await post<Opportunity>(`/api/crm/opportunities/${opportunity.id}/move`, {
        stageId: stage.id, pipelineId: request.pipelineId, ...(request.beforeId ? { beforeId: request.beforeId } : {}),
        ...(Object.keys(patchBody).length ? { patch: patchBody } : {}), ...(lost ? { lostReason: valueOf(form, 'lostReason'), lostNote: valueOf(form, 'lostNote') } : {}),
      });
      toast(`Movida para ${stage.name}.`);
      onDone(saved);
    } catch (cause) { state.setError(cause); } finally { state.setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={lost ? 'Registrar perda' : `Mover para ${stage.name}`}
      description={lost ? `${opportunity.title}: o motivo alimenta o relatório de perdas.` : `A etapa ${stage.name} pede estas informações (regra definida na Base).`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={state.busy} disabled={lost && !valueOf(form, 'lostReason')} onClick={move}>{lost ? 'Registrar perda' : 'Mover'}</Button></>}>
      <div className="form">
        {state.error ? <Notice>{errorMessage(state.error)}</Notice> : null}
        {lost ? (
          <>
            <Field label="Motivo"><select className="select" value={valueOf(form, 'lostReason')} onChange={event => set('lostReason', event.target.value)}><option value="">Escolha</option>{settings.config.lostReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></Field>
            <Field label="Observação (opcional)"><textarea className="textarea" rows={3} maxLength={1000} value={valueOf(form, 'lostNote')} onChange={event => set('lostNote', event.target.value)} /></Field>
          </>
        ) : null}
        {required.has('value') ? <Field label={`Valor (${settings.config.currency})`}><input className="input" type="number" min="0" step="0.01" value={valueOf(form, 'value', moneyInput(opportunity.valueCents))} onChange={event => set('value', event.target.value)} /></Field> : null}
        {required.has('expectedCloseDate') ? <Field label="Previsão de fechamento"><input className="input" type="date" value={valueOf(form, 'expectedCloseDate', opportunity.expectedCloseDate)} onChange={event => set('expectedCloseDate', event.target.value)} /></Field> : null}
        {required.has('ownerId') ? <OwnerSelect settings={settings} value={valueOf(form, 'ownerId', opportunity.owner?.id)} onChange={value => set('ownerId', value)} /> : null}
        {required.has('sourceId') ? <SourceSelect settings={settings} value={valueOf(form, 'sourceId', opportunity.source?.id)} onChange={value => set('sourceId', value)} /> : null}
        {required.has('contactId') ? (
          <Field label={settings.labels.contact}><select className="select" value={valueOf(form, 'contactId', opportunity.contact?.id)} onChange={event => set('contactId', event.target.value)}><option value="">Escolha</option>{people.contacts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        ) : null}
        {required.has('organizationId') ? (
          <Field label={settings.labels.organization}><select className="select" value={valueOf(form, 'organizationId', opportunity.organization?.id)} onChange={event => set('organizationId', event.target.value)}><option value="">Escolha</option>{people.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        ) : null}
        <CustomFields fields={customFields} values={custom} onChange={(id, value) => state.setCustom({ ...custom, [id]: value })} />
      </div>
    </Dialog>
  );
}

// ————————————————— Converter lead —————————————————

export function ConvertDialog({ settings, lead, matches, open, onClose, onDone }: { settings: CrmSettings; lead: Lead; matches: Array<{ id: string; name: string }>; open: boolean; onClose: () => void; onDone: (result: { contact: Contact; opportunity: Opportunity | null }) => void }) {
  const toast = useToast();
  const state = useForm(open);
  const { form, set } = state;
  const createOpportunity = form.createOpportunity !== false;
  const pipelineId = valueOf(form, 'pipelineId', settings.config.pipelines.find(item => item.default)?.id);
  const pipeline = settings.config.pipelines.find(item => item.id === pipelineId) ?? settings.config.pipelines[0];
  const convert = async () => {
    state.setBusy(true); state.setError(null);
    try {
      const result = await post<{ contact: Contact; opportunity: Opportunity | null }>(`/api/crm/leads/${lead.id}/convert`, {
        ...(valueOf(form, 'contactId') ? { contactId: valueOf(form, 'contactId') } : {}), createOpportunity,
        ...(createOpportunity ? { pipelineId, stageId: valueOf(form, 'stageId', pipeline?.stages.find(stage => stage.kind === 'open')?.id), title: valueOf(form, 'title', lead.company ?? lead.name), value: numberOrNull(valueOf(form, 'value')) } : {}),
      });
      toast(result.opportunity ? 'Lead convertido em contato e oportunidade.' : 'Lead convertido em contato.');
      onDone(result);
    } catch (cause) { state.setError(cause); } finally { state.setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Converter ${lead.name}`} description="O lead vira contato (ou é ligado a um existente) e, se quiser, abre uma oportunidade no funil. A atribuição da campanha acompanha." wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={state.busy} onClick={convert}>Converter</Button></>}>
      <div className="form">
        {state.error ? <Notice>{errorMessage(state.error)}</Notice> : null}
        <Field label={settings.labels.contact} help={matches.length ? 'Encontramos cadastro parecido (mesmo e-mail ou telefone). Nada é unido sem a sua escolha.' : 'Sem o e-mail em outro contato: um novo contato será criado.'}>
          <select className="select" value={valueOf(form, 'contactId')} onChange={event => set('contactId', event.target.value)}>
            <option value="">{lead.email ? 'Criar novo (ou ligar ao contato com o mesmo e-mail)' : 'Criar novo contato'}</option>
            {matches.map(match => <option key={match.id} value={match.id}>Ligar a: {match.name}</option>)}
          </select>
        </Field>
        <label className="checkbox"><input type="checkbox" checked={createOpportunity} onChange={event => set('createOpportunity', event.target.checked)} />Abrir {settings.labels.opportunity.toLowerCase()} no funil</label>
        {createOpportunity ? (
          <>
            <Field label="Título"><input className="input" value={valueOf(form, 'title', lead.company ?? lead.name)} maxLength={160} onChange={event => set('title', event.target.value)} /></Field>
            <div className="form-row">
              {settings.config.pipelines.length > 1 ? <Field label="Funil"><select className="select" value={pipelineId} onChange={event => { set('pipelineId', event.target.value); set('stageId', ''); }}>{settings.config.pipelines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : null}
              <Field label="Etapa"><select className="select" value={valueOf(form, 'stageId', pipeline?.stages.find(stage => stage.kind === 'open')?.id)} onChange={event => set('stageId', event.target.value)}>{pipeline?.stages.filter(stage => stage.kind === 'open').map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>
              <Field label={`Valor (${settings.config.currency}, opcional)`}><input className="input" type="number" min="0" step="0.01" value={valueOf(form, 'value')} onChange={event => set('value', event.target.value)} /></Field>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
