---
name: instagram
description: >
  Kit de Instagram do Workfoli: indica qual skill usar (legenda, carrossel, hashtags, calendário,
  perfil, nicho, gancho de post viral, reaproveitamento, revisão anti-cara-de-IA) e guarda as
  referências compartilhadas (fórmulas de gancho, algoritmo, hashtags, regras de voz). Use quando o
  usuário disser "me ajuda com o instagram", "o que dá pra fazer no instagram", "quero crescer no
  instagram", "kit de instagram" ou /instagram sem uma tarefa específica.
---

# /instagram — Kit de Instagram

Porta de entrada das skills de Instagram. Quando o pedido já é específico ("faz uma legenda", "planeja a semana"), ir direto pra skill certa sem passar por aqui.

## Qual skill usar

| O usuário quer… | Skill |
|---|---|
| Legenda pra foto, post único ou Reels | `/legenda` |
| Carrossel (texto + visual com a marca) | `/carrossel` |
| Hashtags que a conta consegue ranquear | `/hashtags` |
| Planejar a semana (Reels, carrosséis, stories) | `/calendario-editorial` |
| Tirar a cara de IA de um texto ou auditar antes de postar | `/humanizar` |
| Entender por que um post viralizou e copiar a estrutura | `/extrair-gancho` |
| Transformar post do LinkedIn, artigo ou vídeo em post de Instagram | `/reaproveitar` |
| Revisar bio, nome, destaques, grade e fixados | `/perfil-instagram` |
| Ver o que está funcionando no nicho ou os números de um concorrente | `/nicho-instagram` |
| Blog + carrossel + legendas de um tema | `/publicar-tema` |
| Publicar no Instagram e no Facebook | `/aprovar-post` |

Sem tarefa clara: perguntar o objetivo do momento (alcance, salvamentos, seguidores ou vendas), olhar `_memoria/estrategia.md` e sugerir no máximo duas skills pra começar.

## Regras que valem pra todas as skills de Instagram

1. **Voz do negócio:** `_memoria/preferencias.md` manda. Se estiver em branco, sugerir uma vez o `/humanizar voz` (aprende o jeito de escrever a partir de 3 a 6 posts reais) e seguir com as regras gerais.
2. **Nunca inventar o específico.** Número, data, nome de cliente e resultado vêm do usuário. Sem dado concreto, perguntar uma vez; se não houver, cortar a frase em vez de enfeitar. Número inventado publicado vira retratação.
3. **Mídia é obrigatória.** O Instagram não aceita post só de texto. Toda entrega lembra qual imagem, vídeo ou slides o usuário precisa anexar.
4. **Rascunho antes de tudo.** Nada é publicado sem aprovação explícita. Publicação automática só pelo `/aprovar-post`; fora isso, a entrega é texto pronto pra copiar.
5. **Gancho nos primeiros ~125 caracteres.** É o que aparece antes do "mais".
6. **Hashtags são calibre, não volume:** 3 a 5 dimensionadas (ver `/hashtags`).
7. **Passada do `/humanizar`** em todo texto antes de mostrar.

## Referências compartilhadas

Ler só a que a tarefa pede:

- `.claude/skills/instagram/referencias/formulas-de-gancho.md`: as 10 fórmulas (legenda, carrossel, Reels) por objetivo
- `.claude/skills/instagram/referencias/algoritmo.md`: sinais que dão alcance, limites de formato, horários, checklist pré-publicação
- `.claude/skills/instagram/referencias/hashtags.md`: o modelo de 3 a 5 hashtags por tamanho
- `.claude/skills/instagram/referencias/regras-de-voz.md`: regras de escrita e marcadores de texto de IA em português

## Onde salvar

- Post único e Reels: `marketing/conteudo/<post|reels>-<tema>-<YYYY-MM-DD>/legenda.md`
- Carrossel: o que o `/carrossel` já define em `marketing/conteudo/`
- Calendário, perfil, nicho e banco de ganchos: `marketing/instagram/`
- Dados brutos (exports, JSON de coleta): `dados/instagram/`, que nunca vai pro Git

## Créditos

Método adaptado do [instagram-skills](https://github.com/sergebulaev/instagram-skills), de Sergey Bulaev, sob licença MIT (texto completo em `CREDITOS.md`, nesta pasta). A adaptação traduz pro português, troca o perfil de voz pela memória do Workfoli e usa o `/aprovar-post` no lugar dos serviços de publicação do projeto original.
