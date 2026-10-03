# Como o Instagram distribui um post

Síntese das declarações públicas do Instagram (Adam Mosseri e a central de criadores) e de testes de criadores. Pesos relativos são **relatados pela comunidade**, não confirmados oficialmente. Cada superfície (Feed, Reels, Explorar, Stories) tem o seu modelo, mas os sinais abaixo valem pra todas.

## Sinais (impacto relativo no alcance)

| Sinal | Peso | Observação |
|---|---|---|
| **Envio / compartilhamento** (direct ou repost no story) | o mais alto | "envios por alcance" é o sinal em que o algoritmo mais se apoia |
| **Salvamento** | alto | "vou voltar nisso": dá alcance pra listas, métodos e passo a passo |
| **Comentário** (principalmente com resposta do autor) | alto | conversa real é sinal de qualidade |
| **Tempo assistido, conclusão e replay** | alto (Reels) | em vídeo, retenção decide a distribuição |
| **Visita ao perfil que vira follow** | alto | o sinal de crescimento |
| **Curtida** | baixo | aprovação barata, pouco alcance |
| **Negativos:** "não tenho interesse", deixar de seguir, ocultar, denunciar | penalidade pesada | uma denúncia pesa mais que muitas curtidas |

Pergunta antes de postar: **alguém mandaria isso pra um amigo específico, ou salvaria pra usar depois?** Se o post só ganha uma curtida passiva, afiar.

## Os primeiros 30 a 60 minutos

- A janela inicial define a trajetória. Salvamentos, envios e comentários cedo fazem o post chegar a quem não segue (Explorar e aba Reels).
- Responder rápido aos primeiros comentários puxa mais comentários.
- Reels que segura os 3 primeiros segundos no teste inicial ganha distribuição maior.

## O que derruba o alcance

- **Isca de engajamento** ("comenta SIM", "marca 3 amigos", "curte se concorda") é rebaixada de propósito.
- **Vídeo com marca d'água de outro app** (logo do TikTok, CapCut) é rebaixado no Reels.
- **Legenda tomada por hashtags** (20 a 30 no topo) parece spam e não ajuda.
- **Proporção fora de 4:5 a 1,91:1** é cortada.
- **Muita gente ocultando, deixando de seguir ou denunciando** derruba a distribuição rápido.

> "Comenta QUERO que eu te mando o link" só é CTA legítimo quando existe automação de direct funcionando. Sem ela, é isca.

## O que aumenta o alcance

- **Envio é a alavanca.** Post feito pra ser mandado pra alguém (uma verdade reconhecível, uma lista útil, um "você precisa ver isso") alcança mais que post feito pra curtida.
- **Salvamento acumula.** Listas, métodos, passo a passo e antes/depois continuam ganhando alcance por dias.
- **Reels com boa retenção** é o formato mais empurrado pra quem não segue. Áudio original e texto na tela ajudam.
- **Carrossel ganha segunda chance:** quem não arrastou pode ver o slide 2 numa nova exibição.
- **Responder comentários e directs** na primeira hora mantém a conversa viva.

## Limites de formato

| Item | Limite |
|---|---|
| Legenda | 2.200 caracteres (só ~125 aparecem antes do "mais") |
| Hashtags | até 30 por post (mas 3 a 5 é a prática atual) |
| Carrossel | 2 a 10 itens pela API (o app permite 20) |
| Imagem | JPEG pela API de publicação (o `/aprovar-post` já converte); até 8 MB |
| Reels | até 3 min pela API; de 5 a 90 s entram na aba Reels |
| Vídeo | até 300 MB |
| Carrossel misto (foto + vídeo) | não aceito pela API |
| Proporção | 4:5 (retrato) a 1,91:1 (paisagem); 4:5 ocupa mais tela |
| Limite de publicações | ~50 por 24 h (algumas contas relatam 25) |

**Todo post precisa de mídia.** Uma imagem vira foto; de 2 a 10, carrossel; um vídeo, Reels.

## Carrossel

- **O slide 1 é o funil inteiro.** Promete e abre um ciclo, ou ninguém arrasta.
- **Valor na frente.** A taxa de quem arrasta cai a cada slide: o melhor ponto vai no 2 ou no 3.
- **6 a 10 slides** pra lista ou ensino. Cada slide um ponto, que se sustenta sozinho.
- **O último slide ganha o salvamento e o follow:** resumo numa tela + um pedido só.
- **Pensar no quadro 4:5.**

## Reels

- **Os 3 primeiros segundos decidem.** Quebra de padrão, texto na tela, direto ao ponto. Sem "oi gente".
- **Retenção e replay são o objetivo.** Final que emenda no começo aumenta o replay.
- **Texto na tela** pega quem assiste sem som.
- Áudio original ou em alta ajuda, mas gancho e retenção pesam mais.
- Sem marca d'água de outro app.

## Stories

- **Não trazem alcance novo**: aprofundam a relação com quem já segue.
- **Repostar o post do feed no story** funciona como envio e leva o post a quem não viu.
- Figurinhas de enquete, caixinha de perguntas e quiz rendem os toques que mantêm a conta na frente da fila de stories.

## Horários

Ponto de partida relatado por criadores, no horário local do público: **dias úteis de 11h a 13h e de 19h a 21h, e domingo à noite**. Para negócios B2B, terça a quinta no meio da manhã e no almoço. **Sempre conferir nos Insights da conta** (Público → horários mais ativos) e preferir o dado da conta ao ponto de partida.

- Constância ganha de frequência: 3 a 5 posts bons por semana, com ritmo fixo, rendem mais que um post fraco por dia.
- Reels pode sair com mais frequência que carrossel, porque cada um alcança gente nova.

## Checklist pré-publicação

- [ ] Os primeiros 125 caracteres da legenda param a rolagem sozinhos
- [ ] No máximo ~1 travessão a cada 100 palavras
- [ ] Nenhum parágrafo com 3 ou mais marcadores de texto de IA (ver `regras-de-voz.md`)
- [ ] Um número com referência (de quem, do quê, quando) onde a afirmação permite
- [ ] 3 a 5 hashtags dimensionadas, no fim da legenda ou no primeiro comentário
- [ ] 0 a 3 emojis, com intenção
- [ ] Carrossel: slide 1 promete e abre ciclo; o último resume e faz um pedido
- [ ] Mídia definida e dentro dos limites (sem misturar foto e vídeo, 2 a 10 slides)
- [ ] Fechamento com motivo ("salva pra usar na próxima compra"), não "o que vocês acham?"
- [ ] Um objetivo principal (salvar, enviar, comentar ou seguir), não todos ao mesmo tempo
