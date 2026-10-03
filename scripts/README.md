# scripts/ — utilitários do Workfoli

Scripts que as skills chamam quando precisam fazer algo fora do alcance
da conversa: transformar HTML em imagem, gerar foto com IA, publicar em
rede social.

## O que já vem pronto

| Script | Quem usa | O que faz |
|---|---|---|
| `render.js` | `/carrossel`, `/publicar-tema`, `/aprovar-post`, `/proposta` | Transforma HTML em PNG/JPG (cada `.slide` vira uma imagem) ou em PDF |

```bash
node scripts/render.js <arquivo.html>                   # slides → instagram/slide-01.png …
node scripts/render.js <arquivo.html> --jpg             # também gera .jpg (a API do Instagram só aceita JPEG)
node scripts/render.js <arquivo.html> --size 1080x1920 --out tiktok
node scripts/render.js <arquivo.html> --pdf             # página inteira em PDF A4 (propostas)
```

## Criados sob demanda

Estes scripts nascem quando você ativa a integração pela primeira vez. A
skill detecta que falta o script e cria junto com você:

| Script | Quem usa | O que faz |
|---|---|---|
| `gerar-imagem.js` | `/carrossel` (com foto IA) | Gera foto via API de imagem da OpenAI ou do Gemini |
| `postar-instagram.js` | `/aprovar-post` | Publica o carrossel no Instagram (Meta Graph API) |
| `postar-facebook.js` | `/aprovar-post` | Publica o post com fotos na Página do Facebook (Meta Graph API) |
| `apify-instagram.js` | `/nicho-instagram` | Coleta posts de uma hashtag e estatísticas de perfis do Instagram pela Apify (salva em `dados/instagram/`) |

`/anuncio-google` e `/relatorio-ads` não precisam de script: geram e leem
CSV direto.

## Preparação (uma vez só)

**Node.js 22 ou mais novo (versão LTS)** instalado na máquina.

**Dependências**, na raiz do projeto:

```bash
npm install
npx playwright install chromium   # opcional se você já tem Chrome ou Edge
```

**Chaves de API** num arquivo `.env` na raiz. Copie o `.env.example` e
preencha só o que for usar. O `.env` nunca vai pro GitHub.

## Como o Workfoli lida com isso

Quando você roda uma skill que precisa de algo que ainda não existe, o Claude:

1. Detecta o que está faltando (script, chave ou dependência)
2. Pergunta se você quer configurar agora
3. Guia você na criação das chaves (Meta, OpenAI etc.)
4. Cria o script já configurado
5. Roda a skill

Você não precisa decorar nada. É rodar a skill e seguir o fluxo.
