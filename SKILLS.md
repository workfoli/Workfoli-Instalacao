# Guia das skills do Workfoli

Todas as 29 skills, com o que cada uma faz, como chamar e onde a entrega fica. O resumo em tabela
está no [README](README.md#skills-e-comandos).

## Como chamar qualquer skill

| Jeito | Claude Code | Codex |
|---|---|---|
| Comando direto | `/nome` (ex.: `/legenda`) | `$nome` (ex.: `$legenda`) |
| Comando com complemento | `/humanizar auditar`, `/aprovar-post bolo-de-nozes` | `$humanizar auditar`, `$aprovar-post bolo-de-nozes` |
| Linguagem normal | "faz uma legenda pra essa foto" | "faz uma legenda pra essa foto" |

O agente encontra a skill pela descrição, então pedir do seu jeito funciona. O comando direto serve
pra quando você já sabe qual quer.

Toda skill lê a memória do negócio (`_memoria/`) antes de trabalhar, nunca inventa número, preço ou
depoimento (usa `[A CONFIRMAR]`) e nunca publica, envia ou paga nada sem confirmação na hora.

## Índice

- **Núcleo:** [instalar](#instalar) · [abrir](#abrir) · [fechar](#fechar) · [salvar](#salvar) · [atualizar](#atualizar) · [novo-projeto](#novo-projeto) · [mapear-rotinas](#mapear-rotinas)
- **Instagram:** [instagram](#instagram) · [legenda](#legenda) · [carrossel](#carrossel) · [roteiro-reels](#roteiro-reels) · [stories](#stories) · [hashtags](#hashtags) · [calendario-editorial](#calendario-editorial) · [extrair-gancho](#extrair-gancho) · [reaproveitar](#reaproveitar) · [perfil-instagram](#perfil-instagram) · [nicho-instagram](#nicho-instagram) · [aprovar-post](#aprovar-post)
- **Texto, conteúdo e SEO:** [humanizar](#humanizar) · [publicar-tema](#publicar-tema) · [seo](#seo) · [responder-avaliacoes](#responder-avaliacoes)
- **Vendas e atendimento:** [whatsapp](#whatsapp) · [proposta](#proposta) · [anuncio-google](#anuncio-google) · [relatorio-ads](#relatorio-ads)
- **Produção:** [analisar-dados](#analisar-dados) · [email-profissional](#email-profissional)

---

## Núcleo

### instalar

`/instalar` · `$instalar` · "instala o Workfoli", "configurar o sistema"

Primeiro comando depois de clonar. Entrevista curta, uma pergunta por vez.

- Escolhe o perfil (solopreneur, freelancer, agência ou empresa)
- Preenche `_memoria/empresa.md`, `preferencias.md` (tom de voz a partir de um texto real seu), `estrategia.md` e `identidade/design-guide.md`
- Cadastra os serviços no manifesto `workfoli.base.json` e em `servicos/`, e valida
- Acrescenta ao `AGENTS.md` as regras do perfil
- Desliga a pasta do modelo público, pra nada da empresa ir pra lá
- Confere o nome da pasta: se ainda for `workfoli`, mostra como renomear pra `Workfoli <Empresa>`

**Entrega:** memória, marca, manifesto e `tarefas.md` preenchidos, numa pasta `Workfoli <Empresa>`.

### abrir

`/abrir` · `$abrir` · "onde paramos?", "vamos trabalhar", "começar o dia"

- Resumo de até 6 linhas: o negócio, o foco atual, até 3 pendências de `tarefas.md`
- Avisa prazo vencido ou nos próximos 7 dias
- Se a memória estiver em branco, sugere o `/instalar`

### fechar

`/fechar` · `$fechar` · "por hoje é isso", "encerrar o dia", "anota o que fizemos"

- Levanta o que mudou na sessão (Git e conversa)
- Atualiza `tarefas.md`: concluídas pra Feito, pendências novas em Agora ou Próximas
- Registra decisões em `conhecimento/decisoes/<data>-<assunto>.md` e aprendizados em `conhecimento/notas/`, com aprovação
- Pergunta se algo precisa ir pra memória
- Oferece o `/salvar` se houver mudança não salva (não faz commit sozinho)

### salvar

`/salvar` · `$salvar` · "salva no GitHub", "faz backup", "commit"

- Na primeira vez, cria ou conecta um repositório **privado** da empresa (com o GitHub CLI, se houver)
- Checagem de segurança antes de todo envio: `.env`, chaves, `dados/`, bancos e documentos pessoais nunca vão
- Valida o manifesto antes de salvar
- Nunca envia a pasta de uma empresa pro modelo público

### atualizar

`/atualizar` · `$atualizar` · "a memória está certa?", "varre o projeto"

- Compara memória, `AGENTS.md`, design-guide, `tarefas.md` e manifesto com o estado real da pasta
- Lista o que está desatualizado (cliente sem registro, prazo vencido, tarefa feita ainda em Agora, projeto fora do manifesto)
- Aplica só o que você aprovar, linha por linha

### novo-projeto

`/novo-projeto` · `$novo-projeto` · "fechei com a Padaria X", "novo cliente", "novo projeto"

- 4 perguntas: nome, tipo, objetivo, entregas
- Cria `clientes/<Nome>/` ou `projetos/<nome>/` com `AGENTS.md`, `CLAUDE.md` e `briefing.md` próprios
- Cria só as subpastas das entregas citadas e registra o projeto no manifesto

### mapear-rotinas

`/mapear-rotinas` · `$mapear-rotinas` · "quero parar de fazer isso na mão", "o que dá pra automatizar"

- Entrevista sobre as tarefas que se repetem toda semana
- Confere se alguma skill já resolve antes de criar outra
- Propõe até 5 skills por rodada e cria as aprovadas em `.claude/skills/`, já espelhadas pro Codex

---

## Instagram

### instagram

`/instagram` · `$instagram` · "me ajuda com o Instagram", "quero crescer no Instagram"

Porta de entrada do kit. Indica a skill certa pro pedido e guarda as referências que as outras usam:

- `formulas-de-gancho.md`: as 10 fórmulas (G1 a G10) por objetivo (salvar, enviar, comentar, seguir)
- `algoritmo.md`: sinais que dão alcance, limites de formato, horários, checklist pré-publicação
- `hashtags.md`: o modelo de 3 a 5 hashtags por tamanho
- `regras-de-voz.md`: regras de escrita e marcadores de texto de IA em português

### legenda

`/legenda` · `$legenda` · "faz uma legenda pra essa foto", "melhora essa legenda", "legenda pro Reels"

- Escolhe a fórmula pelo objetivo e oferece 2 ganchos de até 125 caracteres (o que aparece antes do "mais")
- Corpo escaneável, um CTA com motivo, oferta em uma linha, 3 a 5 hashtags
- Cartão de aprovação com contagem de caracteres e a mídia que você precisa anexar
- Versão pro LinkedIn, se pedir

**Entrega:** `marketing/conteudo/<post|reels>-<tema>-<data>/legenda.md`

### carrossel

`/carrossel` · `$carrossel` · "carrossel sobre X", "post educativo", "criar imagem"

- Três tipos: só texto, com foto (sua ou gerada por IA) e post único
- Texto por fórmula: lista, antes e depois, mito x verdade, método. Capa com promessa, melhor ponto no slide 2 ou 3, resumo salvável, um pedido só no fim
- Visual com a sua marca (ou o estilo padrão editorial), layouts variados, sequência de capas do feed
- Renderiza em PNG 1080×1350 (e 1080×1920 pra TikTok/Reels, se pedir) e confere cada imagem
- Gera a legenda junto

**Entrega:** `marketing/conteudo/<tipo>-<tema>-<data>/` com `carrossel.html`, `instagram/slide-NN.png` e `legenda.md`
**Precisa de:** `npm.cmd install` uma vez (Playwright). Foto com IA: `OPENAI_API_KEY` ou `GEMINI_API_KEY`

### roteiro-reels

`/roteiro-reels` · `$roteiro-reels` · "roteiro de Reels sobre X", "o que eu falo no vídeo", "roteiro pro TikTok"

- Pergunta tema, objetivo, duração (15 a 90 s) e jeito de gravar (falando pra câmera, mãos e produto, tela, bastidor)
- 3 opções de gancho pros 3 primeiros segundos: imagem, texto na tela e primeira fala
- Tabela cena por cena (tempo, o que filmar, texto na tela, fala), com fala que cabe no tempo
- Final em loop, texto da capa, sugestão de áudio, versão corrida pra teleprompter e legenda
- Checklist de gravação (9:16, luz, áudio, zonas livres, sem marca d'água)

**Entrega:** `marketing/conteudo/reels-<tema>-<data>/roteiro.md` e `legenda.md`

### stories

`/stories` · `$stories` · "stories de hoje", "o que eu posto nos stories", "responder a caixinha"

- Sequência de 3 a 6 telas: o que mostrar, texto, figurinha (enquete, caixinha, quiz, contagem, link) e objetivo de cada uma
- Puxa o post do dia do calendário editorial e inclui o repost do feed
- Modos: dia, semana, responder a caixinha de perguntas, lançamento
- Telas de texto desenhadas com a marca em 1080×1920, se quiser
- Indica em qual destaque cada tela fica

**Entrega:** `marketing/instagram/stories-<data>.md` (telas desenhadas em `marketing/conteudo/stories-<tema>-<data>/`)

### hashtags

`/hashtags` · `$hashtags` · "quais hashtags eu uso?", "melhora minhas hashtags"

- Conjunto de 3 a 5: 2 a 3 de nicho, 1 a 2 médias, no máximo 1 ampla
- Cada hashtag com a faixa e o motivo; indica quais conferir na busca do app
- Corta hashtags marcadas como spam e as fora do assunto; lembra de variar por tema

### calendario-editorial

`/calendario-editorial` · `$calendario-editorial` · "o que eu posto essa semana?", "calendário de conteúdo"

- Plano dos 7 dias: formato, pilar, fórmula, ângulo, objetivo e horário
- Pilares padrão: 40% educativo, 30% bastidores, 20% conversa, 10% oferta (ajustáveis)
- Meta de salvamentos e envios da semana e checagem de equilíbrio
- Respeita sua capacidade real de produção e as datas de `_memoria/estrategia.md`
- Encaminha cada dia pro `/carrossel`, `/roteiro-reels`, `/legenda` e `/stories`

**Entrega:** `marketing/instagram/calendario-<segunda-feira>.md` (e JSON, se pedir)

### extrair-gancho

`/extrair-gancho` · `$extrair-gancho` · "por que esse Reels viralizou?", "qual o gancho desse post?"

- Recebe texto, print ou link (com o texto colado) de um post de referência
- Identifica a fórmula (com grau de confiança), o objetivo, a arquitetura e por que funcionou
- Devolve um molde em branco pro seu tema, sem copiar o texto original
- Aponta o que não copiar (excesso de hashtags, isca de engajamento)

**Entrega:** opcionalmente no `marketing/instagram/banco-de-ganchos.md`

### reaproveitar

`/reaproveitar` · `$reaproveitar` · "leva esse post do LinkedIn pro Instagram", "reaproveita esse artigo"

- Aceita post, artigo, newsletter, roteiro, transcrição ou link (inclusive vídeo do YouTube, com yt-dlp)
- Extrai a ideia central, escolhe entre legenda e carrossel e escreve um gancho novo
- Tira as marcas da rede de origem ("link nos comentários", @ de outra rede, numeração de fio)
- Mostra o mapa "o que virou o quê" pra aprovação

### perfil-instagram

`/perfil-instagram` · `$perfil-instagram` · "melhora minha bio", "analisa meu perfil", "o que eu ponho nos destaques"

- Nota pra 9 itens: foto, campo de nome, @, bio, link, categoria, destaques, grade e fixados
- Reescreve o que não passa, com contagem de caracteres (bio 150, nome 30) e 2 opções de bio
- Plano de destaques, ordem da grade e escolha dos fixados pelo objetivo do perfil
- Teste do topo: "um desconhecido seguiria só com isso?"

**Entrega:** `marketing/instagram/perfil-<data>.md` (as mudanças você faz no app)

### nicho-instagram

`/nicho-instagram` · `$nicho-instagram` · "o que está funcionando no meu nicho?", "números do concorrente"

- Ranqueia os posts de uma hashtag normalizando pelo número de seguidores e acha o padrão
- Lê perfis (seguidores, posts, bio, categoria) e compara contas no que é público
- Funciona com dados colados ou, opcionalmente, pela Apify (pede confirmação antes de gastar créditos)
- Lista de ações: o que fazer mais, quem acompanhar, hashtags que estão rodando

**Entrega:** `marketing/instagram/nicho-<alvo>-<data>.md`; dados brutos em `dados/instagram/` (fora do Git)
**Precisa de (opcional):** `APIFY_TOKEN` no `.env`

### aprovar-post

`/aprovar-post <slug>` · `$aprovar-post <slug>` · "aprova o post do bolo de nozes", "pode publicar"

- Mostra o resumo e pede confirmação antes de qualquer coisa
- Tira o artigo do rascunho, gera os JPEGs, copia pro site, faz commit e push e espera o deploy
- Publica o carrossel no Instagram e no Facebook pela Meta Graph API
- LinkedIn sai como texto pronto pra colar

**Precisa de:** `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID` e `SITE_URL` no `.env`, site com deploy automático

---

## Texto, conteúdo e SEO

### humanizar

`/humanizar` · `$humanizar` · "tira a cara de IA", "tá parecendo ChatGPT", "humaniza esse texto"

Serve pra qualquer texto em português. Quatro modos:

| Comando | O que faz |
|---|---|
| `/humanizar` | Reescreve em 4 passadas (limpar, ritmo, acrescentar, autoconferência) e mostra o que mudou e por quê |
| `/humanizar leve` | Só o essencial; é o modo que as outras skills usam antes de entregar |
| `/humanizar auditar` | Checklist pré-publicação sem reescrever: reprovado, aprovado com ressalvas ou aprovado |
| `/humanizar voz` | Aprende seu jeito de escrever com 3 a 6 textos reais e propõe a atualização de `_memoria/preferencias.md` |

Conta marcadores de IA por parágrafo (alavancar, jornada, "não é sobre X, é sobre Y", "O resultado?") e preserva a sua voz (gírias, "pra", emoji, um travessão). Não promete passar em detector de IA.

### publicar-tema

`/publicar-tema` · `$publicar-tema` · "gera o conteúdo completo sobre X", "transforma esse tema em post"

- Escolhe o tema (seu, da estratégia do `/seo` ou 5 sugestões)
- Pesquisa rápida e artigo de blog de 800 a 1.500 palavras, sempre como rascunho
- Carrossel resumo pelo `/carrossel`, apontando pro blog
- Legendas pra Instagram, Facebook e LinkedIn

**Entrega:** artigo no site (ou markdown pra colar) + pasta do carrossel com as legendas

### seo

`/seo` · `$seo` · "quero aparecer no Google", "palavras-chave", "aparecer no ChatGPT", "Google Meu Negócio"

Oito passos, cada um com o seu arquivo em `marketing/seo/`:

1. Demanda: o que as pessoas buscam
2. Concorrência: quem aparece e onde estão as brechas
3. Perfil da Empresa no Google (negócio local)
4. Otimização do site
5. Estratégia de conteúdo (lista de temas que alimenta o `/publicar-tema`)
6. Google Ads
7. Checklist de monitoramento
8. GEO: aparecer nas respostas de ChatGPT, Gemini, Claude e Perplexity

Rodar um passo só: `/seo passo 3`, `/seo gmb`, `/seo geo`. Dados reais do Search Console ou do Planejador de Palavras-chave em `dados/` deixam tudo mais preciso.

### responder-avaliacoes

`/responder-avaliacoes` · `$responder-avaliacoes` · "responde essas avaliações", "tem uma avaliação nova"

- Resposta curta e humana por avaliação: primeiro nome, agradecimento variado, frase concreta
- Calibra pela nota; 3 estrelas ou menos param pra combinar com você antes
- Aceita texto ou print; histórico opcional em `marketing/avaliacoes-google/`

---

## Vendas e atendimento

### whatsapp

`/whatsapp` · `$whatsapp` · "responde esse cliente", "cliente sumiu depois do orçamento", "link do WhatsApp"

| Comando | O que faz |
|---|---|
| `/whatsapp kit` | Kit do WhatsApp Business: saudação, ausência, respostas rápidas (`/preco`, `/prazo`, `/pix`…), roteiro do primeiro contato ao pós-venda, etiquetas |
| `/whatsapp responder` | Responde uma mensagem colada; duas versões em assunto delicado |
| `/whatsapp follow-up` | Até 3 mensagens pra orçamento sem resposta, depois para |
| `/whatsapp transmissao` | Mensagem pra lista de transmissão ou status, só pra quem aceitou receber |
| `/whatsapp link` | Link wa.me com mensagem pronta pra bio, anúncio, site ou QR code |

**Entrega:** o kit em `processos/atendimento-whatsapp.md`; o resto fica na conversa. O Workfoli não envia mensagem nem guarda número ou conversa de cliente.

### proposta

`/proposta` · `$proposta` · "monta uma proposta pro cliente Y", "orçamento"

- Usa o `briefing.md` do cliente, se existir
- Estrutura: capa orientada a resultado, contexto, objetivo, solução, escopo (com o que não está incluído), cronograma, investimento, por que nós, próximos passos
- HTML com a marca e PDF (`render.js --pdf`); valor faltando fica `[VALOR A DEFINIR]`
- Oferece o e-mail de envio pelo `/email-profissional`

### anuncio-google

`/anuncio-google` · `$anuncio-google` · "cria uma campanha no Google Ads"

- Briefing (ou o passo 6 do `/seo`), palavras-chave comerciais agrupadas por tema
- Anúncios responsivos (até 15 títulos e 4 descrições), recursos (sitelinks, chamada, snippets), negativas
- CSVs prontos pro Google Ads Editor, tudo pausado, com limite de caracteres validado

**Entrega:** `marketing/campanhas/google-ads-<data>/`

### relatorio-ads

`/relatorio-ads` · `$relatorio-ads` · "como foram os anúncios essa semana?"

- Lê os exports de Google Ads e Meta Ads (ou prints) em `dados/`
- Compara com a semana anterior, alertas em vermelho, amarelo e verde
- Recomendações concretas pra próxima semana, na linguagem do dono

**Entrega:** `marketing/campanhas/relatorios/<data>-relatorio.md`

---

## Produção

### analisar-dados

`/analisar-dados` · `$analisar-dados` · "analisa essa planilha", "o que mostram esses dados"

- CSV, Excel, PDF, TXT ou JSON (normalmente em `dados/`)
- Confere a qualidade dos dados antes de concluir
- Resumo executivo: o que mostram, o que funciona, o que merece atenção, 3 recomendações, números-chave

**Entrega:** `saidas/analises/`

### email-profissional

`/email-profissional` · `$email-profissional` · "escreve um e-mail pra", "cobra o cliente X", "como eu respondo isso"

- Tom proporcional à relação, pedido claro já na abertura, assunto específico
- Duas versões (direta e suave) em cobrança, recusa, reajuste ou feedback negativo
- Cria o rascunho no Gmail/Outlook se houver conector (nunca envia sozinho)

**Entrega:** na conversa ou em `saidas/emails/`

---

## Skills criadas pela empresa

Skills criadas pelo `/mapear-rotinas` ou à mão entram aqui, no mesmo formato, para quem chegar
depois saber que existem.
