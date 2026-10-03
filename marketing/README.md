# marketing/ — o que as skills de marketing produzem

Tudo que as skills de marketing geram cai aqui. Elas já sabem onde salvar,
então você raramente precisa criar pasta na mão.

## Estrutura padrão

```
marketing/
├── conteudo/                    saídas do /carrossel e do /publicar-tema
│   └── <tipo>-<tema>-<YYYY-MM-DD>/
│       ├── texto.md             texto aprovado dos slides
│       ├── carrossel.html
│       ├── instagram/slide-XX.png   (+ .jpg quando for publicar pela API)
│       ├── legenda.md
│       └── legenda-linkedin.md
│
├── seo/                         saídas do /seo (8 passos)
│   ├── 01-pesquisa-demanda.md
│   ├── 02-analise-concorrencia.md
│   ├── 03-google-meu-negocio.md
│   ├── 04-otimizacao-on-page.md
│   ├── 05-estrategia-conteudo.md
│   ├── 06-google-ads.md
│   ├── 07-checklist-monitoramento.md
│   └── 08-geo-otimizacao-ia.md
│
├── instagram/                   saídas do kit de Instagram
│   ├── calendario-<YYYY-MM-DD>.md   /calendario-editorial (data da segunda-feira)
│   ├── perfil-<YYYY-MM-DD>.md       /perfil-instagram
│   ├── stories-<YYYY-MM-DD>.md      /stories (telas desenhadas vão em conteudo/stories-<tema>-<data>/)
│   ├── nicho-<alvo>-<YYYY-MM-DD>.md /nicho-instagram (dados brutos ficam em dados/instagram/)
│   └── banco-de-ganchos.md          /extrair-gancho (estruturas, nunca o texto de terceiros)
│
├── campanhas/                   saídas do /anuncio-google e do /relatorio-ads
│   ├── google-ads-<YYYY-MM-DD>/ CSVs prontos pra importar
│   └── relatorios/              relatórios semanais
│
└── avaliacoes-google/           histórico do /responder-avaliacoes (opcional)
```

## Quem salva o quê

- **`/carrossel` e `/publicar-tema`** criam uma pasta em `conteudo/<tipo>-<tema>-<data>/`
- **`/legenda` e `/reaproveitar`** usam a mesma pasta `conteudo/` (`post-`, `reels-` ou `carrossel-<tema>-<data>/`)
- **`/roteiro-reels`** cria `conteudo/reels-<tema>-<data>/` com `roteiro.md` e `legenda.md`
- **`/calendario-editorial`, `/stories`, `/perfil-instagram`, `/nicho-instagram` e `/extrair-gancho`** salvam em `instagram/`
- **`/seo`** preenche os 8 arquivos numerados em `seo/`
- **`/anuncio-google`** cria `campanhas/google-ads-<data>/` com os CSVs
- **`/relatorio-ads`** cria `campanhas/relatorios/<data>-relatorio.md`
- **`/responder-avaliacoes`** salva histórico em `avaliacoes-google/`, só se você pedir

As imagens são geradas pelo `scripts/render.js`, que transforma o HTML do
carrossel em PNG (e JPG, quando o `/aprovar-post` precisa).

## Versionamento

Tudo aqui vai pro GitHub pelo `/salvar`. Serve pra comparar a evolução do
SEO mês a mês, rever copies antigas ou recuperar uma peça depois de mexer
no Instagram.
