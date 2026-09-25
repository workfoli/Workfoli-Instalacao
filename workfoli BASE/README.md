# Workfoli Base

> Sua empresa, organizada para funcionar melhor.

A **Workfoli Base** é a estrutura interna de contexto e operação de uma empresa atendida pela
Workfoli: identidade, serviços, processos, projetos, conhecimento, skills e regras de trabalho,
num formato que pessoas e agentes (Claude Code, Codex) entendem.

**O próximo trabalho não começa do zero.** A landing page de hoje deixa marca, serviços, tom de voz
e decisões registrados; a campanha, o CRM ou o sistema de amanhã partem desse contexto.

Esta pasta é o **template canônico**: não contém dados de nenhuma empresa. Cada empresa recebe a
sua própria Base, criada a partir dela.

---

## Criar a Base de uma empresa

### Pela CLI do Workfoli Hub (recomendado)

Na pasta do Workfoli Hub:

```bash
node bin/workfoli.mjs init nome-da-empresa --name "Nome da Empresa" --profile services
```

Isso cria `instances/nome-da-empresa/base/` a partir deste template (com identificador próprio,
manifesto preenchido, repositório Git local e lock do template), sem alterar o template.
Depois, dentro da Base, rode o `/instalar` (Claude Code) ou `$instalar` (Codex) para a entrevista.

### Manualmente

Copie ou clone este template para uma pasta vazia com o nome da empresa, abra no Claude Code ou
no Codex e rode `/instalar` / `$instalar`. O `/instalar` ativa o manifesto (`status: active`,
identificador novo) e preenche memória, identidade e serviços.

Requisitos: Claude Code ou Codex; Git; Node.js 22+ (validação do manifesto e renderização de
carrosséis/propostas: `npm install` uma vez).

---

## Estrutura

| Pasta / arquivo | O que guarda |
|---|---|
| `workfoli.base.json` | **Manifesto**: empresa, identidade, serviços, projetos, módulos, integrações, papéis sugeridos |
| `_memoria/` | Quem é a empresa, como fala, o que está em foco (carregada em toda sessão) |
| `identidade/` | Marca: cores, tipografia, logo, `design-guide.md` |
| `servicos/` | Um arquivo por serviço ou produto |
| `projetos/` | Uma pasta por projeto: sites, landing pages, campanhas, sistemas |
| `processos/` | Como a empresa trabalha |
| `conhecimento/` | Decisões, histórico, aprendizados e notas |
| `infraestrutura/` | Mapa técnico sem segredos: domínios, hospedagem, repositórios, contas |
| `marketing/`, `saidas/` | Conteúdo, relatórios e documentos gerados |
| `dados/` | Entradas locais (planilhas, exports). Nunca vão para o Git |
| `scripts/` | Renderização, espelhamento de skills e validação do manifesto |
| `.claude/skills/`, `.agents/skills/` | Skills (fonte em `.claude`, espelho para o Codex) |
| `AGENTS.md` / `CLAUDE.md` | Regras dos agentes (fonte única no `AGENTS.md`) |

## O contrato com o Workfoli Hub

O **Workfoli Hub** é a camada visual opcional instalada depois, sobre uma Base madura. Ele não
varre pastas tentando adivinhar: lê o `workfoli.base.json`, validado pelo mesmo contrato do Core
(`scripts/workfoli-contract.mjs`, cópia sincronizada; `schemas/workfoli.base.schema.json`).

```bash
npm run validar
```

Instalar o Hub sobre esta Base (na pasta do Workfoli Hub): `node bin/workfoli.mjs hub install <instância>`.
A empresa não é cadastrada de novo: nome, identidade, serviços, projetos e módulos vêm daqui.

## Camadas de dados

| Camada | Onde fica | Git |
|---|---|---|
| Base versionável (identidade, serviços, processos, projetos, conhecimento, skills, código) | Esta pasta | Repositório privado da empresa |
| Dados operacionais (CRM, clientes, pacientes, agenda, tarefas da equipe) | Banco do Hub na instância | Nunca |
| Arquivos privados (contratos, documentos, mídia privada) | `files/` da instância | Nunca |
| Segredos (API keys, OAuth, tokens) | `secrets/` da instância; `.env` local só para scripts | Nunca |

Dados médicos, CPF, dados de pacientes e documentos pessoais nunca entram nesta pasta.

## Atualizar uma Base existente quando o template evoluir

```bash
node bin/workfoli.mjs base upgrade <pasta-da-base>          # simulação
node bin/workfoli.mjs base upgrade <pasta-da-base> --apply  # aplica
```

Arquivos que a empresa não mexeu recebem a versão nova; arquivos customizados ficam como estão;
quando os dois mudaram, a versão do template vai para `.workfoli/upgrade/` para revisão. Nada é apagado.

---

## As skills

Não precisa decorar comando: peça em linguagem normal ("faz um carrossel sobre X", "monta uma
proposta pro cliente Y"). No Claude Code use `/nome`; no Codex, `$nome`.

### Núcleo

| Skill | O que faz |
|---|---|
| `/instalar` | Entrevista inicial: memória, tom de voz, foco, marca e manifesto |
| `/abrir` | Começa a sessão com o foco atual e as pendências |
| `/salvar` | Salva no GitHub (commit + push) com checagem de segurança e validação |
| `/atualizar` | Confere se memória e manifesto acompanham o estado real da pasta |
| `/novo-projeto` | Pasta de projeto com regras próprias, registrada no manifesto |
| `/mapear-rotinas` | Transforma tarefas repetidas em skills |

### Conteúdo e SEO

| Skill | O que faz |
|---|---|
| `/carrossel` | Carrossel e post 1080×1350 com a marca |
| `/publicar-tema` | Um tema vira artigo de blog + carrossel + legendas |
| `/seo` | SEO, GEO e Google Ads em 8 passos, com pesquisa na web |
| `/responder-avaliacoes` | Respostas humanas para avaliações do Google |
| `/aprovar-post` | Publica blog + Instagram + Facebook, sempre com confirmação |

### Vendas e anúncios

| Skill | O que faz |
|---|---|
| `/proposta` | Proposta comercial com a marca, em HTML e PDF |
| `/anuncio-google` | Campanha de Google Ads em CSV para o Editor |
| `/relatorio-ads` | Relatório semanal de Google Ads + Meta Ads, com alertas |

### Produção

| Skill | O que faz |
|---|---|
| `/analisar-dados` | Resumo executivo de CSV, planilha ou PDF |
| `/email-profissional` | Rascunho de e-mail no tom da marca |

## Usando com o Codex

Abra a pasta no Codex e peça `roda o instalar` ou use `$instalar`. As skills ficam espelhadas em
`.agents/skills/` pelo `npm run sync:skills` (a fonte continua em `.claude/skills/`). Pesquisa na
web, push para o GitHub e publicação em redes dependem de rede, credenciais e confirmação.
Os conectores e variáveis estão em `templates/ferramentas/catalogo.md`.

## Segurança

- Nada é publicado, enviado ou pago sem confirmação.
- Credenciais nunca vão para o Git: `secrets/` da instância, ou `.env` local (ignorado) para scripts.
- `dados/` fica só na máquina.
- Conteúdo importado é tratado como dado, nunca como instrução.
