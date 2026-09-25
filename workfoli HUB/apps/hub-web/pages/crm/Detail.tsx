import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Trash2, UserCheck, UserX } from 'lucide-react';
import { Button, Card, Dialog, Field, Loading, Notice, PageHead, Tag, useLoad, useToast } from '../../components/ui';
import { ActivityComposer, Attachments, AttributionFacts, CustomFacts, FactRow, LinkedTasks, PurgeDialog, Timeline } from '../../components/crm';
import { errorMessage, get, post } from '../../lib/api';
import { formatDate, relative } from '../../lib/format';
import { navigate } from '../../lib/router';
import { ENTITY_PATHS, LEAD_STATUS, OPPORTUNITY_STATUS, PRIORITIES, RELATIONSHIPS, entityHref, missingForStage, money } from '../../lib/crm';
import type { Attachment, Contact, CrmSettings, CrmStage, EntityType, Lead, Opportunity, Organization, TimelineEntry } from '../../lib/crm';
import type { Task } from '../../lib/types';
import { ContactDialog, ConvertDialog, LeadDialog, MoveDialog, OpportunityDialog, OrganizationDialog } from './Forms';
import type { MoveRequest } from './Forms';

interface Related { timeline: TimelineEntry[]; tasks: Task[] | null; attachments: Attachment[]; }
type DetailData = Related & {
  lead?: Lead; matches?: Array<{ id: string; name: string }>;
  contact?: Contact | null; opportunities?: Opportunity[]; leads?: Lead[];
  organization?: Organization | null; contacts?: Contact[];
  opportunity?: Opportunity;
};

const BACK: Record<EntityType, string> = { lead: '/crm/leads', contact: '/crm/contatos', organization: '/crm/empresas', opportunity: '/crm' };

export function DetailView({ settings, type, id }: { settings: CrmSettings; type: EntityType; id: string }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => get<DetailData>(`/api/crm/${ENTITY_PATHS[type]}/${id}`), [type, id]);
  const [dialog, setDialog] = useState<'edit' | 'convert' | 'disqualify' | 'purge' | 'opportunity' | null>(null);
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  if (error || !data) return <><a className="btn btn-ghost btn-sm" href={`#${BACK[type]}`}><ArrowLeft size={14} />Voltar</a><Notice>{error || 'Registro não encontrado.'}</Notice></>;
  const record = type === 'lead' ? data.lead : type === 'contact' ? data.contact : type === 'organization' ? data.organization : data.opportunity;
  if (!record) return <Loading />;
  const name = 'title' in record ? record.title : record.name;
  const archived = !!record.archivedAt;
  const canWrite = settings.canWrite;
  const fields = settings.config.customFields.filter(field => field.entity === type);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setActionError('');
    try { await action(); toast(message); setDialog(null); reload(); } catch (cause) { setActionError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const changeStage = (current: Opportunity, stage: CrmStage, pipelineId: string) => {
    if (stage.id === current.stageId) return;
    if (stage.kind === 'lost' || missingForStage(current, stage).length) { setMove({ opportunity: current, stage, pipelineId, missing: [] }); return; }
    void run(() => post(`/api/crm/opportunities/${current.id}/move`, { stageId: stage.id, pipelineId }), `Movida para ${stage.name}.`);
  };
  const archive = () => run(() => post(`/api/crm/${ENTITY_PATHS[type]}/${id}/${archived ? 'restore' : 'archive'}`), archived ? 'Restaurado.' : 'Arquivado (nada foi apagado).');

  const opportunity = data.opportunity;
  const pipeline = opportunity ? settings.config.pipelines.find(item => item.id === opportunity.pipelineId) : undefined;
  const lead = data.lead;
  const eyebrow = type === 'opportunity' ? `${settings.labels.opportunity}${opportunity?.pipelineName ? ` · ${opportunity.pipelineName}` : ''}` : type === 'lead' ? settings.labels.lead : type === 'contact' ? settings.labels.contact : settings.labels.organization;
  const statusTag = type === 'lead' && lead ? <Tag tone={lead.status === 'new' ? 'accent' : 'outline'}>{LEAD_STATUS[lead.status]}</Tag>
    : type === 'opportunity' && opportunity ? <Tag tone={opportunity.status === 'won' ? 'accent' : 'outline'}>{opportunity.stage?.name ?? 'Etapa fora da configuração'} · {OPPORTUNITY_STATUS[opportunity.status]}</Tag>
      : type === 'contact' && data.contact ? <Tag tone={data.contact.relationship === 'customer' ? 'accent' : 'outline'}>{RELATIONSHIPS[data.contact.relationship]}</Tag> : null;

  return (
    <>
      <a className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} href={`#${BACK[type]}`}><ArrowLeft size={14} />{type === 'opportunity' ? 'Funil' : type === 'lead' ? settings.labels.leads : type === 'contact' ? settings.labels.contacts : settings.labels.organizations}</a>
      <PageHead eyebrow={eyebrow} title={<>{name} {statusTag}{archived ? <Tag tone="outline">Arquivado</Tag> : null}</>}
        lead={type === 'opportunity' && opportunity && (opportunity.valueCents !== null || opportunity.expectedCloseDate) ? [opportunity.valueCents !== null ? money(opportunity.valueCents, opportunity.currency) : null, opportunity.expectedCloseDate ? `previsão ${formatDate(opportunity.expectedCloseDate)}` : null].filter(Boolean).join(' · ') : undefined}
        actions={canWrite ? (
          <>
            {type === 'lead' && lead && !archived && lead.status !== 'converted' && lead.status !== 'disqualified' ? <Button variant="primary" onClick={() => setDialog('convert')}><UserCheck size={16} />Converter</Button> : null}
            {type === 'lead' && lead && lead.status !== 'converted' && lead.status !== 'disqualified' ? <Button onClick={() => setDialog('disqualify')}><UserX size={16} />Descartar</Button> : null}
            {type === 'lead' && lead?.status === 'disqualified' ? <Button onClick={() => run(() => post(`/api/crm/leads/${id}/reopen`), 'Lead reativado.')}>Reativar</Button> : null}
            {(type === 'contact' || type === 'organization') && !archived ? <Button onClick={() => setDialog('opportunity')}>Nova oportunidade</Button> : null}
            <Button onClick={() => setDialog('edit')}><Pencil size={15} />Editar</Button>
            <Button variant="ghost" onClick={archive} busy={busy}>{archived ? <><ArchiveRestore size={15} />Restaurar</> : <><Archive size={15} />Arquivar</>}</Button>
            {settings.canAdmin && type !== 'opportunity' ? <Button variant="ghost" onClick={() => setDialog('purge')}><Trash2 size={15} />Excluir</Button> : null}
          </>
        ) : undefined} />
      {actionError ? <Notice>{actionError}</Notice> : null}
      {type === 'opportunity' && opportunity && canWrite && pipeline ? (
        <div className="filter-row" role="group" aria-label="Etapa">
          <span className="faint">Etapa</span>
          <div className="segmented" style={{ flexWrap: 'wrap' }}>
            {pipeline.stages.map(stage => (
              <button key={stage.id} type="button" aria-pressed={stage.id === opportunity.stageId} disabled={busy} onClick={() => changeStage(opportunity, stage, pipeline.id)}>{stage.name}</button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="detail">
        <div className="stack" style={{ gap: 20 }}>
          <Card title="Informações">
            <dl className="facts">
              {type === 'lead' && lead ? <>
                <FactRow label="E-mail">{lead.email ?? '—'}</FactRow><FactRow label="Telefone">{lead.phone ?? '—'}</FactRow><FactRow label="Empresa">{lead.company ?? '—'}</FactRow>
                <FactRow label="Origem">{lead.source?.label ?? '—'}{lead.integration ? ` (integração ${lead.integration.provider})` : ''}</FactRow>
                <FactRow label="Responsável">{lead.owner?.name ?? '—'}</FactRow><FactRow label="Prioridade">{PRIORITIES[lead.priority]}</FactRow>
                <FactRow label="Recebido">{formatDate(lead.createdAt)} ({relative(lead.createdAt)})</FactRow>
                {lead.contact ? <FactRow label="Contato">{<a href={entityHref('contact', lead.contact.id)}>{lead.contact.name}</a>}</FactRow> : null}
                {lead.opportunity ? <FactRow label="Oportunidade">{<a href={entityHref('opportunity', lead.opportunity.id)}>{lead.opportunity.name}</a>}</FactRow> : null}
                {lead.disqualifyReason ? <FactRow label="Motivo do descarte">{lead.disqualifyReason}</FactRow> : null}
                {lead.message ? <FactRow label="Mensagem"><span style={{ whiteSpace: 'pre-wrap' }}>{lead.message}</span></FactRow> : null}
              </> : null}
              {type === 'contact' && data.contact ? <>
                <FactRow label="E-mail">{data.contact.email ?? '—'}</FactRow><FactRow label="Telefone">{data.contact.phone ?? '—'}</FactRow>
                <FactRow label={settings.labels.organization}>{data.contact.organization ? <a href={entityHref('organization', data.contact.organization.id)}>{data.contact.organization.name}</a> : '—'}</FactRow>
                <FactRow label="Cargo">{data.contact.jobTitle ?? '—'}</FactRow><FactRow label="Origem">{data.contact.source?.label ?? '—'}</FactRow><FactRow label="Responsável">{data.contact.owner?.name ?? '—'}</FactRow>
                {data.contact.notes ? <FactRow label="Observações"><span style={{ whiteSpace: 'pre-wrap' }}>{data.contact.notes}</span></FactRow> : null}
              </> : null}
              {type === 'organization' && data.organization ? <>
                <FactRow label="Site">{data.organization.website ? <a href={data.organization.website} target="_blank" rel="noopener noreferrer">{data.organization.website}</a> : '—'}</FactRow>
                <FactRow label="E-mail">{data.organization.email ?? '—'}</FactRow><FactRow label="Telefone">{data.organization.phone ?? '—'}</FactRow>
                <FactRow label="Origem">{data.organization.source?.label ?? '—'}</FactRow><FactRow label="Responsável">{data.organization.owner?.name ?? '—'}</FactRow>
                {data.organization.notes ? <FactRow label="Observações"><span style={{ whiteSpace: 'pre-wrap' }}>{data.organization.notes}</span></FactRow> : null}
              </> : null}
              {type === 'opportunity' && opportunity ? <>
                <FactRow label="Valor">{money(opportunity.valueCents, opportunity.currency)}</FactRow><FactRow label="Previsão">{formatDate(opportunity.expectedCloseDate)}</FactRow>
                <FactRow label={settings.labels.contact}>{opportunity.contact ? <a href={entityHref('contact', opportunity.contact.id)}>{opportunity.contact.name}</a> : '—'}</FactRow>
                <FactRow label={settings.labels.organization}>{opportunity.organization ? <a href={entityHref('organization', opportunity.organization.id)}>{opportunity.organization.name}</a> : '—'}</FactRow>
                <FactRow label="Responsável">{opportunity.owner?.name ?? '—'}</FactRow><FactRow label="Origem">{opportunity.source?.label ?? '—'}</FactRow>
                <FactRow label="Prioridade">{PRIORITIES[opportunity.priority]}</FactRow><FactRow label="Na etapa desde">{formatDate(opportunity.stageEnteredAt)}</FactRow>
                {opportunity.lostReason ? <FactRow label="Motivo da perda">{opportunity.lostReason}{opportunity.lostNote ? ` — ${opportunity.lostNote}` : ''}</FactRow> : null}
                {opportunity.leadId && data.lead ? <FactRow label="Lead de origem"><a href={entityHref('lead', opportunity.leadId)}>{data.lead.name}</a></FactRow> : null}
                {opportunity.notes ? <FactRow label="Observações"><span style={{ whiteSpace: 'pre-wrap' }}>{opportunity.notes}</span></FactRow> : null}
              </> : null}
              <CustomFacts fields={fields} values={record.custom} />
              {record.tags.length ? <FactRow label="Etiquetas"><span className="row" style={{ gap: 6 }}>{record.tags.map(tag => <Tag key={tag} tone="outline">{tag}</Tag>)}</span></FactRow> : null}
            </dl>
            {'attribution' in record ? <div style={{ marginTop: 16 }}><AttributionFacts attribution={record.attribution} /></div> : null}
          </Card>
          {data.opportunities && data.opportunities.length ? (
            <Card title={settings.labels.opportunities} meta={`${data.opportunities.length}`}>
              <div className="list">{data.opportunities.map(item => (
                <a key={item.id} className="list-item" href={entityHref('opportunity', item.id)} style={{ textDecoration: 'none' }}>
                  <div className="grow"><div className="title">{item.title}</div><div className="sub">{item.stage?.name ?? 'Etapa fora da configuração'} · {money(item.valueCents, item.currency)}</div></div>
                  <Tag tone={item.status === 'won' ? 'accent' : 'outline'}>{OPPORTUNITY_STATUS[item.status]}</Tag>
                </a>
              ))}</div>
            </Card>
          ) : null}
          {data.contacts && data.contacts.length ? (
            <Card title={settings.labels.contacts} meta={`${data.contacts.length}`}>
              <div className="list">{data.contacts.map(item => (
                <a key={item.id} className="list-item" href={entityHref('contact', item.id)} style={{ textDecoration: 'none' }}>
                  <div className="grow"><div className="title">{item.name}</div><div className="sub">{item.jobTitle ?? item.email ?? '—'}</div></div>
                </a>
              ))}</div>
            </Card>
          ) : null}
          <Card title="Histórico" meta="Quem, quando, o quê e de onde">
            {canWrite && !archived ? <div style={{ marginBottom: 18 }}><ActivityComposer type={type} id={id} onDone={reload} /></div> : null}
            <Timeline entries={data.timeline} self={{ type, id }} />
          </Card>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card title="Tarefas"><LinkedTasks type={type} id={id} tasks={data.tasks} canWrite={canWrite && !archived} onChange={reload} /></Card>
          <Card title="Anexos"><Attachments type={type} id={id} items={data.attachments} canWrite={canWrite && !archived} onChange={reload} /></Card>
          <p className="faint">Criado {relative(record.createdAt)}{record.origin !== 'hub' ? ` · origem: ${record.origin.replace('integration:', 'integração ').replace('ai', 'IA').replace('migration', 'migração')}` : ''} · atualizado {relative(record.updatedAt)}</p>
        </div>
      </div>

      {type === 'lead' && lead ? <LeadDialog settings={settings} lead={lead} open={dialog === 'edit'} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} /> : null}
      {type === 'contact' && data.contact ? <ContactDialog settings={settings} contact={data.contact} open={dialog === 'edit'} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} /> : null}
      {type === 'organization' && data.organization ? <OrganizationDialog settings={settings} organization={data.organization} open={dialog === 'edit'} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} /> : null}
      {type === 'opportunity' && opportunity ? <OpportunityDialog settings={settings} opportunity={opportunity} open={dialog === 'edit'} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} /> : null}
      {(type === 'contact' || type === 'organization') ? (
        <OpportunityDialog settings={settings} open={dialog === 'opportunity'} defaults={type === 'contact' ? { contactId: id } : { organizationId: id }} onClose={() => setDialog(null)} onSaved={saved => { setDialog(null); navigate(`/crm/oportunidades/${saved.id}`); }} />
      ) : null}
      {type === 'lead' && lead ? <ConvertDialog settings={settings} lead={lead} matches={data.matches ?? []} open={dialog === 'convert'} onClose={() => setDialog(null)} onDone={result => { setDialog(null); navigate(result.opportunity ? `/crm/oportunidades/${result.opportunity.id}` : `/crm/contatos/${result.contact.id}`); }} /> : null}
      <Dialog open={dialog === 'disqualify'} title="Descartar lead" description="O lead sai da fila, com o motivo registrado. Pode ser reativado depois." onClose={() => setDialog(null)}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!reason.trim()} onClick={() => run(() => post(`/api/crm/leads/${id}/disqualify`, { reason }), 'Lead descartado.')}>Descartar</Button></>}>
        <Field label="Motivo"><input className="input" value={reason} maxLength={200} onChange={event => setReason(event.target.value)} placeholder="Ex.: fora do perfil, contato inválido" /></Field>
      </Dialog>
      {type !== 'opportunity' ? <PurgeDialog open={dialog === 'purge'} type={type} id={id} name={name} onClose={() => setDialog(null)} onDone={() => { toast('Excluído definitivamente.'); navigate(BACK[type]); }} /> : null}
      <MoveDialog settings={settings} request={move} onClose={() => setMove(null)} onDone={() => { setMove(null); reload(); }} />
    </>
  );
}
