import { CRM_CORE_SOURCES, resolveCrmConfig } from '../../contract/workfoli-contract.mjs';
import type { CrmConfig, CrmLabelKey, CrmPipeline, CrmSource, CrmStage } from '../../contract/workfoli-contract.mjs';
import { HttpError } from '../http.js';
import type { HubRuntime } from '../runtime.js';

/**
 * Configuração efetiva do CRM desta instância. A estrutura (funis, etapas, campos, origens, regras)
 * vem SEMPRE da Base; o banco só guarda dados vivos. Sem Base legível, vale o padrão genérico.
 */
export function crmConfig(runtime: HubRuntime): CrmConfig {
  let manifest;
  try { manifest = runtime.base.snapshot().manifest; } catch { manifest = undefined; }
  return resolveCrmConfig(manifest);
}

export function crmModuleLabel(runtime: HubRuntime): string {
  try { return runtime.base.snapshot().manifest.modules.settings?.crm?.label ?? 'CRM'; } catch { return 'CRM'; }
}

export const DEFAULT_LABELS: Readonly<Record<CrmLabelKey, string>> = Object.freeze({
  contact: 'Contato', contacts: 'Contatos', organization: 'Empresa', organizations: 'Empresas',
  lead: 'Lead', leads: 'Leads', opportunity: 'Oportunidade', opportunities: 'Oportunidades',
});

export function crmLabels(config: CrmConfig): Record<CrmLabelKey, string> {
  return { ...DEFAULT_LABELS, ...config.labels };
}

export interface SourceView extends CrmSource { core: boolean; }

export function crmSources(config: CrmConfig): SourceView[] {
  return [...CRM_CORE_SOURCES.map(source => ({ ...source, core: true })), ...config.sources.map(source => ({ ...source, core: false }))];
}

export function sourceLabel(config: CrmConfig, id: string | null): string | null {
  if (!id) return null;
  return crmSources(config).find(source => source.id === id)?.label ?? id;
}

export function defaultPipeline(config: CrmConfig): CrmPipeline {
  const pipeline = config.pipelines.find(item => item.default) ?? config.pipelines[0];
  if (!pipeline) throw new HttpError(409, 'O CRM não tem funil configurado na Base.');
  return pipeline;
}

export function pipelineOf(config: CrmConfig, id: unknown): CrmPipeline {
  if (id === undefined || id === null || id === '') return defaultPipeline(config);
  const pipeline = typeof id === 'string' ? config.pipelines.find(item => item.id === id) : undefined;
  if (!pipeline) throw new HttpError(400, 'Funil inexistente na configuração do CRM.');
  return pipeline;
}

export function stageOf(pipeline: CrmPipeline, id: unknown): CrmStage {
  const stage = typeof id === 'string' ? pipeline.stages.find(item => item.id === id) : undefined;
  if (!stage) throw new HttpError(400, `Etapa inexistente no funil "${pipeline.name}".`);
  return stage;
}

export function firstOpenStage(pipeline: CrmPipeline): CrmStage {
  return pipeline.stages.find(stage => stage.kind === 'open') ?? pipeline.stages[0]!;
}

/** Localiza a etapa de uma oportunidade; `null` quando a Base não tem mais essa etapa (fica visível para ser movida). */
export function findStage(config: CrmConfig, pipelineId: string, stageId: string): { pipeline: CrmPipeline; stage: CrmStage } | null {
  const pipeline = config.pipelines.find(item => item.id === pipelineId);
  const stage = pipeline?.stages.find(item => item.id === stageId);
  return pipeline && stage ? { pipeline, stage } : null;
}

export const REQUIRED_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  value: 'Valor', expectedCloseDate: 'Previsão de fechamento', ownerId: 'Responsável', contactId: 'Contato',
  organizationId: 'Empresa', priority: 'Prioridade', sourceId: 'Origem',
});
