# Regras para agentes neste repositório

Valem para a manutenção dos modelos e do Core. Se você está trabalhando dentro de `instances/<empresa>/base`,
siga o `AGENTS.md` daquela Base: ela é a empresa, não o produto.

- Nome oficial: **Workfoli** (nunca Workfolio, WorkFoli ou WORKFOLI em texto corrido).
- `workfoli BASE/` e `workfoli HUB/` são modelos genéricos: **nada de dados de clientes**, nem em testes (use dados
  sintéticos, com e-mails em `exemplo.test`). Confira com
  `node bin/workfoli.mjs doctor --templates --denylist "<lista privada fora do repositório>"` na pasta do Hub.
- Instâncias ficam em `instances/` (fora do Git). O conteúdo de uma instância nunca volta para os modelos.
- Contrato Base ↔ Hub: edite só em `workfoli HUB/packages/contract/` e rode `npm run sync:contract`.
- Antes de concluir mudanças no Hub: `npm run typecheck` e `npm test` (e `npm run test:ui` se mexer na interface).
- **Sem push, deploy, DNS, publicação, contas externas ou pagamentos** sem autorização explícita de quem
  responde pela instalação.
- Nunca imprimir segredos. Credenciais ficam em `instances/<empresa>/secrets/`.
