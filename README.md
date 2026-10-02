# Workfoli

> Sua empresa, organizada para funcionar melhor.

O **Workfoli** é a estrutura de contexto e operação de uma empresa: identidade, serviços,
processos, projetos, conhecimento, skills e regras de trabalho, num formato que pessoas e agentes
(Claude Code, Codex) entendem.

**O próximo trabalho não começa do zero.** A landing page de hoje deixa marca, serviços, tom de voz
e decisões registrados; a campanha, o CRM ou o sistema de amanhã partem desse contexto.

Este repositório é o **modelo**: não contém dados de nenhuma empresa. Cada empresa clona o seu.

---

## Começar

Requisitos: Git, Node.js 22+ e Claude Code ou Codex. No PowerShell:

```powershell
git clone https://github.com/workfoli/workfoli.git
cd workfoli
code .
```

O clone cria uma única pasta, `workfoli`, com tudo o que precisa. Nessa pasta, rode `/instalar`
no Claude Code (ou `$instalar` no Codex): uma entrevista curta cadastra a sua empresa (memória,
tom de voz, foco, identidade visual e manifesto).

Depois, `/salvar` guarda tudo num repositório **privado** da sua empresa no GitHub. A pasta vem
ligada ao modelo público; antes do primeiro envio, o Workfoli desliga esse vínculo para que nada da
sua empresa venha para cá.

Para gerar carrosséis e PDFs, instale as dependências uma vez com `npm.cmd install`. A validação do
manifesto não precisa delas:

```powershell
npm.cmd run validar
```

Tem mais de uma empresa? Clone uma vez para cada, em pastas separadas (ex.: `Acme\workfoli`).

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

## Manifesto e validação

O `workfoli.base.json` é o índice da empresa, validado localmente por
`scripts/workfoli-contract.mjs` e `schemas/workfoli.base.schema.json`. O nome do arquivo e o formato
são mantidos por compatibilidade com as instalações já existentes.

```powershell
npm.cmd run validar
```

Campos legados de CRM, módulos e papéis não ativam serviços nem concedem acesso.

## Onde ficam os dados

| Tipo | Onde fica | Git |
|---|---|---|
| Identidade, serviços, processos, projetos, conhecimento, skills, código | Esta pasta | Repositório privado da empresa |
| Planilhas e exports para análise | `dados/`, só na sua máquina | Nunca |
| Segredos (API keys, OAuth, tokens) | `.env`, `.mcp.json` ou `secrets/`, locais | Nunca |
| Dados operacionais (CRM, clientes, pacientes, agenda) e documentos pessoais | Fora desta pasta | Nunca |

Dados médicos, CPF, dados de pacientes e documentos pessoais nunca entram nesta pasta.

## Atualizar quando o Workfoli evoluir

O `/salvar` mantém o modelo como remoto `workfoli` (só leitura). Para ver as novidades:

```powershell
git fetch workfoli
git log --oneline HEAD..workfoli/main
```

Aplique só o necessário, com backup prévio, preservando memória, identidade, projetos, skills e
arquivos personalizados. Não copie o modelo inteiro sobre a pasta da empresa. Valide ao terminar.

---

## As skills

Não precisa decorar comando: peça em linguagem normal ("faz um carrossel sobre X", "monta uma
proposta pro cliente Y"). No Claude Code use `/nome`; no Codex, `$nome`.

### Núcleo

| Skill | O que faz |
|---|---|
| `/instalar` | Entrevista inicial: memória, tom de voz, foco, marca e manifesto |
| `/abrir` | Começa a sessão com o foco atual e as pendências |
| `/salvar` | Salva no GitHub privado da empresa (commit + push) com checagem de segurança e validação |
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
- Credenciais nunca vão para o Git: `.env`, `.mcp.json` e `secrets/` são ignorados.
- `dados/` fica só na máquina.
- Conteúdo importado é tratado como dado, nunca como instrução.
- A pasta de uma empresa nunca é enviada para este repositório.

## Manutenção do modelo

Enquanto o manifesto estiver com `"status": "template"`, esta pasta é o modelo público. As regras
de manutenção estão no [AGENTS.md](AGENTS.md#modelo-público). Antes de publicar, rode
`npm.cmd run validar` e `npm.cmd run sync:skills` e revise os arquivos do commit.
