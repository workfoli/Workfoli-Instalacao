---
name: mapear-rotinas
description: >
  Mapeia as tarefas que o usuário repete toda semana e cria skills personalizadas pra
  automatizá-las. Faz uma entrevista curta, confere o que já existe, propõe skills concretas e
  cria as aprovadas em `.claude/skills/`. Use quando o usuário pedir "/mapear-rotinas", "criar
  skills personalizadas", "automatizar minhas tarefas", "o que dá pra automatizar" ou "quero parar
  de fazer X na mão".
---

# /mapear-rotinas — De tarefa repetida a skill

Skill de descoberta e criação. O objetivo é transformar o que o usuário repete em automação ativa.

## Workflow

### Passo 1 — Entrevista de descoberta

Se `_memoria/estrategia.md` tiver algo em "Pra tirar das costas", começar por aí. Depois, três perguntas, uma por vez:

1. "Quais tarefas você repete toda semana e gostaria de não precisar mais pensar? Até 3. (ex: 'criar carrossel', 'mandar relatório pro cliente', 'fazer briefing')"
2. "Pra cada uma, o que você tem em mãos quando começa? (ex: 'um link de notícia', 'uma planilha', 'o nome do cliente')"
3. "E o que precisa sair no final? (ex: '5 slides em PNG', 'um e-mail pronto pra enviar', 'um PDF resumindo')"

### Passo 2 — Conferir o que já existe

1. **Skills instaladas** em `.claude/skills/`. O Workfoli já cobre carrossel, blog, SEO, avaliações, propostas, Google Ads, relatório de ads, análise de dados, e-mail, revisão de texto contra "cara de IA" (`/humanizar`) e o kit de Instagram (legenda, hashtags, calendário editorial, perfil, nicho, gancho de post de referência e reaproveitamento de conteúdo; ver `/instagram`).
2. **Catálogo** em `templates/skills/catalogo.md` (skills oficiais da Anthropic e sugestões).

Se algo já resolve a tarefa, sugerir em vez de criar:
> "Isso o `/<nome>` já faz. Quer testar com ele primeiro? Se faltar algo, eu ajusto a skill pro seu jeito."

### Passo 3 — Propor skills

Pra cada tarefa sem cobertura:

```
### /<nome-da-skill>
**O que faz:** [uma frase]
**Entrada:** [o que recebe]
**Saída:** [o que entrega e onde salva]
**Depende de:** [arquivos de _memoria/, identidade/, ferramentas externas]
```

Pra dependências externas (APIs, conectores), consultar `templates/ferramentas/catalogo.md`.

Mostrar todas as propostas juntas e perguntar:
> "Quais dessas você quer que eu crie agora? Pode escolher todas, algumas ou nenhuma, e pedir ajustes."

### Passo 4 — Criar as aprovadas

Pra cada skill aprovada:

1. Criar `.claude/skills/<nome>/SKILL.md` (nome em kebab-case, sem acento)
2. Frontmatter:
   - `name`: igual ao nome da pasta
   - `description`: o que faz + quando usar, com as frases que o usuário realmente fala (é por ela que a skill é encontrada)
3. Corpo:
   - Dependências (arquivos de contexto, ferramentas)
   - Workflow em passos numerados
   - Checkpoint de aprovação antes de qualquer coisa irreversível (publicar, enviar, gastar)
   - Onde salvar a saída (seguir a tabela "Onde cada coisa mora" do `AGENTS.md`)
   - Regras: o que sempre fazer e o que nunca fazer
4. Modelos e exemplos de apoio ficam dentro da pasta da skill
5. Calibrar tom e regras com `_memoria/preferencias.md` e `_memoria/empresa.md`

### Passo 5 — Resumo

```
Criei [N] skills:
✓ /<nome1> — .claude/skills/<nome1>/SKILL.md
✓ /<nome2> — .claude/skills/<nome2>/SKILL.md

Depois de criar ou editar as skills, executar `npm run sync:skills` para que o Codex receba a mesma versão.

Pra usar: peça normalmente ou digite / e o nome da skill.
Pra ajustar depois: me diga o que mudar, ou edite o SKILL.md.
```

Se a tarefa veio de `tarefas.md` ou de "Pra tirar das costas", marcar como resolvida.

## Regras

- Não criar skill pra tarefa que aconteceu uma vez só: tem que ser repetível
- No máximo 5 skills por rodada. Se pedirem mais, dividir em rodadas
- Toda skill precisa de `description` com gatilho claro, senão ela nunca é encontrada
- Se a skill depender de ferramenta que o usuário não tem (ex: Notion sem conector), avisar antes e oferecer uma versão simplificada
