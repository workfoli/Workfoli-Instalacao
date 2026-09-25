# CRM do Workfoli

Módulo nativo e genérico (Core 0.4.0). Serve a qualquer negócio: o vocabulário, o funil e os campos
são configuração da empresa, não código. Não há nada de segmento no Core (nenhum campo médico,
nenhum "paciente"): um módulo setorial futuro **relaciona** um contato a um paciente, aluno ou
fornecedor, sem transformar o contato nisso.

## Quem guarda o quê

| Camada | Guarda | Onde |
|---|---|---|
| **Base** | Estrutura: CRM ligado, funis e etapas, probabilidade, campos exigidos por etapa, campos personalizados, origens extras, motivos de perda, automações, nomes das entidades, moeda, vínculo com integrações | Seção `crm` do `workfoli.base.json` (versionado no Git da empresa) |
| **Banco da instância** | Estado vivo: empresas, contatos, leads, oportunidades, etapa atual, valores, atividades, histórico, etiquetas, anexos, tarefas ligadas | `data/hub.sqlite` (nunca no Git) |
| **Hub** | Interface e comandos: funil, listas, detalhe com histórico, resultados, configuração | `apps/hub-web`, API `/api/crm/*` |

Não há sincronização em laço: a configuração só muda por uma alteração tipada (`crm.config`) que grava
a Base; os registros só mudam pelo serviço do CRM. Uma oportunidade guarda o **id** da etapa; se a Base
deixar de ter essa etapa (edição manual), a oportunidade aparece no funil em "etapa fora da configuração"
para ser movida — nada some.

## Modelo

| Entidade | Principais campos | Observações |
|---|---|---|
| Empresa (`crm_organizations`) | nome, site, e-mail, telefone, responsável, origem, campos personalizados | Reaproveitada pelo nome (sem diferenciar maiúsculas) |
| Contato (`crm_contacts`) | nome, e-mail, telefone, cargo, empresa, relação (`prospect`, `customer`, `partner`, `supplier`, `other`), origem, responsável | E-mail repetido é avisado (409) e só entra com "cadastrar mesmo assim" |
| Lead (`crm_leads`) | nome, contato, empresa, mensagem, situação (`new`, `working`, `qualified`, `disqualified`, `converted`), origem, prioridade, atribuição | De integração: par (conexão, id externo) único — nunca entra duas vezes |
| Oportunidade (`crm_opportunities`) | título, funil, etapa, situação (`open`, `won`, `lost`), valor (centavos), moeda, previsão, contato, empresa, lead de origem, origem, responsável, motivo e nota da perda, posição no quadro, atribuição | Status deriva do tipo da etapa |
| Atividade (`crm_activities`) | tipo (`note`, `call`, `meeting`, `email`, `message`, `whatsapp`, `event`, `history`), ação, texto, quando, **quem** (pessoa, IA, integração, sistema, Local Agent), **de onde** | `history` é escrito só pelo sistema |
| Etiqueta (`crm_tags`, `crm_entity_tags`) | nome | Compartilhada entre entidades |
| Anexo (`crm_attachments`) | arquivo privado, arquivo da Base ou link | Link com credencial é recusado; pasta privada da Base nunca é ligada |
| Tarefa (`tasks.related_type/related_id`) | a tarefa comum, ligada a um registro | Aparece no detalhe e na página Tarefas |

Campos comuns (nome, telefone, e-mail, empresa, origem, responsável, etapa, valor, prioridade, datas,
observações, etiquetas) já existem; o resto vem de `customFields` da Base, validados por tipo. Valores de
um campo que saiu da configuração continuam guardados e aparecem como "campo removido".

## Funil

- Padrão do template: **Novo lead → Contato realizado → Qualificado → Proposta → Negociação → Ganho**, e
  **Perdido**. Tudo editável: criar, renomear, reordenar e remover etapas, vários funis, regras por etapa.
- **Regras de etapa** (`requiredFields`): para entrar em "Proposta" o padrão exige valor. O Hub mostra o que
  falta e envia o complemento junto com a mudança; se a regra recusar, nada muda (transação única). Editar
  uma oportunidade também não pode deixá-la fora da regra da etapa em que está.
- **Perder** exige um motivo da lista da Base (e aceita observação). **Ganhar** marca o contato como cliente
  (`prospect` → `customer`), com histórico.
- Reabrir (voltar de ganho/perdido para uma etapa aberta) limpa fechamento e motivo, com histórico.
- Etapa com oportunidades abertas não pode ser removida nem virar ganho/perda (409 com a contagem).
- Quadro: arrastar e soltar, ou "Mover para…" (teclado); ganhos e perdidos dos últimos 30 dias ficam visíveis.

## Histórico

Cada registro mostra o que aconteceu com ele **e com os registros ligados** (o contato vê as oportunidades e
leads dele; a oportunidade vê o lead de origem): criação e origem, mudança de etapa, de responsável, de valor,
campos alterados (só os nomes dos campos, sem copiar dados pessoais), etiquetas, tarefas, anexos, conversão,
descarte, ganho/perda, automações e entrada por integração. Cada entrada tem quem, quando, o quê e de onde.

## Origens e atribuição

Origens nativas: Google Ads, Meta Ads, Instagram, Google orgânico, Site, Landing page, WhatsApp, Indicação,
Importação, Manual, Outros; a Base acrescenta as suas. Leads e oportunidades guardam a **atribuição**
(`provider`, `campaignRef/Name`, `adSetRef/Name`, `adRef/Name`, `formRef/Name`, UTMs, `gclid`, `fbclid`,
página de entrada), preparando a cadeia campanha → anúncio → lead → contato → oportunidade → conversão. Ao
converter, a atribuição acompanha. O painel de Marketing usa isso para custo por lead do CRM e valor ganho por
origem (cálculos marcados como da Workfoli).

## Automações

Declaradas na Base, executadas na mesma transação do evento. Eventos: lead criado, entrou na etapa, negócio
ganho, negócio perdido. Ações: criar tarefa (com `{nome}`, prazo em dias, para o responsável ou sem
responsável) e aplicar etiqueta. Nenhuma ação dispara outro evento (sem laço) e nenhuma executa código.

## Conversão de lead

Liga o lead a um contato (o escolhido, o que tem o mesmo e-mail ou um novo), resolve a empresa (pelo nome ou
cria) e, se pedido, abre a oportunidade no funil com a atribuição do lead. Duplicados por e-mail ou telefone
aparecem como sugestão; nada é unido sozinho.

## Privacidade e exclusão

- **Arquivar** tira das listas e do funil sem apagar; **restaurar** devolve.
- **Excluir definitivamente** (pedido do titular, LGPD) exige `crm:admin` e digitar `EXCLUIR`; remove o
  registro, o histórico, as etiquetas e os anexos dele; oportunidades e tarefas ligadas ficam, sem a
  referência, e recebem uma entrada "contato excluído". A auditoria guarda só o tipo e o id interno.
- Oportunidades não são excluídas (histórico comercial): são arquivadas.
- O CRM recusa texto que pareça credencial. Dados sensíveis (saúde, documentos) não viram campo
  personalizado: pedem módulo próprio com controles.

## Permissões

| Permissão | Pode |
|---|---|
| `crm:read` | Ver funil, listas, detalhes, resultados |
| `crm:write` | Criar e editar registros, mover no funil, converter, registrar atividades, anexar, arquivar |
| `crm:admin` | Alterar a configuração (grava na Base) e excluir definitivamente |

Papéis do Core: Proprietário e Administrador (tudo), **Gestor Workfoli** (`crm:admin`, concedido e retirado só
pelo proprietário), Equipe (`crm:write`), Leitura (`crm:read`).

## IA

A IA propõe (nunca executa sozinha): cadastrar contato (com relação), registrar lead (com origem reconhecida,
inclusive origens próprias da Base) e criar oportunidade (com valor; liga ao contato só quando o nome aponta
para um cadastro único). Responde "como está o funil?" e "quantos leads?" com contagens, nunca com dados
pessoais. Confirmação por hash, execução única, auditoria.

## Migração do CRM anterior (banco v1 → v2)

Contatos com "etapa" viram contato + (se havia etapa) oportunidade aberta no funil convertido, com histórico
"Importado do CRM anterior". Empresas de texto viram registros de empresa (sem duplicar). A tabela antiga fica
como `legacy_contacts_v1`, e o banco é copiado para `data/backups/` antes. Sem contatos antigos, a tabela é
removida.

## API

| Rota | Permissão |
|---|---|
| `GET/PUT /api/crm/config` | `crm:read` / `crm:admin` |
| `GET /api/crm/board`, `/api/crm/summary`, `/api/crm/tags` | `crm:read` |
| `GET/POST /api/crm/{organizations,contacts,leads,opportunities}` | `crm:read` / `crm:write` |
| `GET/PATCH /api/crm/{tipo}/:id` | `crm:read` / `crm:write` |
| `POST /api/crm/leads/:id/{convert,disqualify,reopen}` | `crm:write` |
| `POST /api/crm/opportunities/:id/move` (`stageId`, `pipelineId`, `beforeId`, `patch`, `lostReason`, `lostNote`) | `crm:write` |
| `POST /api/crm/{tipo}/:id/{activities,attachments,archive,restore}`, `DELETE /api/crm/attachments/:id` | `crm:write` |
| `DELETE /api/crm/{contacts,leads,organizations}/:id` (`{ "confirm": "EXCLUIR" }`) | `crm:admin` |

Erros de regra voltam com `code` e `details` (`stage-requirements` com os campos que faltam,
`stages-in-use`, `invalid-config` com o caminho de cada problema, `duplicate` com o cadastro existente).

## Próximos passos

Importação de planilha (CSV) com prévia e deduplicação; formulário público de captura (site/landing page) com
proteção anti-spam; leads de formulários do Google Ads; união assistida de duplicados; caixa de mensagens
(e-mail/WhatsApp) ligada ao histórico; metas por período.
