---
name: analisar-dados
description: >
  Analisa um arquivo de dados (CSV, planilha Excel, PDF, TXT ou JSON) e gera um resumo executivo
  com os principais números, tendências, alertas e recomendações. Use quando o usuário disser
  "analisa esse arquivo", "o que mostram esses dados", "resume esses resultados", "analisa essa
  planilha", "analisa esse relatório" ou soltar um arquivo em `dados/`.
---

# /analisar-dados — Análise de arquivo

## Dependências

- **Contexto do negócio:** `_memoria/empresa.md` (pra entender o que os dados representam)
- **Foco atual:** `_memoria/estrategia.md` (pra priorizar o que importa agora)
- **Tom de voz:** `_memoria/preferencias.md`
- **Entrada:** normalmente em `dados/`
- **Saída:** `saidas/analises/`

---

## Workflow

### Passo 1 — Entender o contexto

Se não estiver claro pelo nome ou pelo conteúdo do arquivo, perguntar:
- "O que é esse arquivo? (vendas, anúncios, métricas, pesquisa...)"
- "Qual a pergunta principal que você quer responder com ele?"

Se o contexto for óbvio, seguir sem perguntar.

### Passo 2 — Ler o arquivo e conferir a qualidade

- **CSV / TXT / JSON:** ler direto. Arquivo grande (milhares de linhas): não jogar tudo na conversa, calcular com script
- **Excel (.xlsx):** ler com Python (pandas/openpyxl) ou Node, ou com a skill `xlsx` se estiver instalada. Conferir todas as abas
- **PDF:** extrair texto e tabelas com a skill `pdf` (se instalada) ou uma ferramenta de extração

Antes de analisar, checar e relatar: linhas vazias ou duplicadas, colunas com formato misturado, períodos faltando, totais que não fecham.

### Passo 3 — Análise

**Todo número vem de cálculo feito com código** (Node ou Python), nunca estimado de olho. Guardar o script usado junto da análise se for útil repetir.

Identificar:

**O que está bom:**
- Métricas acima da média ou crescendo
- Padrões positivos
- Destaques (produtos, campanhas, períodos)

**O que preocupa:**
- Quedas, anomalias, tendências negativas
- O que está abaixo do esperado
- Gargalos ou desperdícios visíveis

**Comparações:**
- Período atual vs anterior (se houver)
- Melhores vs piores
- Distribuição entre categorias

**O que não é óbvio:**
- Correlações interessantes (sem afirmar causa sem evidência)
- Padrões que a leitura rápida não mostra

### Passo 4 — Resultado

Resumo executivo em prosa (não só tópicos):

```markdown
# Análise — [nome do arquivo/relatório]
*[data da análise] · fonte: [arquivo]*

## O que esses dados mostram
[2-3 parágrafos com o panorama]

## O que está funcionando
[lista com contexto]

## O que merece atenção
[lista com contexto]

## 3 recomendações
1. [ação concreta]
2. [ação concreta]
3. [ação concreta]

## Números-chave
| Métrica | Valor | Contexto |
|---------|-------|----------|
| ... | ... | ... |

## Observações sobre os dados
[problemas de qualidade encontrados no Passo 2, se houver]
```

Salvar em `saidas/analises/analise-<nome>-<YYYY-MM-DD>.md`.

Perguntar se quer uma versão em HTML pra compartilhar ou apresentar, e se algo da análise deve ir pra `_memoria/estrategia.md`.

---

## Regras

- Prosa, não só lista: o usuário precisa entender sem abrir o arquivo original
- Nunca inventar dado que não está no arquivo
- Números sempre calculados com código
- Dados incompletos ou com problema: avisar antes da análise, não esconder no rodapé
- Tom conforme `_memoria/preferencias.md`
