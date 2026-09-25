import { ExternalLink } from 'lucide-react';
import { Card, Empty, Loading, Notice, PageHead, Tag, useLoad } from '../components/ui';
import { get } from '../lib/api';
import { SERVICE_STATUS } from '../lib/format';
import type { CompanyView } from '../lib/types';

const COLOR_LABELS: Record<string, string> = { background: 'Fundo', surface: 'Superfície', text: 'Texto', textSecondary: 'Texto secundário', accent: 'Acento' };

export function CompanyPage() {
  const { data, error, loading } = useLoad(() => get<CompanyView>('/api/company'));
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar a empresa.'}</Notice>;
  const { company, identity } = data;
  const colors = Object.entries(identity.colors);
  const voice = identity.voice;
  const main = data.services.filter(service => !service.transversal);
  const transversal = data.services.filter(service => service.transversal);
  return (
    <>
      <PageHead eyebrow="Empresa" title={company.name} lead={company.description ?? company.tagline ?? undefined}
        actions={company.website ? <a className="btn btn-secondary" href={company.website} target="_blank" rel="noopener noreferrer">Site <ExternalLink size={14} /></a> : undefined} />
      {voice.tagline || voice.message || voice.concept ? (
        <div className="grid grid-3">
          {voice.tagline ? <Card title="Tagline"><p className="muted">{voice.tagline}</p></Card> : null}
          {voice.message ? <Card title="Mensagem"><p className="muted">{voice.message}</p></Card> : null}
          {voice.concept ? <Card title="Conceito"><p className="muted">{voice.concept}</p></Card> : null}
        </div>
      ) : null}
      {voice.method?.length ? (
        <div className="method" aria-label="Método">{voice.method.map((step, index) => <div className="step" key={step}><span className="n">{String(index + 1).padStart(2, '0')}</span><span className="name">{step}</span></div>)}</div>
      ) : null}
      <Card title="Serviços" meta={`${data.services.length} registrado(s) na Base`}>
        {main.length ? (
          <div className="grid grid-3">{main.map(service => (
            <div key={service.id} className="card flat" style={{ padding: 18 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h3>{service.name}</h3>{service.status !== 'active' ? <Tag tone="outline">{SERVICE_STATUS[service.status]}</Tag> : null}</div>
              {service.summary ? <p className="muted small">{service.summary}</p> : null}
            </div>
          ))}</div>
        ) : <Empty title="Nenhum serviço registrado">Serviços vêm do manifesto da Base (services).</Empty>}
        {transversal.length ? (
          <div className="stack" style={{ marginTop: 18 }}>
            <div className="nav-label" style={{ padding: 0 }}>Camadas transversais e entregas adicionais</div>
            {transversal.map(service => <div key={service.id} className="list-item"><div className="grow"><div className="title">{service.name}</div>{service.summary ? <div className="sub">{service.summary}</div> : null}</div></div>)}
          </div>
        ) : null}
      </Card>
      <div className="grid grid-2">
        <Card title="Identidade visual" meta={identity.typography.heading ? `Tipografia: ${identity.typography.heading}${identity.typography.body && identity.typography.body !== identity.typography.heading ? ` / ${identity.typography.body}` : ''}` : undefined}>
          {colors.length ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 14 }}>
              {colors.map(([key, value]) => <div className="swatch" key={key}><div className="chip" style={{ background: value }} /><span className="small">{COLOR_LABELS[key] ?? key}</span><span className="hex">{value}</span></div>)}
            </div>
          ) : <p className="muted">Cores ainda não registradas no manifesto.</p>}
          {identity.symbol || identity.logo ? <div className="row" style={{ marginTop: 18 }}>{[identity.symbol, identity.logo].filter(Boolean).map(url => <img key={url!} src={url!} alt="" style={{ height: 64, borderRadius: 8, border: '1px solid var(--line)' }} />)}</div> : null}
        </Card>
        <Card title="Canais e referências">
          {data.resources.length ? <div className="list">{data.resources.map(resource => (
            <div key={resource.id} className="list-item">
              <div className="grow"><div className="title">{resource.label}</div><div className="sub">{resource.url ?? resource.path}</div></div>
              {resource.url ? <a className="icon-btn sm" href={resource.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${resource.label}`}><ExternalLink size={15} /></a> : null}
            </div>
          ))}</div> : <p className="muted">Nenhum canal registrado.</p>}
        </Card>
      </div>
    </>
  );
}
