# Regras de classificação de gancho

Como o `/extrair-gancho` encaixa um post numa das 10 fórmulas de `.claude/skills/instagram/referencias/formulas-de-gancho.md`.

## 1. Formato

| Sinal | Formato |
|---|---|
| Uma foto + legenda | foto única (olhar G1 a G4) |
| 2 a 10 imagens com pontinhos de arrastar | carrossel (olhar G5 a G8) |
| Vídeo vertical com áudio | Reels (olhar G9 e G10) |

## 2. Sinais do gancho

### Legenda (primeiros ~125 caracteres)

| Sinal na primeira linha | Fórmula |
|---|---|
| Número quebrado + promessa de "como fiz / pode copiar" | G1 Resultado com número |
| Afirmação seca que contradiz o conselho comum | G2 Verdade contrária |
| Momento específico e compartilhado, sem introdução nem número | G3 Situação reconhecível |
| Marco de tempo em primeira pessoa + custo ou surpresa admitida | G4 Mini-história |

### Carrossel (slide 1 + estrutura)

| Sinal | Fórmula |
|---|---|
| Slide 1 promete N itens numerados; um item por slide | G5 Lista |
| Slide 1 mostra o "depois"; slide 2 o "antes"; corpo com passos | G6 Antes e depois |
| Slides do meio em pares "Mito:" / "Verdade:" | G7 Mito x verdade |
| Slide 1 nomeia um método; último slide resume numa tela | G8 Método pra copiar |

### Reels (primeiros 1 a 3 segundos)

| Sinal | Fórmula |
|---|---|
| Quebra de padrão / texto na tela que abre ciclo, sem introdução | G9 Quebra de padrão |
| "Como eu {resultado} em {prazo}" + passos rotulados | G10 Como eu fiz |

## 3. Confiança

- **Alta (0,8+):** gancho e corpo batem com um esqueleto
- **Média (0,5 a 0,8):** o gancho bate mas o corpo é solto, ou duas fórmulas se sobrepõem (comum: G1 e G10, ambos com resultado + passos). Devolver as duas
- **Baixa (abaixo de 0,5):** descrever a estrutura literal e sugerir a mais próxima

## 4. Objetivo principal

| Fechamento / estrutura | Objetivo provável |
|---|---|
| "salva", lista, método, passo a passo | salvar |
| "manda pra…", opinião contrária, mito derrubado | enviar |
| situação reconhecível, pergunta, confissão | comentar |
| prova de transformação, "segue pra…" | seguir |

## 5. Molde

Copiar o esqueleto da fórmula, manter os espaços e renomear pro tema do usuário. Não levar pro molde nenhum vício do original (pilha de marcadores, 30 hashtags). Um travessão no original tudo bem.

## 6. Auditoria da referência

Apontar, pra não copiar:

- travessão acima de ~1 a cada 100 palavras
- parágrafo com 3+ marcadores de IA
- 20 a 30 hashtags no topo
- isca de engajamento
- gancho que só faz sentido depois do "mais"
