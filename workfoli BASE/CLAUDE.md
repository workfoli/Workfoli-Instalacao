@AGENTS.md
@_memoria/empresa.md
@_memoria/preferencias.md
@_memoria/estrategia.md

## Integração com o Claude Code

O Claude Code usa `/nome` para chamar as skills em `.claude/skills/`. As
regras compartilhadas e o contexto do negócio ficam no `AGENTS.md`; este
arquivo existe para manter a integração nativa do Claude Code. Quando uma
skill criar ou editar outra skill, rode `npm run sync:skills` para atualizar
as skills do Codex.
