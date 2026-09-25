import { useState } from 'react';
import { Building2, Contact as ContactIcon, Inbox, Plus } from 'lucide-react';
import { Button, Empty, Loading, Notice, Tag, useLoad } from '../../components/ui';
import { get } from '../../lib/api';
import { formatDate, relative } from '../../lib/format';
import { navigate } from '../../lib/router';
import { LEAD_STATUS, RELATIONSHIPS, entityHref } from '../../lib/crm';
import type { Contact, CrmSettings, Lead, Organization } from '../../lib/crm';
import { ContactDialog, OrganizationDialog } from './Forms';

type Kind = 'leads' | 'contatos' | 'empresas';
const PATHS: Record<Kind, string> = { leads: 'leads', contatos: 'contacts', empresas: 'organizations' };

export function RecordsView({ settings, kind }: { settings: CrmSettings; kind: Kind }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(kind === 'leads' ? 'active' : '');
  const [source, setSource] = useState('');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(status && kind === 'leads' ? { status } : {}), ...(status && kind === 'contatos' ? { relationship: status } : {}), ...(source ? { sourceId: source } : {}), ...(archived ? { archived: '1' } : {}) });
  const { data, error, loading } = useLoad(() => get<{ items: Array<Lead | Contact | Organization> }>(`/api/crm/${PATHS[kind]}?${params.toString()}`), [kind, params.toString()]);
  const title = kind === 'leads' ? settings.labels.leads : kind === 'contatos' ? settings.labels.contacts : settings.labels.organizations;
  return (
    <>
      <div className="filter-row" role="group" aria-label={`Filtros de ${title}`}>
        <input className="input" style={{ minWidth: 220 }} placeholder="Buscar por nome, e-mail, telefone ou empresa" defaultValue={q} aria-label="Buscar"
          onKeyDown={event => { if (event.key === 'Enter') setQ((event.target as HTMLInputElement).value); }} onBlur={event => setQ(event.target.value)} />
        {kind === 'leads' ? (
          <select className="select" value={status} onChange={event => setStatus(event.target.value)} aria-label="Situação">
            <option value="active">Em aberto</option>{Object.entries(LEAD_STATUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}<option value="">Todos</option>
          </select>
        ) : kind === 'contatos' ? (
          <select className="select" value={status} onChange={event => setStatus(event.target.value)} aria-label="Relação">
            <option value="">Todas as relações</option>{Object.entries(RELATIONSHIPS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        ) : null}
        <select className="select" value={source} onChange={event => setSource(event.target.value)} aria-label="Origem">
          <option value="">Todas as origens</option>{settings.sources.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <label className="checkbox small"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Arquivados</label>
        {kind !== 'leads' && settings.canWrite ? <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} />{kind === 'contatos' ? settings.labels.contact : settings.labels.organization}</Button> : null}
      </div>
      {error ? <Notice>{error}</Notice> : loading && !data ? <Loading /> : !data?.items.length ? (
        <Empty icon={kind === 'leads' ? <Inbox size={20} /> : kind === 'contatos' ? <ContactIcon size={20} /> : <Building2 size={20} />} title={q || source || archived ? 'Nada encontrado' : `Nenhum registro em ${title.toLowerCase()}`}>
          {kind === 'leads' && !q ? 'Leads chegam pelo cadastro manual, pela IA ou pelos formulários conectados (Meta Lead Ads).' : null}
        </Empty>
      ) : (
        <div className={`table-wrap${loading ? ' refreshing' : ''}`}>
          <table className="table">
            {kind === 'leads' ? (
              <>
                <thead><tr><th>Nome</th><th className="hide-mobile">Empresa</th><th>Origem</th><th>Situação</th><th className="hide-mobile">Responsável</th><th>Recebido</th></tr></thead>
                <tbody>{(data.items as Lead[]).map(lead => (
                  <tr key={lead.id} className="clickable" onClick={() => navigate(`/crm/leads/${lead.id}`)}>
                    <td><a href={entityHref('lead', lead.id)} onClick={event => event.stopPropagation()}>{lead.name}</a>{lead.tags.length ? <div className="faint">{lead.tags.join(', ')}</div> : null}</td>
                    <td className="hide-mobile">{lead.company ?? '—'}</td>
                    <td>{lead.source?.label ?? '—'}{lead.attribution.campaignName ? <div className="faint">{lead.attribution.campaignName}</div> : null}</td>
                    <td><Tag tone={lead.status === 'new' ? 'accent' : lead.status === 'converted' || lead.status === 'disqualified' ? 'outline' : undefined}>{LEAD_STATUS[lead.status]}</Tag></td>
                    <td className="hide-mobile">{lead.owner?.name ?? '—'}</td>
                    <td title={formatDate(lead.createdAt)}>{relative(lead.createdAt)}</td>
                  </tr>
                ))}</tbody>
              </>
            ) : kind === 'contatos' ? (
              <>
                <thead><tr><th>Nome</th><th className="hide-mobile">{settings.labels.organization}</th><th>Relação</th><th className="hide-mobile">Contato</th><th className="num">Em aberto</th></tr></thead>
                <tbody>{(data.items as Contact[]).map(contact => (
                  <tr key={contact.id} className="clickable" onClick={() => navigate(`/crm/contatos/${contact.id}`)}>
                    <td><a href={entityHref('contact', contact.id)} onClick={event => event.stopPropagation()}>{contact.name}</a>{contact.jobTitle ? <div className="faint">{contact.jobTitle}</div> : null}</td>
                    <td className="hide-mobile">{contact.organization?.name ?? '—'}</td>
                    <td><Tag tone={contact.relationship === 'customer' ? 'accent' : 'outline'}>{RELATIONSHIPS[contact.relationship] ?? contact.relationship}</Tag></td>
                    <td className="hide-mobile">{contact.email ?? contact.phone ?? '—'}</td>
                    <td className="num">{contact.openOpportunities}</td>
                  </tr>
                ))}</tbody>
              </>
            ) : (
              <>
                <thead><tr><th>Nome</th><th className="hide-mobile">Site</th><th className="num">{settings.labels.contacts}</th><th className="num">Em aberto</th><th className="hide-mobile">Atualizado</th></tr></thead>
                <tbody>{(data.items as Organization[]).map(organization => (
                  <tr key={organization.id} className="clickable" onClick={() => navigate(`/crm/empresas/${organization.id}`)}>
                    <td><a href={entityHref('organization', organization.id)} onClick={event => event.stopPropagation()}>{organization.name}</a></td>
                    <td className="hide-mobile">{organization.website ?? '—'}</td>
                    <td className="num">{organization.contacts}</td>
                    <td className="num">{organization.openOpportunities}</td>
                    <td className="hide-mobile">{relative(organization.updatedAt)}</td>
                  </tr>
                ))}</tbody>
              </>
            )}
          </table>
        </div>
      )}
      {kind === 'contatos' ? <ContactDialog settings={settings} open={creating} onClose={() => setCreating(false)} onSaved={contact => { setCreating(false); navigate(`/crm/contatos/${contact.id}`); }} /> : null}
      {kind === 'empresas' ? <OrganizationDialog settings={settings} open={creating} onClose={() => setCreating(false)} onSaved={organization => { setCreating(false); navigate(`/crm/empresas/${organization.id}`); }} /> : null}
      {data && data.items.length >= 200 ? <p className="faint">Mostrando os 200 mais recentes. Refine a busca para encontrar outros.</p> : null}
    </>
  );
}
