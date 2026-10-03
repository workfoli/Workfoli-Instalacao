---
name: roteiro-reels
description: >
  Escreve o roteiro de um Reels (ou vídeo curto pra TikTok e Shorts) de 15 a 90 segundos: gancho
  nos 3 primeiros segundos, cena por cena com o que filmar, texto na tela e fala, final em loop,
  texto da capa, versão corrida pra ler no teleprompter e legenda. Use quando o usuário disser
  "roteiro de reels", "o que eu falo no vídeo", "quero gravar um reels sobre X", "ideia de vídeo",
  "roteiro pro tiktok" ou /roteiro-reels.
---

# /roteiro-reels — Roteiro de Reels pronto pra gravar

O alcance de um Reels se decide nos primeiros segundos. Esta skill entrega um roteiro que segura a atenção desde o primeiro quadro e que dá pra gravar com o celular, sem equipe.

## Dependências

- **Voz:** `_memoria/preferencias.md` (a fala tem que soar como o dono fala, não como locutor)
- **Negócio:** `_memoria/empresa.md` (produto, oferta, contato)
- **Fórmulas:** `.claude/skills/instagram/referencias/formulas-de-gancho.md` (G9 e G10, e as de legenda adaptadas pra vídeo)
- **Algoritmo:** `.claude/skills/instagram/referencias/algoritmo.md` (seção Reels)
- **Legenda:** regras do `/legenda` e do `/hashtags`
- **Saída:** `marketing/conteudo/reels-<tema>-<YYYY-MM-DD>/roteiro.md` e `legenda.md`

## Workflow

### Passo 1 — Entender o vídeo

Perguntar só o que faltar:

1. **Tema e objetivo:** salvar, enviar, comentar ou seguir
2. **Duração:** 15, 30, 60 ou 90 segundos. Padrão: 30. Ensinar um passo a passo pede 45 a 60; opinião ou situação reconhecível cabe em 15 a 20
3. **Jeito de gravar:**
   - **Falando pra câmera** (rosto)
   - **Mãos e produto** (sem rosto, com narração ou só texto na tela)
   - **Tela do celular ou computador** (tutorial)
   - **Bastidor** (rotina, produção, antes e depois)
4. **Quem aparece e onde dá pra gravar** (balcão, cozinha, escritório, rua)

**Nunca inventar o específico.** Número, resultado, preço e nome vêm do usuário. Sem dado, perguntar uma vez ou mudar a fórmula.

### Passo 2 — Escolher a fórmula

| Objetivo | Fórmula pra Reels |
|---|---|
| Enviar | G9 Quebra de padrão, G2 Verdade contrária em vídeo, G7 Mito x verdade (um mito por cena) |
| Salvar | G10 Como eu fiz, G5 Lista em vídeo (um item por cena), G1 Resultado com número |
| Comentar | G3 Situação reconhecível (encenada), G4 Mini-história falando pra câmera |
| Seguir | G6 Antes e depois, G4 Mini-história |

Sugerir 2 e deixar o usuário escolher.

### Passo 3 — Gancho (0 a 3 segundos)

Três elementos ao mesmo tempo, e oferecer 3 opções de gancho:

- **Imagem do primeiro quadro:** já em movimento ou no meio da ação (nunca logo, nunca "oi gente")
- **Texto na tela:** a promessa ou a quebra, em até ~8 palavras, legível sem som
- **Primeira fala:** direto ao ponto, na mesma direção do texto

### Passo 4 — Roteiro cena por cena

Ritmo de fala de referência: **~2 a 2,5 palavras por segundo**. Roteiro com mais fala que isso não cabe no tempo.

```
| Tempo | Imagem (o que filmar) | Texto na tela | Fala |
|---|---|---|---|
| 0-3 s | close na massa sendo cortada, faca já entrando | "você corta o bolo errado" | "Se você corta bolo assim, ele seca em dois dias." |
| 3-8 s | mão mostrando o corte em fatia de cima | "1. corta do meio pra fora" | "Começa sempre pelo meio…" |
| … | … | … | … |
| 26-30 s | bolo inteiro de volta, mesmo enquadramento do início | "salva pra próxima festa" | "Salva pra não esquecer na próxima festa." |
```

Regras do corpo:

- **Uma ideia por cena**, cortes a cada 2 a 4 segundos em conteúdo rápido
- **Recompensa cedo:** a primeira dica ou revelação até os 8 segundos
- **Texto na tela em toda cena com informação** (muita gente assiste sem som)
- **Final em loop:** a última imagem conversa com a primeira, pra emendar no replay
- **Um pedido só no fim**, com motivo (salvar, enviar, seguir ou chamar no direct)

### Passo 5 — Complementos

- **Texto da capa:** até 5 palavras, legível no centro (a grade corta as bordas)
- **Áudio:** voz original quando há fala. Sem fala, indicar o clima ("música calma, procurar nas sugestões do app"). Nunca inventar o nome de música "em alta"
- **Versão teleprompter:** a fala corrida, sem tabela, pra ler gravando
- **Legenda:** curta, pelas regras do `/legenda`: contexto + motivo pra salvar ou enviar + 3 a 5 hashtags (`/hashtags`)

### Passo 6 — Checklist de gravação

- [ ] Vertical 9:16 (1080×1920), câmera traseira se der, lente limpa
- [ ] Luz de frente (janela ou luz do teto atrás do celular), nunca contra a luz
- [ ] Áudio: perto da boca, sem barulho de fundo; microfone de lapela ajuda
- [ ] Texto e rosto longe das bordas: a parte de baixo e a lateral direita ficam cobertas pelos botões do app
- [ ] Legenda automática (closed caption) ligada se houver fala
- [ ] Sem marca d'água de outro app (exportar sem o logo do CapCut ou do TikTok)
- [ ] Duração dentro do combinado; de 5 a 90 segundos entra na aba Reels

### Passo 7 — Entregar

Mostrar gancho (3 opções), tabela de cenas, capa, teleprompter e legenda. Com aprovação, salvar em `marketing/conteudo/reels-<tema>-<YYYY-MM-DD>/` (`roteiro.md` + `legenda.md`) e passar pelo `/humanizar` (modo leve) antes.

Se o usuário quiser uma capa desenhada com a marca, oferecer o `/carrossel` (post único em 1080x1920).

## Regras

- O gancho funciona nos 3 primeiros segundos e sem som
- Fala que caiba no tempo (~2 a 2,5 palavras por segundo)
- A fala soa como o dono fala, não como locutor de comercial
- Promessa do gancho cumprida no vídeo; gancho que o vídeo não paga derruba a distribuição
- Nunca inventar número, resultado ou depoimento
- Saúde, alimentação e finanças: sem promessa de resultado e sem caso de cliente ou paciente sem autorização

## Antipadrões (a skill recusa)

- Abrir com "Oi gente, tudo bem?", logo animado ou apresentação
- Vídeo de 60 segundos pra uma ideia de 15
- Texto na tela repetindo palavra por palavra a fala inteira (resumir)
- Três pedidos no final ("curte, comenta, compartilha e segue")
- Música "em alta" inventada
