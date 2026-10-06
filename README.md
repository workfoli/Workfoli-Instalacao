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

Requisitos: Git, Node.js 22+ e Claude Code ou Codex. No PowerShell, clone já com o nome da
empresa, no formato `Workfoli <Empresa>` (troque `Acme` pelo nome dela):

```powershell
git clone https://github.com/workfoli/workfoli.git "Workfoli Acme"
cd "Workfoli Acme"
code .
```

O clone cria uma única pasta, `Workfoli Acme`, com tudo o que precisa. Assim, numa pasta com vários
clientes, cada Workfoli é reconhecido pelo nome. Nessa pasta, rode `/instalar` no Claude Code (ou
`$instalar` no Codex): uma entrevista curta cadastra a sua empresa (memória, tom de voz, foco,
identidade visual e manifesto). Se a pasta tiver sido clonada sem nome (`workfoli`), o `/instalar`
mostra no final como renomeá-la para `Workfoli <Empresa>`.

Depois, `/salvar` guarda tudo num repositório **privado** da sua empresa no GitHub. A pasta vem
ligada ao modelo público; antes do primeiro envio, o Workfoli desliga esse vínculo para que nada da
sua empresa venha para cá.

Para gerar carrosséis e PDFs, instale as dependências uma vez com `npm.cmd install`. A validação do
manifesto não precisa delas:

```powershell
npm.cmd run validar
```

Tem mais de uma empresa? Clone uma vez para cada, cada uma com o próprio nome (ex.:
`Clientes\Acme\Workfoli Acme` e `Clientes\Padaria Sol\Workfoli Padaria Sol`). A pasta do cliente
pode guardar outros materiais ao lado do Workfoli dele (arquivos originais, modelos impressos).

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
| `SKILLS.md` | Guia de todas as skills: o que fazem e como chamar |
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

## Skills e comandos

São 29 skills. Não precisa decorar comando: peça em linguagem normal ("faz um carrossel sobre X",
"monta uma proposta pro cliente Y") e o agente encontra a skill certa pela descrição. Se preferir
chamar direto, use `/nome` no Claude Code ou `$nome` no Codex. Algumas aceitam um complemento,
como `/humanizar auditar`, `/whatsapp kit` ou `/aprovar-post <slug>`.

**O guia completo, com as funcionalidades de cada skill, os modos e onde cada entrega fica, está
em [SKILLS.md](SKILLS.md).**

### Núcleo

| Claude Code | Codex | O que faz | Peça assim |
|---|---|---|---|
| `/instalar` | `$instalar` | Entrevista inicial: memória, tom de voz, foco, marca e manifesto | "instala o Workfoli" |
| `/abrir` | `$abrir` | Começa a sessão com o foco atual, as pendências e os prazos | "onde paramos?" |
| `/fechar` | `$fechar` | Fecha a sessão: o que foi feito, tarefas atualizadas, decisões registradas, oferta de salvar | "por hoje é isso" |
| `/salvar` | `$salvar` | Salva no GitHub privado da empresa (commit + push) com checagem de segurança | "salva no GitHub" |
| `/atualizar` | `$atualizar` | Confere se memória, tarefas e manifesto acompanham o estado real da pasta | "a memória está certa?" |
| `/novo-projeto` | `$novo-projeto` | Pasta de projeto ou cliente com regras próprias, registrada no manifesto | "fechei com a Padaria X" |
| `/mapear-rotinas` | `$mapear-rotinas` | Transforma tarefas repetidas em skills novas | "quero parar de fazer isso na mão" |

### Instagram

| Claude Code | Codex | O que faz | Peça assim |
|---|---|---|---|
| `/instagram` | `$instagram` | Porta de entrada do kit: indica a skill certa e guarda as referências (fórmulas de gancho, algoritmo, hashtags, voz) | "me ajuda com o Instagram" |
| `/legenda` | `$legenda` | Legenda de foto, post único ou Reels com gancho nos primeiros 125 caracteres e um CTA só | "faz uma legenda pra essa foto" |
| `/carrossel` | `$carrossel` | Carrossel e post 1080×1350 com a marca, texto por fórmula (lista, antes e depois, mito x verdade, método) e legenda | "carrossel sobre como conservar bolo" |
| `/roteiro-reels` | `$roteiro-reels` | Roteiro de Reels de 15 a 90 s: gancho de 3 s, cena por cena (o que filmar, texto na tela, fala), capa, teleprompter e legenda | "roteiro de Reels sobre X" |
| `/stories` | `$stories` | Sequência de 3 a 6 stories por dia com figurinhas, repost do feed, respostas da caixinha e destaques | "o que eu posto nos stories hoje?" |
| `/hashtags` | `$hashtags` | Conjunto de 3 a 5 hashtags do tamanho que a conta consegue ranquear | "quais hashtags eu uso nesse post?" |
| `/calendario-editorial` | `$calendario-editorial` | Plano da semana: formato, pilar, gancho, horário e objetivo por dia, com meta de salvamentos e envios | "o que eu posto essa semana?" |
| `/extrair-gancho` | `$extrair-gancho` | Desmonta um post de referência e devolve a fórmula, o porquê e um molde pro seu tema | "por que esse Reels viralizou?" |
| `/reaproveitar` | `$reaproveitar` | Transforma post do LinkedIn, artigo, newsletter ou vídeo em carrossel ou legenda nativa | "leva esse post do LinkedIn pro Instagram" |
| `/perfil-instagram` | `$perfil-instagram` | Auditoria do perfil: nome buscável, bio, link, destaques, grade e fixados, com antes e depois | "melhora minha bio" |
| `/nicho-instagram` | `$nicho-instagram` | O que está funcionando numa hashtag e os números de concorrentes, com dados colados ou pela Apify | "o que está funcionando no meu nicho?" |
| `/aprovar-post` | `$aprovar-post` | Publica blog + Instagram + Facebook, sempre com confirmação | "aprova o post do bolo de nozes" |

### Texto, conteúdo e SEO

| Claude Code | Codex | O que faz | Peça assim |
|---|---|---|---|
| `/humanizar` | `$humanizar` | Tira a "cara de IA" de qualquer texto sem mudar o sentido nem a voz | "tá parecendo ChatGPT, arruma" |
| `/humanizar auditar` | `$humanizar auditar` | Checklist antes de postar: reprovado, aprovado com ressalvas ou aprovado | "audita essa legenda" |
| `/humanizar voz` | `$humanizar voz` | Aprende o jeito de escrever do negócio com 3 a 6 textos reais e atualiza a memória | "aprende meu jeito de escrever" |
| `/publicar-tema` | `$publicar-tema` | Um tema vira artigo de blog + carrossel + legendas, tudo conectado | "gera o conteúdo completo sobre X" |
| `/seo` | `$seo` | SEO, GEO (aparecer nas IAs) e Google Ads em 8 passos, com pesquisa na web | "quero aparecer no Google" |
| `/responder-avaliacoes` | `$responder-avaliacoes` | Respostas humanas pras avaliações do Google | "responde essas avaliações" |

### Vendas, atendimento e anúncios

| Claude Code | Codex | O que faz | Peça assim |
|---|---|---|---|
| `/whatsapp` | `$whatsapp` | Responde clientes no tom da marca, follow-up de orçamento, lista de transmissão e link wa.me | "responde esse cliente no WhatsApp" |
| `/whatsapp kit` | `$whatsapp kit` | Kit do WhatsApp Business: saudação, ausência, respostas rápidas e roteiro de atendimento | "monta minhas respostas rápidas" |
| `/proposta` | `$proposta` | Proposta comercial com a marca, em HTML e PDF | "monta uma proposta pro cliente Y" |
| `/anuncio-google` | `$anuncio-google` | Campanha de Google Ads em CSV pronta pro Editor | "cria uma campanha no Google Ads" |
| `/relatorio-ads` | `$relatorio-ads` | Relatório semanal de Google Ads + Meta Ads, com alertas e recomendações | "como foram os anúncios essa semana?" |

### Produção

| Claude Code | Codex | O que faz | Peça assim |
|---|---|---|---|
| `/analisar-dados` | `$analisar-dados` | Resumo executivo de CSV, planilha, PDF ou JSON | "analisa essa planilha" |
| `/email-profissional` | `$email-profissional` | Rascunho de e-mail no tom da marca, com duas versões em assunto delicado | "escreve um e-mail cobrando o cliente X" |

### Fluxos que combinam skills

- **Rotina do dia:** `/abrir` → o trabalho do dia → `/fechar` → `/salvar`
- **Semana de Instagram:** `/calendario-editorial` → `/carrossel`, `/roteiro-reels` e `/legenda` pra cada post → `/stories` todo dia → `/humanizar auditar` → `/aprovar-post` (carrossel) ou postar pelo app
- **Aprender com quem já funciona:** `/nicho-instagram` → `/extrair-gancho` no melhor post → `/carrossel` ou `/roteiro-reels` com o molde
- **Conteúdo que aparece no Google e no Instagram:** `/seo` → `/publicar-tema` → `/aprovar-post`
- **Perfil novo ou parado:** `/perfil-instagram` → `/whatsapp link` pra bio → `/humanizar voz` → `/calendario-editorial`
- **Do seguidor ao cliente:** `/whatsapp kit` → `/whatsapp responder` → `/proposta` → `/whatsapp follow-up` → `/responder-avaliacoes`
- **Conteúdo que já existe:** `/reaproveitar` (artigo, vídeo ou post de outra rede) → `/hashtags` → publicar

## Agentes

O Workfoli funciona em dois agentes de IA, com as mesmas skills e as mesmas regras:

| | Claude Code | Codex |
|---|---|---|
| Chamar uma skill | `/nome` (ex.: `/legenda`) | `$nome` (ex.: `$legenda`) |
| Pedido em linguagem normal | sim, pela descrição da skill | sim, pela descrição da skill |
| Onde as skills ficam | `.claude/skills/` (a fonte) | `.agents/skills/` (espelho gerado por `npm.cmd run sync:skills`) |
| Regras que o agente lê | `CLAUDE.md`, que aponta pro `AGENTS.md` | `AGENTS.md` |
| Memória do negócio | `_memoria/` (carregada no início de toda sessão) | `_memoria/` (lida no início de toda sessão) |
| Pasta de projeto | `CLAUDE.md` + `AGENTS.md` próprios, criados pelo `/novo-projeto` | `AGENTS.md` próprio |

Para usar com o Codex, abra a pasta e peça `roda o instalar` ou use `$instalar`. Se uma skill não
aparecer, o Codex pode ler direto o `.claude/skills/<nome>/SKILL.md`. Pesquisa na web, push para o
GitHub e publicação em redes dependem de rede, credenciais e confirmação. Os conectores e variáveis
estão em `templates/ferramentas/catalogo.md`.

Quem criar ou editar uma skill roda `npm.cmd run sync:skills` em seguida, para os dois agentes
ficarem com a mesma versão. O Workfoli não traz subagentes: as skills rodam no agente principal.

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

## Créditos

O kit de Instagram (`/instagram`, `/legenda`, `/hashtags`, `/humanizar`, `/calendario-editorial`,
`/extrair-gancho`, `/reaproveitar`, `/perfil-instagram`, `/nicho-instagram` e as fórmulas do
`/carrossel`) foi adaptado do [instagram-skills](https://github.com/sergebulaev/instagram-skills),
de Sergey Bulaev, sob licença MIT. A licença original está em
[`.claude/skills/instagram/CREDITOS.md`](.claude/skills/instagram/CREDITOS.md).
