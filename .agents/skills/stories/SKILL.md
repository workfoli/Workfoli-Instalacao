---
name: stories
description: >
  Planeja a sequência de stories do dia (ou da semana) no Instagram: 3 a 6 telas com o que mostrar,
  o texto, a figurinha certa (enquete, caixinha, quiz, contagem regressiva, link) e o objetivo de
  cada uma, puxando do calendário editorial. Também transforma respostas da caixinha de perguntas
  em stories e indica o que vai pra cada destaque. Use quando o usuário disser "o que eu posto nos
  stories", "sequência de stories", "stories de hoje", "responder a caixinha", "stories de
  lançamento" ou /stories.
---

# /stories — Stories todo dia sem pensar do zero

Stories não trazem gente nova: aprofundam a relação com quem já segue e mantêm a conta na frente da fila. Cada tela tem um trabalho, e pelo menos uma pede um toque (figurinha).

## Dependências

- **Plano da semana (se existir):** `marketing/instagram/calendario-<YYYY-MM-DD>.md` (criado pelo `/calendario-editorial`)
- **Negócio:** `_memoria/empresa.md` (oferta, link, contato, horário)
- **Voz:** `_memoria/preferencias.md`
- **Foco e datas:** `_memoria/estrategia.md`
- **Marca (pra telas desenhadas):** `identidade/design-guide.md` e `scripts/render.js`
- **Saída:** `marketing/instagram/stories-<YYYY-MM-DD>.md`; telas renderizadas em `marketing/conteudo/stories-<tema>-<YYYY-MM-DD>/`

## Modos

| Pedido | O que faz |
|---|---|
| "stories de hoje" (padrão) | Sequência de 3 a 6 telas pro dia |
| "stories da semana" | Uma sequência curta por dia, alinhada ao calendário |
| "responder a caixinha" | Transforma perguntas recebidas em telas de resposta |
| "stories de lançamento" | Sequência de aquecimento → abertura → prova → últimas vagas |

## Workflow

### Passo 1 — O dia

- Se houver calendário da semana, pegar o post do feed do dia e o pilar
- Perguntar **o que dá pra mostrar de verdade hoje**: produção, entrega, equipe, cliente (com autorização), bastidor, novidade. Stories vivem de coisa real
- Objetivo do dia: relação (conversa), tráfego pro post do feed, ou venda (oferta)

### Passo 2 — A sequência (3 a 6 telas)

Estrutura de partida:

1. **Abertura:** bastidor real ou "olha o que está saindo hoje" (foto ou vídeo curto)
2. **Conversa:** figurinha de enquete, caixinha ou quiz ligada ao tema do dia
3. **Repost do feed:** o post do dia com "saiu post novo" (funciona como envio e leva o post a quem não viu)
4. **Valor:** uma dica rápida, um antes e depois, uma resposta da caixinha
5. **Próximo passo** (só quando houver oferta): figurinha de link (WhatsApp, agenda, loja) ou "chama no direct"

Nos dias sem oferta, a sequência termina na conversa ou no valor. **Oferta no máximo 2 dias por semana**, salvo lançamento.

### Passo 3 — Cada tela

```
| # | Tipo | O que mostrar | Texto na tela | Figurinha | Objetivo |
|---|---|---|---|---|---|
| 1 | vídeo 10 s | forno abrindo com a fornada das 7h | "primeira fornada do dia" | — | relação |
| 2 | foto | os dois recheios lado a lado | "qual sai primeiro hoje?" | enquete: doce de leite / pistache | conversa |
| 3 | repost | carrossel do dia | "saiu post novo: 5 erros ao guardar bolo" | — | tráfego pro feed |
| 4 | texto | fundo da marca | "encomendas pro fim de semana até quinta" | link: WhatsApp | venda |
```

Regras de tela:

- **Uma ideia por tela**, texto de até ~15 palavras, legível em 2 segundos
- **Figurinha certa pro objetivo:** enquete (opinião rápida, mais toques), caixinha (dúvidas, gera conteúdo pros próximos dias), quiz (ensinar brincando), contagem regressiva (lançamento ou data), link (venda), menção (marca parceira ou cliente com autorização)
- **Zonas livres:** deixar ~250 px no topo e na base da tela de 1080x1920 sem texto (barra de progresso, nome e campo de resposta cobrem)
- **Vídeo falado:** legenda automática ligada
- Variar formato (foto, vídeo, texto) pra não virar slide de apresentação

### Passo 4 — Telas desenhadas (opcional)

Telas só de texto, enquete com fundo da marca ou respostas da caixinha podem sair desenhadas: criar `stories.html` com cada tela em `<div class="slide">` de 1080x1920, nas cores e fontes de `identidade/design-guide.md` (sem design-guide, o estilo padrão do `/carrossel`), e renderizar:

```bash
node scripts/render.js marketing/conteudo/stories-<tema>-<data>/stories.html --size 1080x1920 --out stories
```

A figurinha é colocada pelo usuário no app; no HTML, deixar o espaço livre e marcado no roteiro.

### Passo 5 — Responder a caixinha

Com as perguntas coladas (sem nome nem @ de quem perguntou, a menos que a pessoa tenha autorizado):

- Agrupar perguntas parecidas
- Uma tela por resposta: a pergunta no topo (como a figurinha de resposta mostra) e a resposta em até ~25 palavras
- Pergunta que merece resposta longa vira ideia de carrossel ou Reels: listar pro `/calendario-editorial`
- Nunca responder dúvida de saúde, jurídica ou financeira individual: orientar a falar no privado ou com profissional

### Passo 6 — Destaques

Indicar em qual destaque cada tela deve ficar (ex.: Cardápio, Clientes, Dúvidas, Como pedir), seguindo a ordem definida no `/perfil-instagram`, se existir.

### Passo 7 — Entregar

Mostrar a tabela, passar o texto pelo `/humanizar` (modo leve) e salvar em `marketing/instagram/stories-<YYYY-MM-DD>.md`. Lembrar que fotos e vídeos reais são do usuário; o Workfoli não publica stories.

## Regras

- Pelo menos uma figurinha interativa por dia
- Coisa real ganha de arte bonita: bastidor de verdade sempre que der
- Oferta com moderação; o resto da semana constrói relação
- Nunca mostrar cliente, paciente ou conversa sem autorização; nunca guardar nome ou @ de quem respondeu
- Nunca inventar número, depoimento ou "últimas vagas" que não sejam verdade
