---
name: carrossel
description: >
  Cria carrosséis e posts visuais pra Instagram, TikTok e LinkedIn com a identidade visual da marca.
  Gera um HTML estilizado, renderiza em PNG 1080x1350 com `scripts/render.js` e entrega a legenda
  pronta. Suporta carrossel só com texto, carrossel com foto (real ou gerada por IA) e post único.
  Use quando o usuário pedir "carrossel", "post", "conteúdo pro instagram", "criar imagem",
  "gerar foto", "post educativo" ou /carrossel.
---

# /carrossel — Carrossel e posts visuais

Skill central de conteúdo visual. Recebe um tema e entrega HTML estilizado, PNGs prontos pra postar e a legenda no padrão da marca.

## Dependências

- **Identidade visual:** `identidade/design-guide.md` (LER ANTES de criar qualquer visual)
- **Contexto do negócio:** `_memoria/empresa.md` (@ das redes, contato, diferenciais)
- **Tom de voz:** `_memoria/preferencias.md`
- **Render:** `scripts/render.js` (Playwright). Na primeira vez, `npm install` na raiz do projeto
- **Foto com IA (opcional):** `scripts/gerar-imagem.js` com `OPENAI_API_KEY` ou `GEMINI_API_KEY` no `.env`, ou um conector de imagem ativo
- **Saída:** `marketing/conteudo/<tipo>-<tema>-<YYYY-MM-DD>/`

---

## Tipos de conteúdo

### 1. CARROSSEL SÓ TEXTO
- **Quando:** posts educativos, dicas, listas, explicações
- **Formato:** 1080x1350 (4:5), sempre
- **Estilo:** tipografia limpa, cores da marca alternadas, sem fotos

### 2. CARROSSEL COM FOTO
- **Quando:** apresentação visual, conteúdo aspiracional, capa com personagem
- **Formato:** 1080x1350 (4:5)
- **Estilo:** foto na capa com overlay em gradiente + slides internos no padrão alternado
- **Foto:** real (enviada pelo usuário) ou gerada por IA

### 3. POST ÚNICO
- **Quando:** frase de impacto, dado ou estatística, depoimento, bastidores
- **Formato:** 1080x1350
- **Estilo:** conforme o conteúdo (citação, número grande, foto com overlay)

Se o tipo não estiver claro:
> "Que tipo de conteúdo? (1) carrossel só texto, (2) carrossel com foto, (3) post único"

---

## Estilo visual base

O Workfoli tem um estilo próprio: editorial, calmo, premium. Sem clip-art, sem emoji decorativo, sem gradiente arco-íris, sem cara de template genérico de IA. O `identidade/design-guide.md` sempre tem prioridade; quando estiver vago ou em branco, usar o que está aqui. Não parar pra pedir `/instalar`: o `/carrossel` funciona bem com os padrões.

### Tipografia padrão

- **Fonte:** Inter (Google Fonts), pesos 400/500/600/700/800/900
- **Título de capa:** 90-100px, weight 900, line-height 0.98, letter-spacing **-0.04em**
- **H2 (slides internos):** 60-72px, weight 800, line-height 1.04, letter-spacing **-0.035em**
- **Corpo:** 20-24px, weight 500, line-height 1.5
- **Eyebrow/kicker:** 13-16px, weight 700-800, **MAIÚSCULAS**, letter-spacing **0.22-0.32em**, cor de destaque
- **Contador de página (canto superior direito):** 14-16px, weight 500-600, letter-spacing 0.18em, cor apagada
- **@ / meta:** 15-18px, weight 600

Regra do tipo: títulos grandes com espaçamento **apertado** (-0.035em), eyebrows pequenos com espaçamento **aberto** (0.22em+). Esse contraste é o coração do estilo.

### Cores padrão (quando o design-guide for vago)

Paleta sóbria: fundo escuro + off-white + **UMA** cor de destaque. Nunca quatro cores brigando.

- Fundo escuro: `#0E1116` ou `#1A1A1A`
- Fundo claro alternativo: `#F5ECD7` (creme) ou `#FAFAF7`
- Texto sobre escuro: `#FAFAF7`
- Texto sobre claro: `#1A1A1A` (títulos) e `#444` (corpo)
- Destaque: a cor da marca (uma só)

### Elementos visuais recorrentes

- **Régua fina** (3-4px de altura, 60-80px de largura, cor de destaque) entre kicker e título, ou como divisor
- **Logo no canto superior esquerdo + contador no superior direito** em todos os slides
- **Linha de 1px** `rgba(255,255,255,0.12)` separando rodapé do conteúdo (nos slides escuros)
- **Selos circulares** (200x200, borda 3px translúcida, rotação -10deg) pra datas, dados, destaques
- **Tags/pílulas** em maiúsculas, padding generoso, espaçamento 0.2em, pra rotular o slide
- Margem lateral base: 70-100px

### Layouts nomeados

Cada slide tem um layout. Variar entre eles cria ritmo:

- **CAPA**: eyebrow + título grande + subtítulo + @. Fundo: foto com overlay em gradiente (`rgba(12,10,9,0.55)` → `rgba(12,10,9,0.85)`) OU cor sólida (escuro, claro ou destaque)
- **SOLO**: divisão horizontal, foto à esquerda 50% + texto à direita 50% (kicker + h2 + régua + parágrafo)
- **DUO**: texto em cima (kicker + h2 + régua + parágrafo) + 2 fotos lado a lado embaixo (ou 1 foto larga)
- **NÚMERO**: numeral gigante (200-320px, weight 800, cor de destaque) como elemento gráfico + h2 + parágrafo de apoio
- **CITAÇÃO**: aspas grandes em marca d'água + frase em h2 + atribuição
- **CTA FINAL**: fundo na cor de destaque, logo centralizado, chamada curta, botão/CTA, contato ou @

**Ritmo:** alternar fundo escuro ↔ claro ↔ destaque. Nunca dois slides seguidos com o mesmo fundo.

---

## Padrão do carrossel

**Estrutura (5 a 10 slides):**
- **Slide 1:** `CAPA`
- **Slides internos:** 2-3 layouts diferentes entre `SOLO`, `DUO`, `NÚMERO` e `CITAÇÃO`
- **Slide final:** `CTA FINAL`

### Sequência de capas no feed

Antes de definir a capa, olhar a **última capa publicada** (pasta mais recente em `marketing/conteudo/`) pra alternar:
- claro → a próxima é foto/escuro
- foto/escuro → a próxima é cor da marca
- cor da marca → a próxima é clara
- nunca duas capas iguais em sequência

Se não der pra saber qual foi a última, perguntar.

### Linguagem (regra crítica)

Seguir `_memoria/preferencias.md`. Em geral: frases naturais, sem jargão de marketing, sem corporativês. O público real raramente fala "ticket médio", "performance", "B2B". Falar como ele fala.

### Legenda: sempre gerar junto

Ao terminar os PNGs, gerar **automaticamente** a legenda e salvar em `legenda.md` na mesma pasta. **Não esperar o usuário pedir.** Estrutura:

1. Gancho na primeira linha, em até ~125 caracteres (é o que aparece antes do "mais")
2. Contexto (1-2 frases sobre o conteúdo)
3. CTA pra arrastar ("Arrasta pro lado")
4. Bloco de oferta (diferenciais e contato, de `_memoria/empresa.md`)
5. Até 5 hashtags específicas (o Instagram considera no máximo 5 por post): nicho + público + local, se fizer sentido

---

## Workflow

### Passo 1 — Entender e planejar

1. Usar `_memoria/preferencias.md` e `_memoria/empresa.md`
2. Ler `identidade/design-guide.md` (cores, fontes, logo)
3. Identificar o tipo (1, 2 ou 3)
4. Definir tema e ângulo

### Passo 2 — Texto

**Carrossel (5-10 slides):**
- Slide 1 (capa): título forte, no máximo 8 palavras. Oferecer 3 opções
- Slides internos: uma ideia por slide, frases naturais, sem bullet points
- Slide final: CTA + logo

**Post único:**
- Frase principal em destaque
- Contexto de apoio (se precisar)
- CTA sutil

**CHECKPOINT:** mostrar o texto completo e esperar aprovação antes do visual.

### Passo 3 — Foto com IA (só no tipo 2, se pedido)

1. Montar o prompt em inglês (os modelos de imagem respondem melhor):

```
Professional [TIPO] photography of [ASSUNTO],
[DETALHES], [AMBIENTE/CONTEXTO],
[ESTILO DE LUZ] lighting, shallow depth of field,
shot from [ÂNGULO], [ESTILO/ESTÉTICA],
editorial quality
```

2. Gerar:
   - Se existir `scripts/gerar-imagem.js`:
     ```bash
     node --env-file=.env scripts/gerar-imagem.js "PROMPT" "marketing/conteudo/<pasta>/foto-<nome>.png"
     ```
   - Se houver conector de geração de imagem ativo na sessão, pode usar ele
   - Se não houver nenhum dos dois: oferecer criar o `scripts/gerar-imagem.js` (ver `templates/ferramentas/catalogo.md`, seção "Gerar imagens com IA") com a chave que o usuário tiver, ou pedir uma foto real

3. Abrir a imagem gerada, conferir e passar o caminho pro usuário.

**CHECKPOINT:** foto aprovada → seguir. Se não, ajustar o prompt e gerar de novo.

### Passo 4 — Visual (HTML + PNG)

1. Criar **um único `carrossel.html`** com TODOS os slides como `<div class="slide">`. CSS inline, Google Fonts como única dependência externa. Cada `.slide` mede exatamente 1080x1350 (`width: 1080px; height: 1350px; overflow: hidden`). Aplicar:
   - Cores e tipografia do `identidade/design-guide.md`
   - Pelo menos 2 layouts diferentes
   - Logo + contador de página em todos os slides
   - Slide final com logo e CTA, fundo na cor principal

   **Foto no HTML** (caminho relativo, arquivo na mesma pasta):
   ```html
   <div class="slide" style="
     background-image: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.7)), url('foto-xxx.png');
     background-size: cover;
     background-position: center;
   ">
     <div class="content">
       <h2>Texto sobre a foto</h2>
     </div>
   </div>
   ```

2. Renderizar:
   ```bash
   node scripts/render.js marketing/conteudo/<pasta>/carrossel.html
   ```
   Gera `instagram/slide-01.png` … na pasta do conteúdo. Se aparecer aviso de tamanho, corrigir o CSS do slide e renderizar de novo. Se o Playwright não estiver instalado, rodar `npm install` na raiz (uma vez).

3. **Autoconferência:** abrir os PNGs e checar texto cortado, contraste fraco, elementos sobrepostos e logo ausente. Corrigir antes de mostrar.

4. Passar pro usuário os caminhos do slide 1, do 2 e do CTA final pra aprovação. Aprovados, liberar os demais.

**TikTok/Reels (9:16), só quando pedido:** criar `carrossel-9x16.html` com slides de 1080x1920 e renderizar com `--size 1080x1920 --out tiktok`.

### Passo 5 — Salvar e organizar

```
marketing/conteudo/<tipo>-<tema>-<YYYY-MM-DD>/
  texto.md              ← texto aprovado dos slides
  foto-<nome>.png       ← fotos (se houver)
  carrossel.html
  instagram/
    slide-01.png → slide-NN.png
  tiktok/               ← só se pedido (9:16)
  legenda.md            ← Instagram + Facebook
  legenda-linkedin.md   ← só se pedido (tom mais formal, até 3 hashtags)
```

### Passo 6 — Conexão com o blog (opcional)

> "Esse conteúdo pode virar artigo no blog também. Quer que eu crie a versão pro blog (SEO)?"

Se sim, chamar `/publicar-tema` com o mesmo tema.

---

## Regras

- Sempre ler `identidade/design-guide.md` antes de criar qualquer visual
- Carrossel: 1080x1350 (4:5), sempre. TikTok/Reels: 1080x1920 (9:16), só quando pedido
- Linguagem segue `_memoria/preferencias.md` à risca
- Sempre considerar a sequência de capas no feed
- Sempre gerar a legenda no final, em `legenda.md`, com no máximo 5 hashtags
- Foto com IA: prompt em inglês, aprovação antes de usar, nunca rostos ou pessoas identificáveis
- Um único `carrossel.html` com todos os slides, CSS inline, render pelo `scripts/render.js`
- Nunca mostrar slide sem ter conferido o PNG renderizado
- Variar os layouts: nunca o mesmo layout em todos os slides
