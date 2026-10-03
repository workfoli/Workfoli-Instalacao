---
name: calendario-editorial
description: >
  Monta o calendário editorial da semana no Instagram: por dia, o formato (Reels, carrossel, foto,
  stories), o pilar, a fórmula de gancho, o ângulo, o horário e o objetivo, com meta semanal de
  salvamentos e envios e uma checagem de equilíbrio. Use quando o usuário disser "planeja minha
  semana no instagram", "o que eu posto essa semana", "calendário de conteúdo", "calendário
  editorial", "plano de conteúdo", "tô sem ideia do que postar" ou /calendario-editorial.
---

# /calendario-editorial — A semana do Instagram planejada

Troca o "o que eu posto hoje?" por um plano com ritmo: Reels pra alcance, carrossel pra salvamento, stories pra relação. A meta da semana é salvamentos e envios, não curtidas.

## Dependências

- **Foco e prazos:** `_memoria/estrategia.md` (lançamentos, datas, prioridade)
- **Negócio e público:** `_memoria/empresa.md`
- **Voz:** `_memoria/preferencias.md`
- **Temas de SEO (se existir):** `marketing/seo/05-estrategia-conteudo.md`, pra o Instagram puxar tráfego pro blog
- **Pilares:** `.claude/skills/calendario-editorial/referencias/pilares.md`
- **Fórmulas e horários:** `.claude/skills/instagram/referencias/formulas-de-gancho.md` e `algoritmo.md`
- **O que já saiu:** pastas recentes em `marketing/conteudo/`, pra não repetir tema nem capa
- **Saída:** `marketing/instagram/calendario-<YYYY-MM-DD>.md` (data da segunda-feira da semana)

## Workflow

### Passo 1 — Entradas

Usar o que já está na memória e perguntar só o que faltar:

- **Tema da semana** (opcional): lançamento, data comemorativa, sazonalidade
- **Público:** de `_memoria/empresa.md`
- **Capacidade real:** quantos posts por semana a pessoa consegue produzir. Padrão: 4 a 5 no feed + stories diários. Se ela produz 2, planejar 2 bons
- **Pilares:** padrão 40% Educativo / 30% Bastidores e história / 20% Conversa / 10% Oferta (ver `pilares.md`)
- **Dados da conta (se houver):** horários dos Insights, posts que mais salvaram

### Passo 2 — Validar os pilares

Somar 100%. Nenhum pilar acima de 50%. Oferta com no máximo 1 a 2 posts por semana.

### Passo 3 — Montar os dias

Pra cada dia com post, escolher: formato, pilar, fórmula (sem repetir mais de 2 vezes na semana), ângulo em uma linha, horário (do público) e objetivo.

| Dia | Formato | Pilar | Fórmula | Ângulo | Objetivo | Horário |
|---|---|---|---|---|---|---|
| Seg | Reels | Educativo | G9 Quebra de padrão | "você guarda o bolo na geladeira do jeito errado" | enviar | 12h |
| Ter | Carrossel | Educativo | G5 Lista | "7 perguntas pra fazer antes de encomendar o bolo do casamento" | salvar | 11h30 |
| Qua | Stories | Conversa | enquete + caixinha | "brigadeiro tradicional ou de pistache?" | comentar | 19h |
| Qui | Carrossel | Bastidores | G6 Antes e depois | "a cozinha em 2019 e hoje" | seguir | 11h |
| Sex | Foto | Conversa | G3 Situação reconhecível | "quando o cliente pede 'só um bolinho simples' pra 80 pessoas" | comentar | 13h |
| Sáb | Reels | Educativo | G10 Como eu fiz | "como eu decoro um bolo de 2 andares em 40 minutos" | salvar | 10h |
| Dom | Stories | Oferta | repost + link | "agenda de dezembro aberta" | seguir | 18h |

(Exemplo fictício. Ângulos reais saem do negócio; números reais saem do usuário.)

Horários: usar os Insights da conta quando existirem; senão, o ponto de partida de `algoritmo.md`, avisando que é estimativa.

### Passo 4 — Meta e stories

- **Meta de salvamentos + envios** da semana. Regra: pelo menos 3 posts feitos pra salvar (G1, G5, G6, G8, G10) e 2 pra enviar (G2, G7, G9). Acompanhar salvamentos e envios como número principal
- **Stories diários:** 2 a 4 telas por dia, com bastidor, uma figurinha (enquete ou caixinha) e o repost de um post recente do feed

### Passo 5 — Checagem de equilíbrio

- [ ] Formatos: pelo menos 2 Reels (alcance) e 2 carrosséis (salvamento), stories todo dia
- [ ] Pelo menos 3 posts pra salvar e 2 pra enviar
- [ ] Pelo menos 1 post de história real em primeira pessoa
- [ ] Nenhum pilar acima de 50% dos posts do feed
- [ ] Nenhuma fórmula mais de 2 vezes
- [ ] Oferta com 1 ou 2 posts no máximo
- [ ] Objetivos espalhados entre salvar, enviar, comentar e seguir

Com capacidade menor que 4 posts, ajustar a checagem à proporção e avisar o que ficou de fora.

### Passo 6 — Entregar

Mostrar o plano, salvar em `marketing/instagram/calendario-<YYYY-MM-DD>.md` e oferecer:

> "Quer que eu já produza algum? Carrossel vai pelo `/carrossel`, Reels pelo `/roteiro-reels`, legenda pelo `/legenda` e os stories de cada dia pelo `/stories`. Também posso pôr os posts da semana em `tarefas.md`."

Se o usuário pedir, devolver também um JSON simples (dia, formato, pilar, fórmula, ângulo, objetivo, horário) pra importar numa planilha ou ferramenta de agendamento.

## Regras

- **Constância ganha de frequência.** Não encher de post fraco pra bater número
- **Formato certo pro trabalho:** Reels pra alcance, carrossel pra salvamento, stories pra relação
- **Reels pode sair mais vezes** que carrossel sem cansar o público
- **Datas de `_memoria/estrategia.md` mandam:** lançamento ou data comemorativa da semana entra no plano
- Nunca inventar número de desempenho nem resultado nos ângulos

## Créditos

Adaptado do `ig-content-planner` do [instagram-skills](https://github.com/sergebulaev/instagram-skills) (MIT, Sergey Bulaev).
