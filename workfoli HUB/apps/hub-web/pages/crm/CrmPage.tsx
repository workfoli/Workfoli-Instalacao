import { useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { Button, Empty, Loading, Notice, PageHead, useLoad } from '../../components/ui';
import { get } from '../../lib/api';
import { navigate } from '../../lib/router';
import type { CrmSettings } from '../../lib/crm';
import { BoardView } from './Board';
import { ConfigView } from './Config';
import { DetailView } from './Detail';
import { LeadDialog, OpportunityDialog } from './Forms';
import { RecordsView } from './Lists';
import { ResultsView } from './Results';

type Tab = 'funil' | 'leads' | 'contatos' | 'empresas' | 'resultados' | 'configuracao';
const DETAIL: Record<string, 'lead' | 'contact' | 'organization' | 'opportunity'> = { leads: 'lead', contatos: 'contact', empresas: 'organization', oportunidades: 'opportunity' };

/**
 * CRM: funil, leads, contatos, empresas, resultados e configuração. A estrutura (funis, etapas,
 * campos, origens, regras) vem da Base; os registros vivem no banco desta instância.
 */
export function CrmPage({ segments, query }: { segments: string[]; query: URLSearchParams }) {
  const { data: settings, error, loading, reload } = useLoad(() => get<CrmSettings>('/api/crm/config'));
  const [creating, setCreating] = useState<'lead' | 'opportunity' | null>(null);
  const [refresh, setRefresh] = useState(0);
  if (loading && !settings) return <Loading />;
  if (error || !settings) return <Notice>{error || 'Não foi possível carregar o CRM.'}</Notice>;
  const [section = 'funil', id] = segments;
  // Chave por registro: ir de um lead para a oportunidade dele remonta a tela (sem mostrar dados do anterior).
  if (id && DETAIL[section]) return <DetailView key={`${section}/${id}`} settings={settings} type={DETAIL[section]!} id={id} />;
  const tab = (['funil', 'leads', 'contatos', 'empresas', 'resultados', 'configuracao'] as Tab[]).includes(section as Tab) ? section as Tab : 'funil';
  const tabs: Array<[Tab, string]> = [
    ['funil', 'Funil'], ['leads', settings.labels.leads], ['contatos', settings.labels.contacts], ['empresas', settings.labels.organizations], ['resultados', 'Resultados'],
    ...(settings.canAdmin ? [['configuracao', 'Configuração'] as [Tab, string]] : []),
  ];
  return (
    <>
      <PageHead eyebrow="Operação" title={settings.moduleLabel}
        lead="Funil de vendas, leads e relacionamento. A estrutura é definida na Base da empresa; os registros ficam no banco desta instância, nunca em arquivos versionados."
        actions={settings.canWrite ? (
          <>
            <Button onClick={() => setCreating('lead')}><Plus size={16} />{settings.labels.lead}</Button>
            <Button variant="primary" onClick={() => setCreating('opportunity')}><Plus size={16} />{settings.labels.opportunity}</Button>
          </>
        ) : undefined} />
      <div className="tabs" role="tablist" aria-label="Seções do CRM">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => navigate(id === 'funil' ? '/crm' : `/crm/${id}`)}>{label}</button>)}
      </div>
      {tab === 'funil' ? <BoardView settings={settings} key={refresh} initialPipeline={query.get('funil') ?? undefined} />
        : tab === 'resultados' ? <ResultsView settings={settings} />
          : tab === 'configuracao' ? (settings.canAdmin ? <ConfigView settings={settings} onSaved={reload} />
            : <Empty icon={<Lock size={20} />} title="Sem acesso a esta área">A configuração do CRM exige a permissão de administrar o CRM.</Empty>)
            : <RecordsView settings={settings} kind={tab} key={`${tab}-${refresh}`} />}
      <LeadDialog settings={settings} open={creating === 'lead'} onClose={() => setCreating(null)} onSaved={lead => { setCreating(null); navigate(`/crm/leads/${lead.id}`); }} />
      <OpportunityDialog settings={settings} open={creating === 'opportunity'} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); setRefresh(value => value + 1); if (tab !== 'funil') navigate('/crm'); }} />
    </>
  );
}
