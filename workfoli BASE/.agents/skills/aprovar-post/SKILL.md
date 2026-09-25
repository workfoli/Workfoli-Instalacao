---
name: aprovar-post
description: >
  Aprova e publica um post da fila: muda o blog de rascunho pra publicado, gera os JPEGs do
  carrossel, copia pra pasta pública do site, faz commit e push (o Netlify/Vercel publica),
  espera o deploy e posta o carrossel no Instagram + Facebook via Meta Graph API. Use quando o
  usuário disser "aprovar post X", "publicar o post do tema Y", "/aprovar-post X" ou quiser
  disparar a publicação de um conteúdo já criado pelo /publicar-tema.
---

# /aprovar-post — Aprovação e publicação automática

Ponte entre o conteúdo aprovado (blog + carrossel + legendas, criados pelo `/publicar-tema`) e a publicação real (site + Instagram + Facebook).

## Quando NÃO usar

- O conteúdo ainda não existe → `/publicar-tema` primeiro
- O usuário ainda está revisando → só rodar depois de "aprovado" / "pode postar"
- Site sem deploy automático ou Meta API não configurada → fazer o setup abaixo antes

## Pré-requisitos (uma vez só)

- `.env` na raiz (modelo em `.env.example`) com:
  - `META_PAGE_ACCESS_TOKEN`: token de longa duração da Página do Facebook
  - `META_PAGE_ID`: ID da Página
  - `META_IG_USER_ID`: ID da conta profissional do Instagram
  - `SITE_URL`: ex: `https://exemplo.com.br`
- Site com deploy automático a partir da branch `main` do GitHub (Netlify, Vercel etc.)
- Conta profissional do Instagram conectada à Página do Facebook, com as permissões de publicação no app da Meta
- `scripts/postar-instagram.js` e `scripts/postar-facebook.js` (se não existirem, criar seguindo "Como os scripts funcionam", abaixo)
- Playwright instalado (`npm install` na raiz), pra gerar os JPEGs

Se algo faltar: parar e guiar o setup. Registrar o passo a passo em `marketing/automacao-meta-setup.md` (criar se não existir).

## Argumento

`/aprovar-post <slug>`, onde `<slug>` é o nome do arquivo do blog **sem `.md`**.

Exemplo: `/aprovar-post como-conservar-produto`

Sem slug: listar os artigos em rascunho (`draft: true`) e perguntar qual.

## Workflow

### Passo 1 — Localizar os arquivos

- Blog: `site/.../blog/<slug>.md` (o caminho depende do site)
- Carrossel: `marketing/conteudo/<slug>-*` (a pasta tem a data no final)
- PNGs em `<pasta>/instagram/slide-XX.png` (de 2 a 10: limite da API pra carrossel)
- `legenda.md` obrigatória. `legenda-linkedin.md` é opcional

Se faltar algo obrigatório, parar e relatar.

**Já publicado antes?** (blog sem `draft: true`, imagens já na pasta pública) → perguntar se é pra repostar nas redes ou só atualizar o site.

### Passo 2 — Resumo + confirmação final

Mostrar:
- Título do blog
- Quantidade de slides
- Primeiros 200 caracteres da legenda
- URL final que vai ao ar

Perguntar: **"Confirma a publicação? (sim/não)"**. Só seguir com "sim".

### Passo 3 — Tirar do rascunho

No frontmatter do blog: `draft: true` → `draft: false`.

### Passo 4 — Gerar JPEGs e copiar pro site

A API do Instagram **só aceita JPEG**, e busca as imagens por URL pública.

1. Se ainda não existirem `.jpg` na pasta `instagram/`:
   ```bash
   node scripts/render.js marketing/conteudo/<slug>-<data>/carrossel.html --jpg
   ```
2. Copiar `instagram/slide-*.jpg` → `site/.../public/img/posts/<slug>/`
   - Criar a pasta de destino se não existir
   - Sobrescrever se já existir (republicação)

### Passo 5 — Commit + push

```bash
git add site/<caminho>/blog/<slug>.md site/<caminho>/public/img/posts/<slug>/
git commit -m "publicar: <título do blog>"
git push origin main
```

Esperar o push terminar com sucesso.

### Passo 6 — Esperar o deploy

O deploy automático leva de 1 a 2 minutos. Conferir se está no ar (timeout de 5 minutos):

```bash
curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/blog/<slug>/"
curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/img/posts/<slug>/slide-01.jpg"
```

Os dois precisam responder 200. Sem a imagem pública, a Meta API falha.

### Passo 7 — Instagram

```bash
node --env-file=.env scripts/postar-instagram.js marketing/conteudo/<slug>-<data>
```

Guardar o link do post. Se falhar, **não seguir pro Facebook**: relatar e parar.

### Passo 8 — Facebook

```bash
node --env-file=.env scripts/postar-facebook.js marketing/conteudo/<slug>-<data>
```

Guardar o link do post.

### Passo 9 — LinkedIn

Por enquanto é manual (a API de página de empresa exige aprovação demorada). Se existir `legenda-linkedin.md`:

```
LinkedIn: cole este texto em https://www.linkedin.com/feed/ (Começar publicação):
<conteúdo de legenda-linkedin.md>
```

### Passo 10 — Resumo

```
✓ Post publicado: <título>

Site:        <SITE_URL>/blog/<slug>/
Instagram:   <link do post>
Facebook:    <link do post>
LinkedIn:    pendente (texto pronto em legenda-linkedin.md)
```

Perguntar se deve rodar `/salvar` pra registrar o estado.

## Como os scripts funcionam (pra criar se não existirem)

Ambos recebem a pasta do conteúdo, leem a `legenda.md` e montam as URLs públicas `SITE_URL/img/posts/<slug>/slide-XX.jpg`. Graph API em `https://graph.facebook.com/<versão>/`, usando a versão estável mais recente.

**`postar-instagram.js`** (carrossel):
1. Pra cada imagem: `POST /{META_IG_USER_ID}/media` com `image_url` e `is_carousel_item=true` → id do item
2. `POST /{META_IG_USER_ID}/media` com `media_type=CAROUSEL`, `children=<ids separados por vírgula>` e `caption` → id do contêiner
3. Consultar `GET /{id-do-contêiner}?fields=status_code` até `FINISHED`
4. `POST /{META_IG_USER_ID}/media_publish` com `creation_id=<id do contêiner>` → id do post
5. `GET /{id-do-post}?fields=permalink` → link pra mostrar ao usuário

**`postar-facebook.js`** (post com várias fotos):
1. Pra cada imagem: `POST /{META_PAGE_ID}/photos` com `url` e `published=false` → id da foto
2. `POST /{META_PAGE_ID}/feed` com `message` (legenda) e `attached_media` (lista de `{"media_fbid": "<id>"}`) → id do post

Os dois imprimem cada etapa e saem com erro claro (código e mensagem da API) se algo falhar.

## Tratamento de erro

- **Push falhou:** desfazer o `draft: false` (voltar pra `draft: true`), relatar e parar
- **Deploy não subiu em 5 minutos:** relatar e perguntar se continua ou aborta
- **Instagram falhou:** parar e relatar. O site já está no ar; só o post no feed não saiu
- **Facebook falhou, Instagram OK:** relatar e sugerir tentar de novo só o Facebook

## Princípios

1. **Confirmação humana antes de tudo que é irreversível.** Nunca pular o passo 2
2. **Idempotente onde der.** Rodar de novo com o mesmo slug detecta publicação anterior e pergunta
3. **Falha cedo, falha alto.** Pré-requisito faltando = parar e explicar o que falta
4. **Registrar tudo.** Cada passo diz o que está fazendo e o resultado
