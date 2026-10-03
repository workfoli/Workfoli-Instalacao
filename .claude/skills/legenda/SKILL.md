---
name: legenda
description: >
  Escreve a legenda de um post de Instagram (foto, post único ou Reels) com o gancho nos primeiros
  125 caracteres, corpo fácil de ler e um único CTA, usando uma fórmula escolhida pelo objetivo
  (salvar, enviar, comentar ou seguir). Também afia uma legenda que o usuário já escreveu. Use
  quando o usuário disser "faz uma legenda", "legenda pra essa foto", "legenda pro reels",
  "melhora essa legenda", "o que eu escrevo nesse post" ou /legenda. Pra carrossel, usar /carrossel.
---

# /legenda — Legenda de Instagram

O Instagram esconde tudo depois de ~125 caracteres atrás do "mais". O gancho faz o trabalho todo na primeira linha. Esta skill põe o gancho na frente, deixa o corpo escaneável e fecha com um CTA só.

## Dependências

- **Voz:** `_memoria/preferencias.md` (tem prioridade sobre as regras gerais)
- **Negócio:** `_memoria/empresa.md` (oferta, contato, @, diferenciais)
- **Fórmulas:** `.claude/skills/instagram/referencias/formulas-de-gancho.md` (G1 a G4 pra legenda; G9 e G10 quando for Reels)
- **Regras:** `.claude/skills/instagram/referencias/regras-de-voz.md`
- **Hashtags:** regras do `/hashtags`
- **Saída:** `marketing/conteudo/<post|reels>-<tema>-<YYYY-MM-DD>/legenda.md`

## Quando NÃO usar

- Carrossel → `/carrossel` (ele já gera a legenda junto)
- Blog + carrossel + legendas de um tema → `/publicar-tema`
- Adaptar conteúdo de outra rede → `/reaproveitar`

---

## Workflow

### Passo 1 — Entender o post

Extrair do pedido e perguntar só o que faltar:

1. Tema e ângulo
2. A mídia: foto, post único ou Reels (e o que aparece nela)
3. Pra quem é
4. Objetivo principal: **salvar**, **enviar**, **comentar** ou **seguir**. Se o usuário não souber, sugerir pelo tema

**Nunca inventar o específico.** Número, data, nome e resultado vêm do usuário. Se a fórmula pedir um dado que não existe, perguntar uma vez ("Tem um número real pra isso?"); sem dado, escolher outra fórmula ou cortar a frase.

### Passo 2 — Escolher a fórmula

| Objetivo | Fórmula |
|---|---|
| Salvar | G1 Resultado com número |
| Enviar | G2 Verdade contrária |
| Comentar | G3 Situação reconhecível, G4 Mini-história |
| Seguir | G4 Mini-história |

Sugerir 2 ou 3 que combinem com o tema e deixar o usuário escolher (ou seguir com a primeira, se ele pedir rapidez).

**Reels:** o gancho principal está no vídeo (G9 ou G10). Oferecer o texto do primeiro quadro e a primeira fala; a legenda fica curta, com contexto e o motivo pra salvar ou enviar. Se o vídeo ainda não foi gravado, o roteiro completo sai pelo `/roteiro-reels`.

### Passo 3 — Escrever

1. **Gancho (até 125 caracteres):** entrega a recompensa, a tensão ou o número antes do "mais" e faz sentido sozinho. Oferecer 2 opções.
2. **Corpo:** linhas curtas, espaço entre as ideias, uma ideia só. Ensina ou conta o que o gancho prometeu.
3. **Um CTA:** pedido de salvar ou enviar com motivo ("salva pra usar no próximo orçamento", "manda pra quem vai casar esse ano"), uma pergunta real ou um próximo passo concreto (direct, WhatsApp, link). Nunca "o que vocês acham?".
4. **Oferta (se fizer sentido):** uma linha com contato ou diferencial de `_memoria/empresa.md`. Sem venda forçada.
5. **Hashtags:** 3 a 5 dimensionadas pelas regras do `/hashtags`, no fim ou indicadas pro primeiro comentário.

### Passo 4 — Revisar

Passar pelo `/humanizar` (modo leve) e conferir o checklist de `algoritmo.md`. Se o usuário quiser, rodar `/humanizar auditar`.

### Passo 5 — Cartão de aprovação

```
Fórmula: G1 Resultado com número · Objetivo: salvar
Gancho (98 caracteres): <linha 1>
Alternativa: <outra linha 1>

Legenda completa:
<texto>

Tamanho: 640 / 2.200 caracteres · Hashtags: 4 · Emojis: 1
Mídia a anexar: <foto do produto / Reels de 30 s com texto na tela>
```

### Passo 6 — Entregar

Aprovada, salvar em `marketing/conteudo/<post|reels>-<tema>-<YYYY-MM-DD>/legenda.md` (com o gancho alternativo no fim, comentado) e entregar pronta pra copiar. Lembrar da mídia.

Publicação automática hoje é só pelo `/aprovar-post` (carrossel de blog). Post único e Reels são publicados pelo app com o texto pronto.

**Facebook:** a mesma legenda serve. **LinkedIn:** oferecer uma versão mais formal, sem "arrasta pro lado", com até 3 hashtags.

---

## Regras

- Os primeiros 125 caracteres param a rolagem sozinhos. Gancho que precisa da segunda linha é reescrito
- Uma ideia por legenda. Duas ideias, dois posts
- Um número específico onde a afirmação permite, sempre do usuário
- 3 a 5 hashtags dimensionadas, nunca 30. 0 a 3 emojis, salvo voz do negócio
- Nunca apresentar legenda como pronta sem lembrar da mídia
- Sem venda forçada: uma menção natural ao próximo passo, no máximo

## Antipadrões (a skill recusa)

- Gancho que só faz sentido depois do "mais"
- Aberturas "Vamos falar sobre…", "Hoje eu quero falar…", "POV:" que não é ponto de vista
- Pontes de revelação ("O resultado?") e frases picadas ("Sem X. Sem Y. Só Z.")
- Anúncio de sinceridade sem fato concreto ("papo reto", "vou ser sincera")
- Isca de engajamento ("curte se concorda", "comenta SIM")
- 20 a 30 hashtags no topo
- Esticar uma ideia de uma linha pra parecer substancial

## Créditos

Adaptado do `ig-caption-writer` do [instagram-skills](https://github.com/sergebulaev/instagram-skills) (MIT, Sergey Bulaev).
