# Catálogo de ferramentas

Referência de APIs, programas e conectores que as skills podem usar.
Consulte antes de criar uma skill nova, pra saber o que já está disponível.

---

## Transformar HTML em imagem ou PDF

### render.js (já incluído)
**O que faz:** transforma HTML em PNG/JPG (cada `.slide` vira uma imagem) ou em PDF A4
**Precisa de conta:** não, roda local
**Preparação (uma vez):**
```bash
npm install
npx playwright install chromium   # opcional se já houver Chrome ou Edge na máquina
```
**Como usar numa skill:**
```bash
node scripts/render.js <arquivo.html>                     # PNG 1080x1350 em instagram/
node scripts/render.js <arquivo.html> --jpg               # + JPG (exigido pela API do Instagram)
node scripts/render.js <arquivo.html> --size 1920x1080 --out slides
node scripts/render.js <arquivo.html> --pdf               # PDF A4
```
**Tamanhos comuns:**
- Feed do Instagram: 1080x1350
- Stories / Reels / TikTok: 1080x1920
- Slide 16:9: 1920x1080
- Quadrado: 1080x1080

---

## Publicar na web

### Cloudflare Pages
**O que faz:** publica HTML com link público (propostas, landing pages, estudos)
**Precisa de conta:** sim, Cloudflare (plano gratuito)
**Configurar:** `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no `.env`
**Como usar numa skill:**
```bash
npx wrangler pages deploy <pasta> --project-name <nome>
```
**Quando usar:** quando a skill gera um HTML que precisa ser compartilhado por link

---

## Publicar em redes sociais

### Meta Graph API (Instagram + Facebook)
**O que faz:** publica carrossel no Instagram e post com fotos na Página do Facebook
**Precisa de conta:** sim, app no Meta for Developers + Página + conta profissional do Instagram
**Configurar:** `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID` e `SITE_URL` no `.env`
**Atenção:** o Instagram só aceita JPEG, e busca a imagem por URL pública
**Quando usar:** `/aprovar-post` (o passo a passo dos scripts está na skill)

### Post for Me
**O que faz:** API de terceiros que publica no Instagram e no TikTok
**Precisa de conta:** sim, postforme.dev
**Configurar:** `POSTFORME_API_KEY` no `.env`
**Quando usar:** alternativa à Meta Graph API, ou pra publicar no TikTok

---

## Buscar conteúdo na web

### Busca e leitura de páginas (nativo)
**O que faz:** pesquisa na web e lê o conteúdo de qualquer URL
**Precisa de conta:** não, já vem no Claude Code
**Quando usar:** pesquisa de referências, concorrência, dados para SEO

### Apify (dados públicos do Instagram)
**O que faz:** coleta os posts que estão rodando numa hashtag e as estatísticas públicas de perfis do Instagram, sem login
**Precisa de conta:** sim, Apify (plano gratuito com créditos mensais; cada coleta gasta créditos, ver o preço do ator no site)
**Configurar:** `APIFY_TOKEN` no `.env` (console.apify.com → Settings → API & Integrations)
**Como usar numa skill:** `node --env-file=.env scripts/apify-instagram.js hashtag <tag> --max 20` ou `perfil <usuario>`. O script nasce no primeiro uso; o contrato está no `/nicho-instagram`
**Quando usar:** `/nicho-instagram`, sempre com confirmação antes de gastar créditos. Sem conta, a skill funciona com dados colados

### Jina Reader
**O que faz:** converte uma URL em markdown limpo (bom pra artigos longos)
**Precisa de conta:** não (com limite de uso)
**Como usar:** ler `https://r.jina.ai/<URL>`
**Quando usar:** extrair texto de artigos e páginas com muito HTML

---

## Extrair conteúdo de vídeo

### yt-dlp
**O que faz:** baixa legendas e transcrições de vídeos do YouTube
**Precisa de conta:** não, roda local
**Como instalar:**
```bash
winget install yt-dlp.yt-dlp   # Windows
brew install yt-dlp            # Mac
pip install yt-dlp             # qualquer sistema com Python
```
**Quando usar:** skills que partem de um vídeo (carrossel, newsletter, roteiro)

---

## Gerar imagens com IA

### OpenAI (API de imagens)
**O que faz:** gera imagem a partir de texto
**Precisa de conta:** sim, OpenAI (pago por uso)
**Configurar:** `OPENAI_API_KEY` no `.env`
**Como funciona:** `POST https://api.openai.com/v1/images/generations` com o modelo de imagem atual (ver a documentação oficial), tamanho retrato e retorno em base64

### Gemini (Google AI Studio)
**O que faz:** gera imagem a partir de texto
**Precisa de conta:** sim, Google AI Studio (tem cota gratuita)
**Configurar:** `GEMINI_API_KEY` no `.env`
**Como funciona:** `generateContent` com um modelo de imagem do Gemini (ver a documentação oficial), resposta com a imagem em base64

**Contrato do `scripts/gerar-imagem.js`** (quando for criado pelo `/carrossel`):
```bash
node --env-file=.env scripts/gerar-imagem.js "PROMPT EM INGLÊS" "caminho/foto.png"
```
Usa a chave que existir no `.env` (OpenAI ou Gemini), salva a imagem no caminho indicado e sai com erro claro se faltar chave.

---

## Conectar com plataformas (conectores MCP)

Conectores dão ao Claude acesso direto a outras plataformas. Com um conector ativo, o Claude passa a usá-lo quando fizer sentido.

**Jeito mais fácil:** se o Claude Code estiver logado com a sua conta do claude.ai, os conectores que você ativar lá (Configurações → Conectores) também ficam disponíveis aqui. Gmail, Google Calendar, Google Drive, Notion e Canva estão entre eles.

**Pelo terminal:**
- Ver os instalados: `claude mcp list`
- Remover: `claude mcp remove <nome>`

### Notion
**O que faz:** lê e escreve páginas, bases de dados, briefings e tarefas
**Como conectar:** conector do claude.ai, ou:
```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
```
**Quando usar:** skills que leem ou escrevem tarefas, bases de clientes, documentos

### Gmail
**O que faz:** lê e-mails e cria rascunhos sem sair do Claude
**Como conectar:** conector do claude.ai
**Quando usar:** `/email-profissional`, follow-ups, comunicação com clientes

### Google Calendar
**O que faz:** vê a agenda, cria eventos, encontra horários livres
**Como conectar:** conector do claude.ai
**Quando usar:** agendamento, planejamento, organização de reuniões

### Canva
**O que faz:** acessa e cria designs direto pelo Claude
**Como conectar:** conector do claude.ai, ou:
```bash
claude mcp add --transport http canva https://mcp.canva.com/mcp
```
**Quando usar:** criação visual, materiais de marca

### Meta Ads (Facebook/Instagram)
**O que faz:** gerencia campanhas e busca dados de desempenho
**Precisa de conta:** sim, token do Meta Business
**Quando usar:** gestão de mídia paga, relatórios (hoje o `/relatorio-ads` trabalha com CSV exportado)

### Google Ads
**O que faz:** acessa campanhas e busca dados de desempenho
**Precisa de conta:** sim, credenciais da API do Google Ads
**Quando usar:** gestão de mídia paga, relatórios

### n8n
**O que faz:** dispara automações e fluxos do n8n
**Precisa de conta:** sim, instância n8n + chave de API
**Como conectar:**
```bash
claude mcp add n8n -- npx -y n8n-mcp
```
**Quando usar:** skills que precisam disparar automações externas

### Supabase
**O que faz:** banco de dados e backend completo
**Precisa de conta:** sim, projeto no Supabase
**Quando usar:** skills que precisam guardar dados, autenticação, backend

### Telegram
**O que faz:** envia e recebe mensagens por um bot
**Precisa de conta:** sim, token do bot (criado no @BotFather)
**Quando usar:** notificações e comunicação automática

---

## Como adicionar uma ferramenta nova

Se você usa uma API ou ferramenta que não está aqui, adicione seguindo o formato:

```markdown
### Nome da ferramenta
**O que faz:** [uma frase]
**Precisa de conta:** [sim/não]
**Configurar:** [o que vai no .env, se houver]
**Como usar numa skill:** [comando ou instrução]
**Quando usar:** [em que tipo de skill faz sentido]
```
