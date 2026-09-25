import { Blocks, ExternalLink } from 'lucide-react';
import type { ImportReport } from '../../../packages/contracts';
import { declaredModules } from '../../../packages/core/base-manifest';
import { isModuleId, MODULE_REGISTRY } from '../../../packages/core/modules';

const profiles: Record<string, string> = { general: 'Empresa', services: 'Serviços', agency: 'Agência', clinic: 'Clínica', development: 'Desenvolvimento', retail: 'Varejo' };
export default function BaseSummary({ base, onEvidence }: { base: ImportReport['base']; onEvidence: (id: string) => void }) {
  if (!base) return null;
  const modules = declaredModules(base.manifest).filter(isModuleId);
  return <section className="base-summary content-panel"><Blocks size={20} /><div><strong>Base da empresa reconhecida</strong><p>{profiles[base.manifest.profile] ?? 'Empresa'} · {base.manifest.company.name}</p><div className="base-modules">{modules.map(id => <span className="tag" key={id}>{MODULE_REGISTRY[id].label}</span>)}</div></div><button className="text-button" onClick={() => onEvidence(base.evidence.fileId)}>Ver identificação <ExternalLink size={14} /></button></section>;
}
