---
name: anuncio-google
description: >
  Cria a estrutura completa de uma campanha de Google Ads a partir de um briefing ou da pesquisa
  do /seo. Gera CSVs prontos pra importar no Google Ads Editor, com campanhas de Pesquisa
  organizadas por cluster de palavras-chave, grupos de anúncios, anúncios responsivos (RSA),
  recursos (sitelinks, chamada, snippets) e palavras-chave negativas. Use quando o usuário pedir
  "criar campanha no google ads", "anúncio no google", "google ads", "csv pro google ads" ou
  /anuncio-google.
---

# /anuncio-google — Campanha de Google Ads pronta pra importar

Monta a campanha inteira em CSV pro Google Ads Editor. Sai do briefing direto pro arquivo, sem montar grupo por grupo na interface do Google.

## Dependências

- **Contexto do negócio:** `_memoria/empresa.md` (produto/serviço, público, região, diferenciais, contato)
- **Tom de voz:** `_memoria/preferencias.md`
- **Pesquisa SEO (se existir):** `marketing/seo/01-pesquisa-demanda.md` e `06-google-ads.md`
- **Saída:** `marketing/campanhas/google-ads-<YYYY-MM-DD>/`

---

## Workflow

### Passo 1 — Briefing

Se já existir `marketing/seo/06-google-ads.md` (criado pelo `/seo`), usar como base e pular o que já foi respondido. Senão, perguntar numa mensagem só:

1. **O que anunciar?** (1-3 linhas)
2. **Pra quem?** (perfil, dor que resolve)
3. **Onde?** Raio em km a partir de qual cidade (ou regiões)
4. **Orçamento diário?** (R$/dia)
5. **Objetivo:** ligação, WhatsApp, formulário ou visita?
6. **Página de destino:** URL do site ou da landing page

### Passo 2 — Palavras-chave

Se existir `marketing/seo/01-pesquisa-demanda.md`, usar os 10-20 termos prioritários (intenção comercial e transacional).

Senão:
- 30-50 termos-semente a partir do briefing
- Busca na web por grupo de termos: concorrência, sazonalidade
- Ficar só com intenção **comercial/transacional** (descartar as informacionais)
- Agrupar em **clusters** (ex: "feijoada-buffet", "feijoada-restaurante", "feijoada-evento")

### Passo 3 — Estrutura da campanha

**Padrão recomendado pra negócio local:**

```
Campanha 1: <Negócio> — Pesquisa
├── Grupo: <Cluster 1>
│   ├── 10-15 palavras-chave (correspondência de frase e exata)
│   ├── até 3 anúncios responsivos (15 títulos + 4 descrições cada)
│   └── negativas do grupo
├── Grupo: <Cluster 2>
│   └── ...
└── ... (1 grupo por cluster do Passo 2)

Campanha 2: <Negócio> — Local (opcional)
├── Anúncios no Maps
└── Segmentação por proximidade

Lista global de negativas: termos genéricos descartados, "grátis", "emprego", "curso" etc.
```

### Passo 4 — Textos dos anúncios (RSA)

Pra cada grupo, até 3 anúncios responsivos.

**15 títulos** por anúncio:
- 5 com a keyword principal
- 3 com diferenciais concretos (certificação, prazo, garantia)
- 3 com CTA ("Peça seu orçamento", "Chame no WhatsApp", "Fale agora")
- 2 com prova social (anos de mercado, número de clientes)
- 2 com o benefício principal pro cliente

**4 descrições:**
- 1 institucional + CTA
- 1 com diferencial técnico + CTA
- 1 com urgência ou condição especial (só se for verdade)
- 1 com prova social + CTA

**Limites e políticas do Google:**
- Título: até 30 caracteres. Descrição: até 90 caracteres. Contar sempre
- Sem emoji, sem CAIXA ALTA, sem títulos repetidos
- Nada de superlativo sem comprovação ("o melhor", "número 1")

Tom conforme `_memoria/preferencias.md`.

### Passo 5 — Recursos (antigas extensões)

Um CSV por tipo:

- **Sitelinks** (4-6): "Sobre nós", "Catálogo", "Cases", "WhatsApp", "Localização"
- **Chamada:** telefone de "Contato principal" em `_memoria/empresa.md`
- **Snippets estruturados:** lista de serviços, categorias de produto
- **Preço** (se aplicável): faixas de preço dos serviços principais
- **Promoção** (se aplicável): desconto, condição especial

### Passo 6 — Configurações

Criar `configuracoes.md` com:

- **Estratégia de lance:** "Maximizar conversões" pra começar; definir um CPA desejado depois de 30+ conversões em 30 dias
- **Orçamento diário:** conforme o briefing
- **Local:** raio em km a partir do endereço, ou regiões
- **Idioma:** português
- **Dispositivos:** com lance automático, ajuste por dispositivo não tem efeito (só -100% pra excluir). Excluir um dispositivo apenas com dado que justifique
- **Programação:** dias e horários de atendimento do negócio
- **Conversões:** clique no WhatsApp, envio de formulário, ligação. Configurar no Google Ads (tag do Google ou Google Tag Manager) antes de ativar

### Passo 7 — Gerar os CSVs

```
marketing/campanhas/google-ads-<YYYY-MM-DD>/
  campanhas.csv            ← uma linha por campanha
  grupos.csv               ← uma linha por grupo de anúncios
  keywords.csv             ← palavras-chave + tipo de correspondência
  keywords-negativas.csv   ← negativas por grupo + lista global
  anuncios.csv             ← RSAs (títulos + descrições)
  extensoes-sitelinks.csv
  extensoes-chamadas.csv
  extensoes-snippets.csv
  extensoes-preco.csv      ← se aplicável
  configuracoes.md         ← configurações + checklist
  README.md                ← passo a passo pra importar no Google Ads Editor
```

**Formato:**
- Cabeçalhos em inglês, como o Google Ads Editor usa: `Campaign`, `Ad group`, `Keyword`, `Criterion Type` (Exact, Phrase, Broad; nas negativas, Negative Exact, Negative Phrase), `Headline 1` … `Headline 15`, `Description 1` … `Description 4`, `Final URL`, `Path 1`, `Path 2`, `Campaign Status`, `Ad Group Status`, `Budget`
- Todo status como `Paused`
- Codificação UTF-8, separador vírgula, textos com vírgula entre aspas
- Dica pro README: exportar um CSV qualquer da conta no Editor mostra o formato exato da versão instalada. Na importação, o Editor deixa mapear colunas

Antes de entregar, validar com um script (Node ou Python) que nenhum título passa de 30 caracteres e nenhuma descrição passa de 90. Corrigir o que estourar.

### Passo 8 — Resumo + próximos passos

```
✓ Campanha pronta: marketing/campanhas/google-ads-<YYYY-MM-DD>/

Estrutura:
- <N> campanhas
- <N> grupos de anúncios
- <N> palavras-chave
- <N> palavras-chave negativas
- <N> anúncios responsivos

Pra subir:
1. Abrir o Google Ads Editor (programa de computador)
2. Conta → Importar → Do arquivo
3. Importar nesta ordem: campanhas, grupos, keywords, negativas, anúncios, extensões
4. Revisar: tudo entra pausado
5. Conferir se as conversões estão configuradas no Google Ads
6. Publicar as alterações e ativar quando estiver tudo certo

Sugestão de teste: R$<X>/dia por <Y> dias antes de avaliar.
```

---

## Regras

- **Nunca inventar CPC.** Se perguntarem quanto vai custar, explicar que depende da concorrência real e dar uma faixa com base em pesquisa, citando a fonte
- **Sempre começar pausado.** O usuário revisa e ativa
- **Não anunciar pra termo informacional.** "Como fazer X" raramente converte: isso é trabalho do SEO orgânico
- **Correspondência:** frase na maioria, exata pros termos mais valiosos, ampla só com histórico de conversões e lance automático
- **Lista global de negativas é obrigatória.** Sem ela, o orçamento vai embora em buscas irrelevantes
- **Conversão antes de tudo.** Sem conversão configurada, o Google não otimiza. Avisar e pedir o setup antes de ativar
- Textos seguem `_memoria/preferencias.md` à risca. Sem jargão que o público não usa
