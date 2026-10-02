---
name: seo
description: >
  Fluxo completo de SEO, GEO e Google Ads em 8 passos: pesquisa de demanda, análise de
  concorrência, Perfil da Empresa no Google (antigo Google Meu Negócio), otimização do site,
  estratégia de conteúdo, Google Ads, checklist de monitoramento e GEO (aparecer em IAs como
  ChatGPT, Gemini, Claude e Perplexity). Use quando o usuário pedir "seo", "geo",
  "palavras-chave", "google ads", "aparecer no google", "aparecer no chatgpt", "aparecer nas ias",
  "google meu negócio", "gmb", "perfil da empresa", "analisar concorrência", "pesquisa de nicho"
  ou "google trends".
---

# /seo — SEO completo + GEO + Google Ads

## Dependências

- **Contexto do negócio:** `_memoria/empresa.md` (produtos, região, site, diferenciais)
- **Tom de voz:** `_memoria/preferencias.md`
- **Estratégia atual:** `_memoria/estrategia.md`
- **Ferramentas:** busca e leitura de páginas na web (nativas do Claude Code)
- **Dados reais (se houver):** exports do Planejador de Palavras-chave, Search Console ou Google Trends em `dados/`
- **Saída:** `marketing/seo/`

---

## Passo 0 — Briefing rápido

Conferir em `_memoria/empresa.md` e perguntar só o que faltar, numa mensagem só:

1. Site (URL), se tiver
2. Onde atende: cidade/região, ou online pro Brasil todo
3. Os 3 produtos ou serviços que mais importam vender
4. Concorrentes que já conhece (se souber)
5. Tem Perfil da Empresa no Google (ficha no Maps)?
6. Tem acesso ao Google Search Console ou ao Planejador de Palavras-chave do Google Ads? Se tiver, exportar e soltar em `dados/`: dado real vale mais que estimativa

**Negócio local** (atende numa região) → seguir todos os passos. **Negócio só online** → pular o Passo 3 e não usar termos geográficos.

---

## Passo 1 — DEMANDA: o que as pessoas buscam?

**Objetivo:** confirmar se existe demanda real e como as pessoas procuram.

1. A partir de `_memoria/empresa.md`, extrair produtos/serviços, região, público e diferenciais
2. Gerar **30-50 termos-semente** a partir de:
   - Categorias de produto/serviço
   - Intenção de busca (informacional, comercial, transacional)
   - Localização (cidade, bairro, região), se for negócio local
   - Uso final / contexto do cliente
3. Validar e expandir com busca na web:
   - O que aparece pra cada grupo de termos (orgânico, anúncios, mapa)
   - Como as pessoas perguntam de verdade: fóruns, Reclame Aqui, Reddit, comentários, "as pessoas também perguntam"
   - Sazonalidade por sinais indiretos (datas comemorativas, calendário do setor, notícias). O Google Trends não é legível por leitura de página; se o usuário exportar o CSV do Trends pra `dados/`, usar esse dado
4. Se houver export do Planejador ou do Search Console em `dados/`, usar os volumes reais
5. Classificar cada termo:
   - **Volume:** real (com fonte) ou estimado (alto / médio / baixo / micro, com a lógica explicada)
   - **Intenção:** informacional, comercial, transacional, navegacional
   - **Dificuldade:** quantos concorrentes fortes aparecem
   - **Relevância:** direto (produto exato), indireto (nicho relacionado) ou tangencial

**Saída:** `marketing/seo/01-pesquisa-demanda.md` com:
- Tabela de termos classificados (marcando o que é dado real e o que é estimativa)
- Top 10 termos prioritários (volume + intenção transacional + concorrência baixa)
- Termos sazonais
- Termos descartados e por quê

---

## Passo 2 — CONCORRÊNCIA: quem aparece nessas buscas?

**Objetivo:** mapear quem domina os resultados e onde estão as brechas.

1. Pegar os **top 10 termos** do Passo 1
2. Pra cada termo, buscar e analisar:
   - **Top 5 orgânicos:** quem são, que tipo de página (institucional, marketplace, blog, diretório)
   - **Mapa (pacote local):** quem aparece, quantas avaliações, nota
   - **Anúncios:** alguém anuncia? Com que texto?
3. Pra cada concorrente relevante (5 a 8), abrir o site e analisar:
   - Estrutura (páginas, blog, catálogo)
   - Títulos e meta descriptions das páginas principais
   - Conteúdo: sobre o que falam, com que profundidade
   - Dados estruturados (schema): usam?
   - Perfil no Google: completo? Fotos, posts, avaliações?
4. Identificar:
   - **Brechas:** o que nenhum concorrente faz bem
   - **Oportunidades:** termos que ninguém domina
   - **Ameaças:** concorrentes fortes demais pra enfrentar de frente
   - **Padrão mínimo:** o que o negócio precisa ter pra competir

**Saída:** `marketing/seo/02-analise-concorrencia.md` com tabela de concorrentes, mapa de brechas e oportunidades e onde atacar primeiro.

---

## Passo 3 — PERFIL DA EMPRESA NO GOOGLE (resultado mais rápido)

*Só pra negócio local.* O antigo Google Meu Negócio é o que coloca a empresa no Maps e no pacote local.

1. Buscar o nome da empresa no Google pra ver como o perfil está hoje (se existir)
2. Montar o documento com **tudo que precisa ser preenchido ou melhorado:**

   **Informações básicas:**
   - Nome (idêntico ao registrado, sem enfiar palavra-chave)
   - Categoria principal + secundárias (sugerir as melhores pro nicho)
   - Endereço ou área de atendimento, telefone, site
   - Horário de funcionamento

   **Descrição do negócio:**
   - Até 750 caracteres, com palavras-chave naturais
   - Tom conforme `_memoria/preferencias.md`

   **Produtos, serviços e atributos:**
   - Serviços relevantes
   - Atributos (entrega, atacado, produção própria etc.)

   **Fotos:**
   - Checklist (fachada, interior, produtos, equipe, produção)
   - Quantidade e frequência recomendadas

   **Posts no perfil:**
   - 4 posts iniciais sugeridos
   - Calendário de posts recorrentes

   **Avaliações:**
   - Como pedir avaliação aos clientes atuais (momento e mensagem)
   - Respostas: usar o `/responder-avaliacoes`

   **Citações e diretórios:**
   - Diretórios relevantes pro nicho
   - NAP consistente (nome, endereço, telefone iguais em todo lugar)

**Saída:** `marketing/seo/03-google-meu-negocio.md`

---

## Passo 4 — ON-PAGE: otimizar o site

**Objetivo:** cada página otimizada pra palavra-chave certa.

1. Ler a estrutura do site (`site/` se existir; senão, abrir o site pela URL ou perguntar as páginas)
2. Pra cada página:

   **Palavra-chave principal da página**

   **Meta tags:**
   - Title (50-60 caracteres, keyword no início)
   - Meta description (150-160 caracteres, com CTA)
   - H1, H2 e H3 sugeridos

   **Dados estruturados (JSON-LD):**
   - `LocalBusiness` (ou `Organization`, se for só online)
   - `Product` pros produtos
   - `FAQPage` se houver perguntas frequentes. Desde 2023 o Google só mostra FAQ em destaque pra sites de governo e saúde, mas o schema continua ajudando as IAs a entender o conteúdo (ver Passo 8)

   **Checklist técnico:**
   - URLs amigáveis
   - Texto alternativo nas imagens
   - Velocidade: consultar a API do PageSpeed Insights (`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=<URL>&strategy=mobile`) e registrar a nota e os principais problemas
   - Versão mobile
   - sitemap.xml, robots.txt, canonical, Open Graph

   **Links internos:** mapa de links sugerido

**Saída:** `marketing/seo/04-otimizacao-on-page.md` com:
- Tabela: página → keyword → title → description → H1
- Schemas JSON-LD prontos pra copiar
- Checklist técnico com status (feito / pendente)

---

## Passo 5 — CONTEÚDO: estratégia de autoridade

**Objetivo:** um plano de conteúdo que posicione a empresa como referência no nicho.

1. A partir dos termos do Passo 1 (principalmente os informacionais):

   **Conteúdos perenes:**
   - 5 a 10 ideias que respondem dúvidas reais do público
   - Pra cada uma: título, keyword-alvo, estrutura de títulos, tamanho estimado

   **Cluster de conteúdo:**
   - Página pilar
   - Páginas satélite que apontam pra pilar
   - Estrutura de links internos

   **Calendário editorial:**
   - Ordem de publicação
   - Frequência sugerida
   - Formato (artigo, guia, FAQ, comparativo)

   **Conteúdo local** (se for negócio local):
   - Páginas por área de atendimento, quando fizer sentido
   - Referências locais

**Saída:** `marketing/seo/05-estrategia-conteudo.md`

> Esta lista alimenta o `/publicar-tema`: cada item vira artigo + carrossel + legendas com um comando.

---

## Passo 6 — GOOGLE ADS: campanhas prontas pra rodar

**Objetivo:** estruturar campanhas com base nos dados reais da pesquisa.

1. **Objetivo das campanhas:**
   - Contatos (ligação, WhatsApp, formulário)
   - Visitas ao site
   - Alcance local

2. **Estrutura:**

   **Rede de Pesquisa:**
   - Um grupo de anúncios por cluster de keywords
   - Por grupo: 10-15 keywords, negativas, 3 anúncios responsivos (RSA), recursos (sitelinks, chamada, snippets)
   - Orçamento diário, estratégia de lance, segmentação geográfica

   **Local (se aplicável):** anúncios no Maps, segmentação por proximidade

   **Display/Remarketing (opcional):** públicos e formatos

3. **Textos dos anúncios:**
   - Tom de `_memoria/preferencias.md`
   - Diferenciais concretos
   - CTAs específicos
   - 15 títulos e 4 descrições

4. **Página de destino:** o site atual serve ou precisa de página específica?

**Saída:** `marketing/seo/06-google-ads.md` com estrutura completa, keywords organizadas, textos prontos, orçamento e configurações.

> O `/anuncio-google` usa este arquivo pra gerar os CSVs prontos pra importar.

---

## Passo 7 — MONITORAMENTO: rotina de acompanhamento

**Objetivo:** garantir que o trabalho continue dando resultado.

**Semanal:**
- Posição nos top 10 termos
- Responder avaliações no Google
- Postar no Perfil da Empresa (1x por semana, no mínimo)

**Mensal:**
- Métricas do Google Ads (CTR, CPC, conversões, custo por contato), com o `/relatorio-ads`
- Tráfego orgânico no Search Console
- Atualizar palavras-chave negativas
- Publicar 1-2 conteúdos do calendário
- Conferir citações e diretórios

**Trimestral:**
- Refazer a análise de concorrência (Passo 2 resumido)
- Atualizar fotos e posts do Perfil da Empresa
- Revisar a estratégia de conteúdo
- Buscar novas oportunidades de palavras-chave

**Saída:** `marketing/seo/07-checklist-monitoramento.md`

---

## Passo 8 — GEO: aparecer nas respostas das IAs

**Objetivo:** fazer as IAs generativas (ChatGPT, Gemini, Claude, Perplexity, Copilot) citarem a empresa quando alguém perguntar sobre o nicho.

**Por que importa:** cada vez mais clientes perguntam pra IA "qual o melhor fornecedor de X em Y?". Quem aparece ganha contato qualificado sem pagar anúncio.

1. **Auditoria GEO:**
   - Buscar os top 10 termos em formato de pergunta
   - Ver se a empresa (ou os concorrentes) aparece nas respostas e nas fontes citadas
   - Mapear quais sites as IAs citam nesse nicho

2. **Conteúdo pensado pra IA:**
   - Cada artigo do Passo 5 com **resposta direta** nas primeiras linhas
   - **Dados concretos** (números, certificações, endereço, fatos verificáveis)
   - **Perguntas como H2/H3** (formato pergunta e resposta)
   - Nada de texto vago: as IAs descartam o genérico

3. **FAQ + schema no site:**
   - Seção de perguntas frequentes com perguntas reais do nicho
   - `FAQPage` em JSON-LD
   - 5 a 10 perguntas sugeridas a partir do que o público pergunta

4. **Acesso dos robôs das IAs:**
   - Conferir se o `robots.txt` não bloqueia os robôs de busca das IAs (ex: `OAI-SearchBot`, `GPTBot`, `ClaudeBot`, `PerplexityBot`). Bloquear = não ser citado
   - Opcional: publicar um `/llms.txt` com resumo do negócio e links principais (padrão ainda em adoção)

5. **Menções externas:**
   - As IAs dão peso a menções em fontes confiáveis
   - Ações: diretórios, sites de avaliação, artigos convidados, menções em blogs do nicho, imprensa

6. **Dados estruturados reforçados:** `LocalBusiness`, `FAQPage`, `Product`, `Article`

7. **Monitoramento GEO:**
   - A cada 30 dias, testar os top 5 termos no ChatGPT, Gemini, Claude e Perplexity
   - Registrar: a empresa apareceu? Quem apareceu? Qual fonte foi citada?
   - Ajustar o conteúdo com base nisso

**Saída:** `marketing/seo/08-geo-otimizacao-ia.md` com auditoria, FAQ + schema JSON-LD, lista de ações pra ganhar menções e checklist de monitoramento.

---

## Execução

Ao rodar `/seo`, fazer o Passo 0 e depois **os 8 passos em sequência**, salvando cada saída no arquivo correspondente. Entre um passo e outro, mostrar um resumo curto do que foi encontrado.

Pra rodar um passo só: `/seo passo 3`, `/seo gmb`, `/seo geo` etc.

No final, um **resumo executivo** com:
- Top 5 oportunidades
- Ações prioritárias (o que fazer primeiro)
- Faixa de investimento em anúncios, com a fonte da estimativa
- Próximos passos recomendados

---

## Regras

- Pesquisa sempre real (busca e leitura na web). Nunca inventar volume, posição ou concorrente
- Dado que não dá pra obter (ex: volume exato) fica marcado como estimativa, com a lógica explicada
- Textos seguem `_memoria/preferencias.md` à risca
- Termos em português do Brasil, do jeito que o público busca
- Priorizar termos com intenção comercial/transacional
- Negócio local: termos com localização e Perfil da Empresa. Negócio online: sem geografia e sem Passo 3
- Schema sempre em JSON-LD
- Nunca inventar CPC ou custo sem base real
