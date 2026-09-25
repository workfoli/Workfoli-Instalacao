# Roadmap

Versão atual do Core: **0.4.0** (2026-09-24). Itens só são marcados como feitos com implementação e teste.

## Feito na 0.4.0

- Contrato 3.0 (manifesto v3 com a seção `crm`; v1/v2 convertidos com aviso) e banco v2 (CRM, integrações, marketing), com migração dos contatos antigos e cópia prévia.
- **CRM nativo e genérico**: funis e etapas editáveis com regras, ganho/perda com motivo, leads e conversão, contatos, empresas, histórico completo, automações declarativas, etiquetas, anexos, tarefas ligadas, resultados, arquivamento e exclusão LGPD — [crm.md](crm.md).
- **Integrações por empresa**: cofre de tokens (AES-256-GCM + DPAPI), OAuth com `state`/PKCE no navegador do sistema (Google, Meta, GitHub), Vercel/Cloudflare/Supabase por token, adaptadores Google Ads, GA4, Search Console, Meta Ads e formulários de lead da Meta, sincronização e revogação — [integracoes.md](integracoes.md).
- **Marketing** disponível: dado da plataforma × CRM × cálculo da Workfoli.
- Papel **Gestor Workfoli** (acesso de serviço concedido só pelo proprietário).
- IA propõe lead e oportunidade; responde sobre o funil com contagens.
- Template da Base 3.0 com o CRM padrão.

## Feito na 0.3.0

- Contrato Base ↔ Hub v2 (validador compartilhado, schemas, migração v1).
- Template da Base 2.0 com manifesto, pastas de contexto e skills integradas ao contrato.
- CLI de ciclo de vida: `init`, `base init|validate|upgrade`, `hub install|sync|start|owner|invite|pair-code`, `agent pair|run`, `doctor`, `update`, `secrets`.
- Hub web por empresa: visão geral, empresa, conhecimento, projetos, arquivos, tarefas, CRM, integrações, IA, histórico, usuários/papéis, configurações, módulos declarativos.
- Autenticação, permissões no servidor, auditoria, arquivos privados com integridade, cofre de segredos por instância.
- Local Agent (modo remoto) com pareamento, snapshot filtrado e fila de alterações com revisão.

## Próximo (sem dependência externa)

1. Corrigir o que a operação real das instâncias mostrar (ativação, funil comercial, tarefas).
2. CRM: importação CSV com prévia e deduplicação; formulário público de captura (site/landing page) com anti-spam; união assistida de duplicados; metas.
3. Integrações: leads de formulários do Google Ads; webhooks da Meta (tempo real) quando houver URL pública; painéis por campanha com comparação de períodos.
4. **Importador → Base:** gerar sugestões de memória/identidade a partir do material importado, para revisão, alimentando `workfoli init --from <zip|pasta>`.
5. Edição de itens da Base pelo Hub além de projeto/nota/CRM (serviços, status de projeto), sempre como alteração tipada com revisão.
6. Exportação/backup completo de uma instância (banco + arquivos + segredos cifrados) e teste de restauração.
7. Retirar o importador do catálogo multiempresa antigo (migrar para operar dentro de uma instância).

## Depende de decisões de implantação

- Hospedagem do Hub por empresa (provedor, região, domínio, TLS) — ex.: container privado ou Supabase/Vercel por projeto.
- Provedor de IA externo autorizado por empresa (adaptadores Claude/Codex CLI prontos para plugar na interface existente).
- **Ativação real das integrações** (o código está pronto e testado com provedores falsos): criar os apps OAuth (Google Cloud com Ads/GA4/Search Console, Meta for Developers com Revisão do App, GitHub), o developer token do Google Ads e cadastrar o endereço de retorno; decidir **app por instalação × app da Workfoli** — ver [integracoes.md](integracoes.md).

## Depois

- Módulos planejados: Agenda, Site, Campanhas, Conteúdo, Dashboards, Automações, Desenvolvimento, Financeiro.
- **Módulos clínicos** (Pacientes, Mídia antes/depois com autorização por finalidade): só após autenticação forte, auditoria de leitura, criptografia, política de retenção e validação jurídica (LGPD, dados de saúde).
- 2FA/passkeys, SSO.
