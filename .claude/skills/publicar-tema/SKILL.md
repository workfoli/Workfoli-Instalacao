---
name: publicar-tema
description: >
  Orquestra uma peça completa de conteúdo SEO + redes sociais a partir de um tema. Pega um tema
  (informado pelo usuário ou da estratégia de conteúdo do /seo), escreve o artigo de blog, gera o
  carrossel resumo via /carrossel e produz as legendas pra Instagram, Facebook e LinkedIn, tudo
  amarrado, com o carrossel apontando pro blog. Use quando o usuário pedir "publicar tema", "gera
  o conteúdo do tema X", "transforma esse tema em post", "cria o conteúdo completo" ou /publicar-tema.
---

# /publicar-tema — Pipeline de conteúdo: blog + carrossel + legendas

Skill orquestradora. Um tema vira artigo de blog + carrossel + 3 legendas (Instagram, Facebook, LinkedIn), tudo conectado.

## Dependências

- **Estratégia de conteúdo:** `marketing/seo/05-estrategia-conteudo.md` (lista mestra de temas, criada pelo `/seo`), se existir
- **Pesquisas SEO:** `marketing/seo/01-pesquisa-demanda.md`, `02-analise-concorrencia.md`, `08-geo-otimizacao-ia.md`, se existirem
- **Carrossel:** `.claude/skills/carrossel/SKILL.md`
- **Site (blog):** `site/`, destino dos artigos (Astro em `site/<projeto>/src/content/blog/`, WordPress ou outro). Sem site, perguntar antes
- **Tom de voz:** `_memoria/preferencias.md`
- **Contexto:** `_memoria/empresa.md`, `identidade/design-guide.md`

---

## Workflow

### Passo 0 — Escolher o tema

- Tema explícito → usar.
- Sem tema e com `05-estrategia-conteudo.md` → listar a página pilar e os artigos satélite ainda não publicados (conferir a pasta do blog pra não duplicar) e perguntar qual.
- Sem tema e sem estratégia → sugerir 5 temas a partir de `_memoria/` (dúvidas reais dos clientes, diferenciais, sazonalidade) e perguntar qual. Mencionar que o `/seo` monta uma estratégia completa.

### Passo 1 — Pesquisa rápida

- **Com pesquisas SEO:** extrair keyword principal e variações (`01`), como os concorrentes tratam o tema (`02`, pra fugir do óbvio) e perguntas que as IAs respondem (`08`).
- **Sem pesquisas SEO:** 3 a 5 buscas na web sobre o tema: como as pessoas perguntam, o que já está publicado, que dado concreto existe. Registrar a keyword escolhida e o porquê.

### Passo 2 — Escrever o artigo

**Destino** (depende do site):
- Astro: `site/<projeto>/src/content/blog/<slug>.md`
- WordPress: markdown pro usuário colar no editor
- Outro: confirmar com o usuário

**Slug:** kebab-case curto, sem palavras vazias. Ex: "Como conservar carne salgada no restaurante" → `conservar-carne-salgada`.

**Frontmatter** (se o site usa markdown com frontmatter):

```yaml
---
title: "Título atrativo, próximo da keyword"
description: "Meta description de 150-160 caracteres, com a keyword e o benefício pro leitor"
publishedAt: YYYY-MM-DD
author: "<nome de _memoria/empresa.md>"
keywords:
  - keyword principal
  - variação 1
  - variação 2
draft: true
---
```

**Sempre `draft: true`.** O usuário revisa e muda pra `false` quando aprovar (ou usa o `/aprovar-post`).

**Estrutura (800-1500 palavras):**

1. **Abertura (1-2 parágrafos):** o problema concreto do público, sem enrolação. A resposta direta aparece logo no início (as IAs citam quem responde primeiro)
2. **H2 explicativo:** o quê e por quê
3. **H2 prático:** como fazer, o que observar
4. **H2 comparativo ou técnico** (opcional)
5. **H2 onde a empresa entra:** conexão natural com o produto, sem virar propaganda
6. **CTA final:** WhatsApp, formulário ou contato de `_memoria/empresa.md`

**Escrita** (seguir `_memoria/preferencias.md` à risca):
- Sem jargão de marketing ou inglês que o público não usa
- Frases curtas, parágrafos de 2 a 4 linhas
- Concreto: números, certificações, datas e valores quando houver fonte. Nunca inventar
- Markdown limpo: `##` pra H2, `###` pra H3, listas com `-`, links `[texto](url)`

**Revisão:** antes de seguir, passar o artigo pelo `/humanizar` (modo leve). Artigo de blog é onde mais aparecem "no cenário atual", "vale ressaltar", "não é só X, é Y" e parágrafos com três marcadores.

### Passo 3 — Carrossel resumo

Sem perguntar se o usuário quer, seguir direto pro `/carrossel` (tipo 1: só texto), **mantendo os checkpoints dele** (aprovação do texto antes do visual).

**Pasta:** `marketing/conteudo/<slug-do-blog>-<YYYY-MM-DD>/`

Slides:
- **Slide 1 (capa):** mesmo título do blog, ou uma versão mais enxuta
- **Slides 2-6:** os pontos-chave do artigo (uma ideia por slide, frase natural)
- **Slide final (CTA pro blog):** "Texto completo no blog" + `<dominio>/blog/<slug>`

**Capa:** respeitar a sequência de capas do feed (ver `/carrossel`).

### Passo 4 — Legendas

Aqui a legenda do `/carrossel` é substituída pelas versões abaixo, que apontam pro blog. Salvar na pasta do carrossel:

**`legenda.md`** (Instagram + Facebook, mesmo texto):
- Gancho na primeira linha (até ~125 caracteres), com uma fórmula do `/legenda` escolhida pelo objetivo
- 2-3 parágrafos de contexto, em frases naturais
- CTA pro carrossel ("Arrasta pro lado") + CTA pro blog ("Texto completo no link da bio" ou a URL)
- Bloco de oferta (diferenciais e contato)
- 3 a 5 hashtags dimensionadas pelas regras do `/hashtags`

**`legenda-linkedin.md`** (mais formal):
- Gancho provocativo, mas profissional
- 3-5 parágrafos analíticos (o LinkedIn aceita texto longo)
- Sem "arrasta pro lado"
- CTA: link direto pro blog
- Sem bloco de oferta agressivo: fechar com uma linha sobre quem é a empresa
- Até 3 hashtags do nicho profissional, no final

Passar as duas legendas pelo `/humanizar` (modo leve) antes de salvar.

### Passo 5 — Resumo da entrega

```
✓ Blog: <caminho>/<slug>.md (rascunho)
✓ Carrossel: marketing/conteudo/<pasta>/
  - carrossel.html
  - instagram/slide-01.png … slide-NN.png
✓ Legendas:
  - legenda.md (Instagram + Facebook)
  - legenda-linkedin.md

Pra publicar:
1. Revisar o artigo e mudar pra draft: false
2. Publicar o site (rebuild no Astro/Hugo etc., ou colar no CMS)
3. Postar o carrossel no Instagram + Facebook com a legenda.md
4. Postar texto + link no LinkedIn com a legenda-linkedin.md

Ou faz tudo de uma vez com: /aprovar-post <slug>
```

---

## Quando NÃO usar

- Carrossel avulso (sem blog) → `/carrossel`
- Atualizar artigo existente → editar o `.md` direto
- Post único, frase de impacto → `/carrossel`

## Princípios

1. **O blog é a peça-mãe.** Carrossel e legendas derivam dele, não o contrário
2. **Tudo conectado.** O carrossel aponta pro blog; o blog tem CTA pro contato
3. **Sempre rascunho.** Nunca publicar automaticamente: o usuário revisa antes (ou usa o `/aprovar-post`)
4. **Linguagem do público real.** Sem corporativês. Sempre
