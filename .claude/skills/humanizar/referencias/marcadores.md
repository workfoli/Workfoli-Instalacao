# Marcadores de texto de IA em português

Catálogo que o `/humanizar` aplica. Ler ao executar uma limpeza. Quando `_memoria/preferencias.md` disser que o negócio usa uma dessas palavras de propósito, ela sai da contagem.

## Como contar

O leitor percebe texto de IA por **acúmulo**, não por uma palavra solta. "Fundamental" num parágrafo é português. "Fundamental", "jornada" e "potencializar" no mesmo parágrafo é assinatura.

| Marcadores no parágrafo (ou slide) | Ação |
|---|---|
| 0 ou 1 | deixar |
| 2 | sinalizar no relatório, manter |
| 3 ou mais | reescrever o parágrafo inteiro, no registro do autor |
| ponte de revelação, paralelismo negativo ou anúncio de sinceridade | trocar sempre, mesmo sozinho |

- Vazamento de IA (abaixo) é apagado sem contagem.
- No texto inteiro, contar também os **trios** (3 ou mais → manter só o primeiro natural) e os **fragmentos soltos** (3 ou mais → juntar).
- Ao reescrever, manter o registro do autor: informal continua informal, os emojis dele ficam. Texto "neutro" de temperatura uniforme também é marca de IA.

---

## 1. Vazamento de IA (sempre apagar)

| Padrão | Ação |
|---|---|
| Marcas de citação de ferramenta (`oaicite`, `contentReference`, `turn0search0`, `【…†…】`) | apagar |
| "Como modelo de linguagem…", "Até a data do meu conhecimento…", "Não tenho acesso à internet" | apagar a frase |
| Campos de modelo: `[Seu nome]`, `[Nome da empresa]`, `[inserir X]`, `DD/MM/AAAA` | sinalizar e pedir o dado |
| "Claro! Aqui está…", "Espero que isso ajude!", "Se precisar de mais alguma coisa…" no começo ou fim do texto entregue | apagar |
| Travessão acima do teto (abaixo) | trocar o excesso |

### Teto de travessão

Até ~1 travessão (— ou – usado como pausa) a cada 100 palavras, com mínimo de 1 e máximo de 2 por legenda; 1 por slide. Manter o que faz mais trabalho (geralmente o primeiro) e trocar o excesso, nesta ordem:

1. **vírgula**, se o travessão liga uma oração à frase principal
2. **dois-pontos**, se introduz revelação, lista ou consequência
3. **parênteses**, se o par de travessões envolve um aparte
4. **quebra de linha**, o jeito nativo de legenda
5. **reescrever**, se nada disso soar natural

**Nunca ponto final.** Quebrar o travessão em ponto empilha frases curtas, marca pior que o travessão. Zero travessão num texto longo também é sinal de alguém tentando parecer humano: não perseguir o zero.

Hífen de palavra composta (bem-vindo) e intervalo de números (7–9, 11h–13h) não contam.

---

## 2. Vocabulário (contar por parágrafo)

| Marcador | Quando passar do limite, trocar por |
|---|---|
| significativo, significativamente | um número ("31% mais salvamentos"); sem número, perguntar |
| crucial, fundamental, essencial, primordial | cortar, ou "o mais importante" |
| notavelmente, particularmente, especialmente (como muleta) | cortar |
| abrangente, holístico, completo (como enfeite) | dizer o que cobre |
| robusto | sólido (manter se for termo técnico) |
| insights | dizer o que se aprendeu |
| alavancar, potencializar, impulsionar | usar, aumentar (com o número) |
| elevar ("elevar o seu negócio") | melhorar, subir (com o quê) |
| transformar, transformador, revolucionar, revolucionário | mudar; ou mostrar o antes e depois |
| desbloquear, destravar, desvendar | abrir, liberar, explicar |
| otimizar (fora do sentido técnico) | melhorar, acertar, cortar o desperdício de |
| fomentar, promover, empoderar | ajudar, criar, dar autonomia |
| jornada | caminho, processo, ou cortar |
| cenário, panorama ("no cenário atual") | mercado, área, ou cortar |
| ecossistema, universo ("no universo da confeitaria") | "na confeitaria", ou cortar |
| mergulhar, navegar, explorar (figurado) | ver, entrar em, lidar com |
| sinergia, estratégico (como enfeite), inovador, disruptivo | dizer o que faz de concreto |
| de forma eficaz, de maneira significativa, de modo eficiente | cortar, ou o número |
| solução, soluções (pra tudo) | o nome do produto ou serviço |

**Conectivos-muleta** (cada um conta como marcador; cortar quando passar do limite): vale ressaltar, é importante destacar, cabe lembrar, além disso (repetido), nesse sentido, diante disso, sendo assim, dessa forma, em suma, em resumo, por fim (como fecho), no entanto (repetido).

### Gramática (conta junto)

- **Abertura com gerúndio e vírgula:** "Pensando nisso, …", "Visando melhorar…, …", "Buscando…, …". Trocar pondo o sujeito primeiro: "Pensando nisso, criamos" → "Por isso criamos".
- **Nominalização** que esconde quem fez: "a realização de", "a implementação de", "a otimização do", "o aumento da". Usar o verbo: "a implementação do novo cardápio" → "quando mudamos o cardápio".
- **Substantivos abstratos empilhados:** transformação, otimização, inovação, eficiência, escalabilidade, excelência, sinergia, perto uns dos outros.
- **Português de tradução:** "no final do dia" (at the end of the day), "isso é sobre X" (this is about), "faz sentido?" em todo fecho, "você está procurando…?" como abertura. Trocar pelo jeito brasileiro de dizer.

### Expressões que viraram marca de IA (contam como marcador)

"e tá tudo bem", "simples assim", "ponto.", "fica a dica", "o pulo do gato", "pega a visão", "isso muda tudo", "e não é exagero", "nada mais, nada menos", "silenciosamente" ("silenciosamente lançou…"), "mindset", "level up", "next level".

---

## 3. Pontes de revelação (trocar sempre)

| Padrão | Correção |
|---|---|
| "O resultado?", "O segredo?", "A resposta?", "O motivo?", "A lição?" | apagar a ponte e deixar a frase seguinte |
| "Sabe o que aconteceu?", "Adivinha?" | apagar |
| "Aqui vai o que…", "Olha só o que…" no começo | apagar |
| "Vamos falar sobre…", "Bora falar de…", "Hoje eu quero falar sobre…" como abertura | começar pelo ponto |
| "Spoiler:", "Plot twist:", "E o melhor:", "Mas tem um detalhe:" | apagar |
| "Pare de X. Comece a Y." | duas afirmações diretas |

## 4. Paralelismo negativo (trocar sempre, com cuidado)

"Não é sobre X, é sobre Y", "Não é só X, é Y", "Não se trata de X, mas de Y", "Isso não é X. Isso é Y.", "Mais do que X, é Y", "Não é apenas um X, é um Y".

Reescrever como duas afirmações diretas, preservando o sentido. Como mexe no que o autor quis dizer, avisar no relatório.

## 5. Trios

Um trio natural com itens concretos fica ("Pix, cartão e boleto"). Marca de IA é o trio **vazio** (itens intercambiáveis, abstratos, sem nome nem número: "mais rápido, mais fácil e mais barato", "qualidade, confiança e excelência"), o trio **encenado** ("Sem X. Sem Y. Só Z.", "Simples. Rápido. Eficiente.") e o **terceiro trio** do mesmo texto.

- Trio vazio ou encenado: reescrever com 2 itens, ou com 4 em que um quebra o padrão.
- 3 ou mais trios no texto: manter só o primeiro natural.

## 6. Clichês de marketing (contam como marcador; em legenda, trocar sempre)

"no mundo atual", "nos dias de hoje", "em um mundo cada vez mais conectado/competitivo", "na era digital", "no mundo de [X]", "divisor de águas", "virada de chave", "próximo nível", "game changer", "imperdível", "indispensável", "experiência única", "experiência diferenciada", "qualidade ímpar", "excelência em tudo que faz", "soluções sob medida", "atendimento humanizado" (sem dizer o que o atendimento faz de diferente), "a verdade nua e crua".

## 7. Fechos mortos (trocar por um pouso ou um pedido com motivo)

"E você, o que acha?", "Comenta aqui embaixo!", "Deixa seu like!", "Marca 3 amigos", "Curte se concorda", "Faz sentido pra você?", "Bora?", "Vamos juntos?", uma palavra solta no fim ("Sempre.").

Pedido com motivo **não é** fecho morto: "salva pra usar no próximo orçamento", "manda pra quem vai casar esse ano".

## 8. Emoji

- 4 ou mais emojis numa legenda, ou emoji em toda linha: reduzir pra 0 a 3, com intenção.
- A sequência-assinatura de IA (🚀✨🔥💯🙌 enfileirados) sai inteira.
- Os 1 a 3 emojis que o autor usa de verdade ficam.

## 9. Anúncio de sinceridade e hesitação (nunca acrescentar; tirar se for abertura ou virada)

"Vou ser sincero(a)", "sendo bem honesto(a)", "papo reto", "a real é que", "real oficial", "vou abrir o coração", "desabafo:", "confissão:", "sem filtro:", "não vou mentir", "opinião impopular" (quando é popular), "POV:" em algo que não é ponto de vista.

Hesitação inserida: "talvez", "parece que", "posso estar errado, mas", "na minha humilde opinião". Só tirar se não aparecer nos textos de referência do autor.

Correção: apagar o anúncio e deixar a frase seguinte. Se a frase seguinte não for um fato concreto, o anúncio estava fazendo o papel da vulnerabilidade: pedir o fato ao autor.

---

## Preservar (voz do autor, não limpar)

- Registro informal: "pra", "tá", "né", "a gente", gírias e regionalismos
- Começo de frase minúsculo, se for o jeito do autor
- `..` como pausa e quebras de linha como compasso
- Um ou dois fragmentos intencionais ("toda vez.")
- Um travessão a cada ~100 palavras
- Um trio natural com itens concretos
- Uma frase longa de verdade por parágrafo
- Os 1 a 3 emojis do autor
- Números com referência e nomes próprios (acrescentar mais, nunca tirar)
- Detalhes sensoriais em primeira pessoa
- Reações e opiniões do autor, inclusive as duras. Tom chapado no texto inteiro é marca de humanizador
- Um marcador comum isolado ("fundamental" uma vez). Um não é veredito
- A história real dele. Nunca inventar detalhe pra legenda funcionar
