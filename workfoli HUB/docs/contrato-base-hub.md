# Contrato Base ↔ Hub

Versão do contrato **3.0.0**. Fonte canônica: [`packages/contract/workfoli-contract.mjs`](../packages/contract/workfoli-contract.mjs)
(JavaScript sem dependências) e os JSON Schemas em [`packages/contract/schemas/`](../packages/contract/schemas/).
A Base recebe uma cópia idêntica (`scripts/workfoli-contract.mjs`, `schemas/`) via `npm run sync:contract`;
`workfoli doctor --templates` acusa qualquer divergência.

Três arquivos, três papéis:

| Arquivo | Onde | Papel | Git |
|---|---|---|---|
| `workfoli.base.json` | raiz da Base | Manifesto da empresa: o que o Hub pode descobrir | Sim (Base) |
| `workfoli.hub.json` | `instances/<x>/hub/` | Configuração da instalação do Hub desta empresa | Sim, sem segredos |
| `workfoli.instance.json` | `instances/<x>/` | Liga Base, Hub e camadas privadas; fixa a versão do Core | Opcional |

## `workfoli.base.json` (schemaVersion 3)

| Campo | Obrigatório | Descrição |
|---|---|---|
| `format` | sim | `"workfoli-base"` |
| `schemaVersion` | sim | `3` (v1 e v2 são conferidos na própria versão e convertidos em memória, com aviso; `workfoli update --apply` grava v3) |
| `baseId` | sim | UUID da Base; `null` somente no template |
| `status` | sim | `template` (template canônico) ou `active` (Base de uma empresa) |
| `template` | não | `{ id, version }` do template de origem (usado por `base upgrade`) |
| `createdAt`, `updatedAt` | não | ISO 8601 |
| `company` | sim | `name`, `slug` (obrigatórios), `legalName`, `segment`, `description`, `tagline`, `website`, `locale` (padrão `pt-BR`), `timezone` (padrão `America/Sao_Paulo`) |
| `profile` | sim | `general`, `services`, `agency`, `clinic`, `development`, `retail` (só sugere módulos) |
| `identity` | não | `guide`, `logo`, `symbol` (caminhos), `colors` (`background`, `surface`, `text`, `textSecondary`, `accent` em `#RRGGBB`), `typography` (`heading`, `body`), `voice` (`tagline`, `message`, `concept`, `description`, `method[]`) |
| `context` | sim | `memory`, `identity` (obrigatórios), `tasks`, `rules`, `knowledge[]` (raízes lidas como conhecimento) |
| `services[]` | não | `id`, `name`, `summary`, `path`, `status` (`active`/`planned`/`paused`/`retired`), `visibility`, `transversal` |
| `projects[]` | não | `id`, `name`, `type` (`website`, `landing-page`, `campaign`, `content`, `system`, `automation`, `integration`, `dashboard`, `data`, `brand`, `other`), `status`, `path`, `summary`, `services[]` (ids existentes), `links[]`, `visibility`, `createdAt` |
| `modules` | sim | `enabled[]` (ids do contrato), `order[]`, `settings.<id>` (`label`, `description`: nome e descrição do módulo no menu) |
| `crm` | não | Estrutura do CRM (funis, etapas, campos, origens, regras). Detalhes abaixo e em [crm.md](crm.md). Sem esta seção vale o funil genérico padrão |
| `integrations[]` | não | `id`, `provider` (Google, Gmail, Agenda, Drive, Ads, Search Console, Analytics, Meta, Instagram, Facebook, WhatsApp, GitHub, Vercel, Supabase, Cloudflare, Netlify, `custom`), `label`, `purpose`, `status`, `account`, `secrets[]` (**nomes** de variáveis) |
| `assets[]` | não | `id`, `kind` (`logo`, `symbol`, `icon`, `image`, `font`, `document`, `video`, `other`), `path`, `label`, `visibility` |
| `resources[]` | não | `id`, `kind` (`link`, `document`, `repository`, `dashboard`, `social`, `other`), `label`, `url` ou `path`, `visibility` |
| `roles[]` | não | Sugestões de papéis: `id` (não pode ser `owner`, `manager`, `admin`, `member`, `viewer`), `name`, `description`, `permissions[]` |
| `data` | não | `versionable[]` e `private[]` (caminhos; o mesmo caminho não pode estar nos dois) |

Visibilidade: `public` (pode aparecer em canais públicos), `internal` (qualquer usuário com acesso ao
módulo), `restricted` (só quem tem `restricted:read`).

### Seção `crm`

Só **estrutura**: nenhum contato, lead, oportunidade, valor ou histórico entra no manifesto (esses
ficam no banco da instância). Exemplo mínimo:

```json
"crm": {
  "enabled": true, "labels": { "contact": "Cliente", "contacts": "Clientes" }, "currency": "BRL",
  "pipelines": [{ "id": "vendas", "name": "Funil de vendas", "default": true, "stages": [
    { "id": "novo-lead", "name": "Novo lead", "kind": "open", "probability": 10 },
    { "id": "proposta", "name": "Proposta", "kind": "open", "probability": 60, "requiredFields": ["value", "custom.servico"] },
    { "id": "ganho", "name": "Ganho", "kind": "won", "probability": 100 },
    { "id": "perdido", "name": "Perdido", "kind": "lost", "probability": 0 }
  ] }],
  "customFields": [{ "id": "servico", "entity": "opportunity", "label": "Serviço de interesse", "type": "select", "options": ["Site", "Sistema"], "required": false }],
  "sources": [{ "id": "feira", "label": "Feira do setor", "kind": "event" }],
  "lostReasons": ["Preço", "Prazo", "Sem resposta", "Outro"],
  "automations": [{ "id": "responder", "name": "Responder lead", "enabled": true, "when": { "event": "lead_created" },
    "actions": [{ "type": "create_task", "title": "Responder {nome}", "dueInDays": 0, "assignTo": "owner" }] }],
  "integrations": [{ "provider": "meta", "leads": true, "source": "meta-ads", "pipeline": "vendas" }]
}
```

| Campo | Regras |
|---|---|
| `enabled` | Precisa concordar com `"crm"` em `modules.enabled` |
| `labels` | Nomes das entidades: `contact(s)`, `organization(s)`, `lead(s)`, `opportunity(ies)` (até 40 caracteres) |
| `currency` | Código ISO de 3 letras (padrão `BRL`) |
| `pipelines[]` | 1 a 10 funis; no máximo um `default` (sem nenhum, o primeiro vira padrão). Etapas: 3 a 30, `kind` `open`/`won`/`lost`, **exatamente uma** de ganho e uma de perda e ao menos uma em aberto; `probability` 0–100; `requiredFields` entre `value`, `expectedCloseDate`, `ownerId`, `contactId`, `organizationId`, `priority`, `sourceId` ou `custom.<id>` de um campo de oportunidade existente |
| `customFields[]` | Até 60; `entity` `contact`/`organization`/`lead`/`opportunity`; `type` `text`, `textarea`, `number`, `currency`, `date`, `select`, `multiselect`, `checkbox`, `email`, `phone`, `url`; `options` só (e obrigatoriamente) nos de seleção; `id` único por entidade |
| `sources[]` | Origens extras (até 40), sem repetir as nativas: `google-ads`, `meta-ads`, `instagram`, `google-organico`, `site`, `landing-page`, `whatsapp`, `indicacao`, `importacao`, `manual`, `outros` |
| `lostReasons[]` | Até 30, sem repetição; perder uma oportunidade exige um deles |
| `automations[]` | Até 30. Eventos: `lead_created`, `stage_entered` (com `pipeline` e `stage` existentes), `deal_won`, `deal_lost`. Ações (1 a 5): `create_task` (`title` com `{nome}`, `dueInDays` 0–365, `assignTo` `owner`/`none`) e `add_tag`. Nada executa código |
| `integrations[]` | Vínculo de uma plataforma conectada no Hub com o CRM: `provider` `meta`/`google`, `leads` (importar leads dos formulários), `source` (origem existente) e `pipeline` opcional (abre oportunidade na primeira etapa). A **conexão** (conta, tokens) nunca fica aqui |

O Hub edita esta seção pela tela CRM → Configuração, com a alteração tipada `crm.config` (aplicada na hora
no modo local ou pelo Local Agent no remoto) e recusa remover ou fechar etapas com oportunidades abertas.

### Regras que o validador aplica além do schema

- Nenhum campo pode conter credencial (padrões de chaves, tokens GitHub/OpenAI/Anthropic/Google/Slack/Meta,
  JWT, chaves privadas, `senha=...`); URLs não podem ter usuário, senha ou parâmetros de token.
- `secrets[]` aceita só nomes `MAIUSCULAS_COM_UNDERLINE`.
- Caminhos são relativos, com `/`, sem `..`, sem nomes reservados do Windows, sem ADS, sem `%`.
- Raízes de contexto não podem ficar dentro de pastas privadas.
- `projects[].services` precisam existir em `services[]`; ids são únicos por coleção.
- Papéis sugeridos pela Base nunca incluem `users:*`, `settings:*` ou curingas.
- Chaves desconhecidas, getters, protótipos alterados e listas decoradas são rejeitados; mensagens de
  erro citam o campo, nunca o valor recebido.
- `status: template` exige `baseId: null`; `status: active` exige UUID e nome real (não `[Marcador]`).

### Como o Hub usa o manifesto

| Informação | Uso no Hub |
|---|---|
| `company`, `identity` | Marca na barra lateral e no login, página Empresa, favicon |
| `context.*`, `services[].path`, `projects[].path` | Raízes de conhecimento (documentos exibidos e contexto da IA) |
| `context.tasks` | Pendências da Base (somente leitura) |
| `modules` | Módulos ativos/planejados, ordem e nome no menu (ex.: CRM como "Comercial") |
| `crm` | Funis, etapas e regras, campos personalizados, origens, motivos de perda, automações e vínculo com integrações |
| `integrations` | Planejamento exibido em Integrações; a conexão real (OAuth ou token) é feita no Hub e fica no banco/cofre da instância |
| `roles` | Sugestões; aplicadas só com aprovação do proprietário |
| `data.private` | Pastas nunca lidas pelo Hub nem enviadas pelo Local Agent |

## `workfoli.hub.json` (schemaVersion 1)

```json
{
  "format": "workfoli-hub", "schemaVersion": 1, "hubId": "<uuid>", "mode": "local",
  "server": { "host": "127.0.0.1", "port": 4870, "publicUrl": null },
  "modules": { "disabled": [], "custom": [] },
  "branding": { "theme": "dark", "useBaseIdentity": true },
  "ai": { "provider": "local", "externalContext": false },
  "security": { "sessionHours": 12, "idleMinutes": 120 },
  "agent": { "hubUrl": null, "intervalSeconds": 15 }
}
```

`mode: remote` faz o Hub ler a Base pelo snapshot do Local Agent. `host: 0.0.0.0` expõe na rede local
(o validador avisa). Provedores de IA externos exigem `externalContext: true`. `modules.custom` lista
módulos declarativos de `hub/modules/<id>/module.json`.

## `workfoli.instance.json` (schemaVersion 1)

```json
{
  "format": "workfoli-instance", "schemaVersion": 1, "instanceId": "<uuid>",
  "company": { "name": "Empresa", "slug": "empresa" }, "createdAt": "...",
  "core": { "version": "0.4.0" },
  "layout": { "base": "base", "hub": "hub", "data": "data", "files": "files", "secrets": "secrets" }
}
```

`layout.base` pode ser absoluto (Base em outra pasta). `data`, `files` e `secrets` ficam sempre dentro
da instância e nunca dentro da Base.

## Versionamento e migração

- Contrato, Base template, Core, banco e protocolo do Agent têm versões independentes.
- Manifesto de versão futura: recusado com "atualize o Core". Manifestos v1 e v2: validados na própria
  versão, convertidos em memória e gravados em v3 por `workfoli update --apply` (original guardado em
  `data/backups/`). Na v2→v3, `modules.settings.crm.stages` vira funil com as etapas antigas em aberto mais
  Ganho e Perdido, e `entityLabel` vira `crm.labels.contact`; tudo que sai é avisado, nada some calado.
- O Hub grava o manifesto com `formatManifest` (objetos curtos numa linha, como uma etapa), para que
  pessoas e agentes continuem editando o arquivo à mão.
- Mudanças no contrato: alterar `workfoli-contract.mjs` + schema + `.d.mts`, rodar `npm test` e
  `npm run sync:contract`, e `workfoli doctor --templates`.
