---
name: hashtags
description: >
  Monta um conjunto de 3 a 5 hashtags do tamanho certo pra um post de Instagram (de nicho, médias e
  no máximo uma ampla), combinado com o conteúdo e com o tamanho da conta, em vez do paredão de 30.
  Use quando o usuário disser "quais hashtags eu uso", "hashtags pra esse post", "melhora minhas
  hashtags", "hashtag que funciona" ou /hashtags.
---

# /hashtags — Hashtags que a conta consegue ranquear

Hoje hashtag funciona como etiqueta de assunto, e conta pequena só aparece em hashtag pequena. Esta skill monta um conjunto dimensionado de 3 a 5.

## Dependências

- **Modelo completo:** `.claude/skills/instagram/referencias/hashtags.md`
- **Negócio:** `_memoria/empresa.md` (nicho, cidade ou região, @)
- **Histórico (se existir):** legendas recentes em `marketing/conteudo/*/legenda.md`, pra não repetir o mesmo bloco

## Workflow

### Passo 1 — O post

Pegar a legenda, o tema do carrossel ou o assunto do Reels, o público e o **tamanho aproximado da conta** (define a mistura: conta pequena precisa de mais nicho).

### Passo 2 — Extrair os assuntos

De 3 a 5 assuntos reais do post: o tema, a comunidade, o formato, o resultado, o local (negócio local quase sempre ganha com cidade ou bairro).

### Passo 3 — Candidatas por faixa

Pra cada assunto, propor candidatas de nicho, médias e amplas:

- **Nicho:** juntar duas palavras (tema + público, tema + cidade, tema + estilo), nome da comunidade, as hashtags menores em que perfis parecidos aparecem
- **Média:** um subtema reconhecível
- **Ampla:** uma palavra comum, só como etiqueta

### Passo 4 — Estimar o tamanho

A contagem não vem pela API. Estimar pela especificidade e **pedir ao usuário que confira na busca do app** as que ficarem na fronteira. Nunca afirmar um número de posts que não foi conferido.

Cortar na hora: `#sigodevolta`, `#curtir`, `#follow4follow`, `#like4like` e parecidas, e qualquer hashtag popular fora do assunto.

### Passo 5 — Montar o conjunto

2 a 3 de nicho + 1 a 2 médias + 0 a 1 ampla, total de 3 a 5. Sem ampla que encaixe, ficar sem. Toda hashtag descreve o conteúdo real.

### Passo 6 — Entregar

```
Conjunto (4 hashtags):
  #confeitariacuritiba   nicho   negócio local, público que compra
  #bolodenozes           nicho   o produto exato do post
  #docesartesanais       média   subtema com público morno
  #confeitaria           ampla   etiqueta de categoria

Onde pôr: fim da legenda ou primeiro comentário.
Conferir na busca do app: #bolodenozes (se passar de 50 mil posts, vira média).
Variar as de nicho a cada post.
```

## Regras

- 3 a 5 no total. Nunca entregar bloco de 30
- Toda hashtag combina com o conteúdo
- No máximo uma ampla
- Hashtag no fim ou no primeiro comentário, nunca no meio da frase
- Não entregar um bloco fixo pra colar pra sempre: variar por tema
- Nunca inventar contagem de posts

## Antipadrões (a skill recusa)

- 20 a 30 hashtags
- "Pacote de hashtags que viralizam"
- Hashtag fora do assunto pra pegar público maior
- 30 hashtags escondidas atrás de pontinhos
- Só hashtags amplas numa conta pequena

## Créditos

Adaptado do `ig-hashtag-strategist` do [instagram-skills](https://github.com/sergebulaev/instagram-skills) (MIT, Sergey Bulaev).
