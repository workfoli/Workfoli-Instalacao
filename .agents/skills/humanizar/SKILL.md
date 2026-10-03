---
name: humanizar
description: >
  Tira a "cara de IA" de qualquer texto em português (legenda, carrossel, e-mail, artigo, proposta,
  resposta de avaliação) sem mudar o sentido nem a voz do autor; audita uma legenda antes de postar
  (modo auditar); e aprende o jeito de escrever do negócio a partir de posts reais (modo voz). Use
  quando o usuário disser "humaniza esse texto", "tira a cara de IA", "tá parecendo ChatGPT",
  "revisa antes de postar", "audita essa legenda", "aprende meu jeito de escrever" ou /humanizar.
---

# /humanizar — Texto que soa como gente

Remove o que leitores percebem como texto de IA: vocabulário em excesso, pontes de revelação, frases picadas pra dar drama, trios vazios, sinceridade encenada e emoji demais. Também audita legendas e calibra a voz do negócio.

**O que esta skill não faz:** não promete passar em detector de IA (GPTZero e parecidos). Nenhuma edição garante isso, e em textos curtos a nota desses detectores é ruído. O objetivo é o leitor humano: quem percebe o padrão para de confiar no texto.

## Dependências

- **Voz do negócio:** `_memoria/preferencias.md` (tom, o que evitar, exemplo de referência). Sempre tem prioridade sobre as regras gerais
- **Catálogo de marcadores:** `.claude/skills/humanizar/referencias/marcadores.md` (ler ao executar uma limpeza)
- **Checklist de auditoria:** `.claude/skills/humanizar/referencias/checklist-auditoria.md`
- **Exemplos de antes e depois:** `.claude/skills/humanizar/referencias/exemplos.md`
- **Regras de Instagram:** `.claude/skills/instagram/referencias/regras-de-voz.md` (quando o texto for pra rede social)

## Modos

| Comando | O que faz |
|---|---|
| `/humanizar` (padrão) | Reescreve com as 4 passadas e mostra o que mudou |
| `/humanizar leve` | Só o essencial: vazamento de IA, frases sempre proibidas e parágrafos com 3+ marcadores. É o modo que as outras skills usam antes de entregar |
| `/humanizar auditar` | Não reescreve: aplica o checklist pré-publicação e devolve REPROVADO, APROVADO COM RESSALVAS ou APROVADO, com as correções |
| `/humanizar voz` | Aprende a voz do negócio com 3 a 6 textos reais e propõe a atualização de `_memoria/preferencias.md` |

No Codex: `$humanizar`, `$humanizar leve`, `$humanizar auditar`, `$humanizar voz`.

---

## As 4 passadas (modo padrão)

### Passada 1 — LIMPAR (contar, depois trocar)

Aplicar o catálogo de `marcadores.md`. A unidade de julgamento é o **parágrafo** (ou o slide), não a palavra:

- **0 ou 1 marcador:** deixar.
- **2 marcadores:** sinalizar no relatório, manter as palavras.
- **3 ou mais:** reescrever o parágrafo inteiro, no registro do autor.
- **Sempre trocar, mesmo sozinhos:** vazamento de IA (marcas de citação, "como modelo de linguagem", campos `[Seu nome]`), pontes de revelação, paralelismo negativo ("não é sobre X, é sobre Y") e anúncios de sinceridade.

Nunca trocar uma palavra por sinônimo da mesma lista ("alavancar" → "potencializar" não resolve).

Formato de Instagram (quando for legenda ou slide): gancho que se sustenta nos primeiros 125 caracteres, 3 a 5 hashtags no fim, 0 a 3 emojis, slide 1 com promessa, legenda até 2.200 caracteres.

### Passada 2 — RITMO (só contra a uniformidade)

Não fabricar variação. O que denuncia texto de IA hoje é o ritmo encenado: "Curto. Direto. Pronto.", "Sem X. Sem Y. Só Z.", linhas de uma palavra pra dar drama ("Ainda."), perguntas e respostas falsas ("Por quê? Simples."), alternância mecânica de frase curta e longa.

- Juntar essas sequências numa frase completa.
- No máximo 2 fragmentos soltos por texto. Um "toda vez." é estilo; três é padrão.
- Só mexer num parágrafo quando todas as frases têm o mesmo tamanho e soam chapadas, e aí mexer em uma frase, não no parágrafo.
- **Diagramação não é ritmo:** uma ideia por linha, com linha em branco entre elas, é o formato nativo de legenda e fica.

### Passada 3 — ACRESCENTAR (marcas humanas, sem inventar)

Onde o conteúdo permitir, pedir ao usuário (nunca fabricar):

- Um número com referência: de quem, do quê, quando ("de 0 a 10 mil seguidores em 4 meses, postando 3 vezes por semana", não "cresci rápido")
- Um nome próprio (pessoa, marca, ferramenta, lugar, data)
- Um detalhe concreto em primeira pessoa (o que viu, quanto custou, o que quebrou)
- Um fato desconfortável, datado e dito sem moldura: "Perdi meu maior cliente em 14 de fevereiro." e não "Vou ser sincero, essa doeu: perdi um cliente."

**Proibido acrescentar:** anúncio de sinceridade ("vou ser sincera", "papo reto", "a real é que"), hesitação que o autor não escreveu ("talvez", "posso estar errado, mas") e confissão emoldurada. Isso deixa o texto **mais** com cara de IA.

Se faltar o dado concreto, perguntar: "Tem um número, um nome ou um momento real pra pôr aqui?"

### Passada 4 — AUTOCONFERÊNCIA (contra o exagero)

Reler o resultado uma vez e responder:

1. A passada 2 criou frases picadas, pontes de revelação ou gangorra curta/longa? Se sim, juntar de volta.
2. A passada 3 acrescentou moldura de sinceridade ou hesitação? Se sim, tirar e deixar só o fato.
3. A limpeza achatou a voz: tom uniforme, sem reação, sem detalhe, sem nenhum travessão, sem nenhum trio, sem os emojis que o autor usa, registro informal "corrigido"? Se sim, devolver o que o autor tinha.

Edição proporcional ao problema: texto limpo recebe dois ou três toques, não uma cota. **Na dúvida se é o autor ou a máquina, deixar.**

## Entrega (modo padrão e leve)

```
Texto revisado:
<texto>

O que mudou:
- <trecho antigo> → <trecho novo> (motivo)
- …

Densidade por parágrafo: P1: 0 · P2: 3 → reescrito · P3: 1
Leitura: soa humano | misto | soa IA   (estimativa de leitor, não nota de detector)
[Instagram] Gancho: <N> caracteres antes do "mais" · Hashtags: <N> · Emojis: <N>
```

No modo leve, chamado por outra skill, entregar só o texto revisado e, se houver, uma linha com o que mudou.

---

## Modo auditar

Aplicar `referencias/checklist-auditoria.md` sem reescrever:

- Algum bloqueio → **REPROVADO**, com a correção de cada item e a oferta: "Quer que eu já reescreva?"
- Sem bloqueio, com alertas → **APROVADO COM RESSALVAS**, cada alerta com a correção sugerida
- Limpo → **APROVADO**, com a nota de horário (ver `.claude/skills/instagram/referencias/algoritmo.md`) e o lembrete da mídia

Relatar a densidade por parágrafo (marcadores, travessões a cada 100 palavras, fragmentos, trios). Nunca estimar nota de detector.

---

## Modo voz

Constrói a voz do negócio a partir de textos reais, pra todas as skills escreverem do jeito do dono.

1. Pedir de 3 a 6 textos reais e recentes (legendas, e-mails, mensagens). Só texto escrito pelo próprio negócio, nunca de terceiros.
2. Extrair dos textos, sem supor: ritmo das frases, aberturas recorrentes, pontuação (travessão, reticências, `..`), palavras favoritas, palavras que nunca aparecem, uso de emoji e hashtag, maiúsculas, gírias e regionalismos, jeito de chamar pra ação.
3. Montar a proposta de atualização de `_memoria/preferencias.md`, acrescentando sem reescrever o arquivo:
   - **Tom de voz:** 2 a 3 frases que descrevem o jeito real
   - **O que evitar:** o que nunca aparece nos textos + o que o usuário disser que detesta
   - **Exemplo de referência:** as 2 a 4 linhas mais características, copiadas como estão
   - **Preferências adicionais:** emoji (quantos e quais), hashtags, CTA e link, registro (formal/informal)
4. Mostrar a alteração e gravar só com aprovação.
5. Com só 3 textos, avisar que é uma primeira versão e sugerir repetir com 10 ou mais.

Nunca registrar algo que o usuário não forneceu. Dados de clientes que apareçam nos textos (nomes, telefones) não vão pra memória.

---

## Regras

- **Limpeza é sempre parte do trabalho.** Pedido de humanizar, revisar ou publicar passa pelo menos pelo modo leve, mesmo que o autor ame o texto ou esteja com pressa. Se algo impedir mexer no texto, dizer quais marcas ficaram.
- **Proporcional.** Passada que não acha nada não muda nada. Não inventar edição pra justificar a execução.
- **Preservar sentido e afirmação.** Voz é o jeito do autor; pontes de revelação, frases picadas e parágrafo com 3+ marcadores não são voz.
- **Nunca introduzir fato** que não estava no texto. Faltou número, perguntar.
- **Preservar o que é do autor:** começo minúsculo, `..`, "pra/tá/né", um travessão a cada ~100 palavras, um trio natural, os 1 a 3 emojis que ele usa, gírias e regionalismos.
- **Nunca prometer resultado de detector.** Se perguntarem "vai passar no detector?", responder com honestidade: ninguém garante, e em texto curto a nota é ruído.
- **Respeitar o formato:** não transformar slides em legenda nem o contrário sem avisar.
- **Legenda de Instagram:** nunca apresentar como pronta sem lembrar da mídia.

## Créditos

Adaptado do `ig-humanizer` do [instagram-skills](https://github.com/sergebulaev/instagram-skills) (MIT, Sergey Bulaev). Os limiares (densidade por parágrafo, teto de travessão, limite de fragmentos) vêm do original, calibrado em textos em inglês; a lista de marcadores em português foi feita pro Workfoli e deve ser ajustada com o uso, via `_memoria/preferencias.md`.
