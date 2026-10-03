# Catálogo de skills

Skills que vão além das 25 que já vêm no Workfoli (listadas no `README.md`). Use como
referência ao criar skills novas com o `/mapear-rotinas`, ou instale as que fizerem sentido.

> A fonte deste projeto fica em `.claude/skills/<nome>/SKILL.md` e é espelhada em
> `.agents/skills/<nome>/SKILL.md` para o Codex. Skills globais ficam em
> `~/.claude/skills/<nome>/SKILL.md` e `~/.agents/skills/<nome>/SKILL.md`.
> No Claude Code use `/`; no Codex use `$` ou linguagem natural.

---

## Skills oficiais da Anthropic

Instaladas como plugins, a partir do repositório oficial. Uma vez só, dentro do Claude Code:

```
/plugin marketplace add anthropics/skills
/plugin install document-skills@anthropic-agent-skills
/plugin install example-skills@anthropic-agent-skills
```

Depois é só pedir em linguagem normal ("usa a skill de PDF pra...") ou chamar pelo nome
completo, ex: `/document-skills:pdf`.

### Documentos (plugin `document-skills`)

**PDF** (`pdf`): extrai texto e tabelas, cria PDFs, junta e separa documentos, preenche formulários.
Bom pra: contratos, relatórios, formulários.

**Word** (`docx`): cria e edita documentos Word com formatação, controle de alterações e comentários.
Bom pra: propostas formais, contratos, clientes que pedem .docx.

**PowerPoint** (`pptx`): cria e edita apresentações com layouts e anotações do apresentador.
Bom pra: apresentações pra clientes, decks de vendas, treinamentos.

**Excel** (`xlsx`): cria e edita planilhas com fórmulas, formatação e gráficos.
Bom pra: relatórios financeiros, painéis em planilha, análise de dados.

### Criação e produtividade (plugin `example-skills`)

**Frontend Design** (`frontend-design`): interfaces web com visual profissional, fugindo da cara genérica de IA.
Bom pra: landing pages, páginas de produto, painéis.

**Canvas Design** (`canvas-design`): arte visual em PNG e PDF com princípios de design.
Bom pra: capas de e-book, banners, peças gráficas, thumbnails.

**Doc Co-Authoring** (`doc-coauthoring`): fluxo guiado pra escrever documentos a quatro mãos.
Bom pra: propostas técnicas, especificações, procedimentos (SOPs).

**Internal Comms** (`internal-comms`): comunicados internos, relatórios de status, newsletters de equipe.
Bom pra: perfil empresa ou agência com time.

**Webapp Testing** (`webapp-testing`): testa sites locais com Playwright (capturas, funcionamento, erros).
Bom pra: conferir uma landing page antes de publicar.

**Skill Creator** (`skill-creator`): guia pra criar, testar e melhorar skills.
Bom pra: quando o `/mapear-rotinas` não basta e a skill é mais complexa.

---

## Ideias pra criar com o `/mapear-rotinas`

Estas **não vêm instaladas**. São skills que costumam valer a pena. Peça pro Claude criar
(`/mapear-rotinas` ou "cria uma skill de ...") e ele adapta ao seu negócio.

### Copy de resposta direta (método Eugene Schwartz)
**O que faria:** diagnostica o nível de consciência e de sofisticação do mercado antes de escrever copy de venda.
**Bom pra:** landing pages, e-mails de venda, VSLs, páginas de captura.

### Copy de marca (método David Ogilvy)
**O que faria:** copy institucional com pesquisa profunda, grande ideia e títulos informativos.
**Bom pra:** manifesto de marca, campanhas institucionais, slogans, posicionamento.

### Roteiro de Reels
**O que faria:** roteiro de Reels de 15 a 60 segundos com gancho nos 3 primeiros segundos (fórmulas G9 e G10 do `/instagram`), texto na tela por cena, fala, cortes e legenda.
**Bom pra:** quem grava vídeo e trava no que falar.

### Sequência de stories
**O que faria:** 3 a 6 telas de stories por dia (bastidor, enquete, caixinha, repost do feed, oferta) a partir do `/calendario-editorial`.
**Bom pra:** manter os stories todo dia sem pensar do zero.

### Transcrição de vídeo do YouTube
**O que faria:** baixa a transcrição de um vídeo (com yt-dlp) e transforma em carrossel, newsletter ou post.
**Precisa de:** yt-dlp instalado (ver `templates/ferramentas/catalogo.md`).

---

## Skills de terceiros já incorporadas

### instagram-skills (Sergey Bulaev, MIT)
**O que é:** 9 skills de Instagram em inglês (legenda, carrossel, hashtags, humanizador, calendário, reaproveitamento, perfil, nicho, gancho).
**Como entrou no Workfoli:** traduzidas e adaptadas como `/instagram`, `/legenda`, `/hashtags`, `/humanizar`, `/calendario-editorial`, `/reaproveitar`, `/perfil-instagram`, `/nicho-instagram`, `/extrair-gancho` e as regras de carrossel do `/carrossel`. Licença em `.claude/skills/instagram/CREDITOS.md`.
**Fonte:** https://github.com/sergebulaev/instagram-skills

---

## Como adicionar uma skill a este catálogo

Testou uma skill e quer deixar registrada pra referência:

```markdown
### Nome da skill
**O que faz:** [uma frase]
**Bom pra:** [casos de uso práticos]
**Como instalar:** [comando ou instrução]
**Fonte:** [oficial da Anthropic, criada por você ou de terceiros]
```
