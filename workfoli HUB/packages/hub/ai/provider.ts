/**
 * Interface de provedor de IA. O provedor só recebe o contexto já filtrado pelas permissões do usuário
 * e só devolve TEXTO + RASCUNHOS de ações tipadas. Quem valida, pede confirmação, executa e audita é o Hub.
 */
export interface AiContext {
  company: { name: string; tagline: string | null; description: string | null; services: string[] } | null;
  user: { name: string; role: string };
  projects: Array<{ id: string; name: string; type: string; status: string }> | null;
  tasks: { open: number; doing: number; items: Array<{ title: string; dueDate: string | null; status: string }> } | null;
  baseTasks: string[] | null;
  /** Resumo do CRM: contagens (nunca dados pessoais), vocabulário da empresa e origens configuradas. */
  crm: {
    pipeline: string; openOpportunities: number; byStage: Record<string, number>; stages: string[]; leadsOpen: number; contacts: number;
    labels: { contact: string; contacts: string; lead: string; leads: string; opportunity: string; opportunities: string };
    sources: Array<{ id: string; label: string }>;
  } | null;
  knowledge: string[] | null;
  integrations: Array<{ provider: string; label: string; state: string }> | null;
  modules: { active: string[]; planned: string[]; custom: Array<{ id: string; label: string }> };
  /** Ações que ESTE usuário pode ter executadas (ai:act + permissão da ação). */
  actions: string[];
  today: string;
}

export interface AiDraft { type: string; payload: Record<string, unknown>; }
export interface AiResponse { reply: string; drafts: AiDraft[]; }

export interface AiProvider {
  readonly id: string;
  readonly label: string;
  /** true quando o contexto sai da máquina/instância (exige autorização explícita na configuração). */
  readonly external: boolean;
  respond(input: { text: string; context: AiContext }): Promise<AiResponse>;
}
