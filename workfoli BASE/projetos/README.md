# projetos/ — sites, landing pages, campanhas, sistemas e iniciativas

Uma pasta por projeto: `projetos/<id>/`, com `README.md` (objetivo, briefing, status) e as entregas
nas subpastas. Criada pelo `/novo-projeto` (Claude Code), `$novo-projeto` (Codex) ou pelo Workfoli Hub.

Todo projeto também é registrado em `workfoli.base.json` → `projects[]`:

```json
{ "id": "landing-lancamento", "name": "Landing page de lançamento", "type": "landing-page", "status": "active", "path": "projetos/landing-lancamento", "summary": "Captar interessados no lançamento." }
```

Tipos: `website`, `landing-page`, `campaign`, `content`, `system`, `automation`, `integration`,
`dashboard`, `data`, `brand`, `other`. Situação: `planned`, `active`, `paused`, `done`, `archived`.

Código de um site ou sistema pode morar aqui. Dependências (`node_modules/`), builds e arquivos
`.env` nunca vão para o Git.
