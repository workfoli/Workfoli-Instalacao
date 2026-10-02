# Regras para agentes neste repositório

Estas regras valem para a manutenção do modelo da Workfoli Base. Dentro de
`instances/<empresa>/base`, siga o `AGENTS.md` daquela Base: ela é a empresa.

- Nome oficial: **Workfoli**.
- `workfoli BASE/` é um modelo genérico: nada de dados de clientes, nem em testes.
  Use dados sintéticos e e-mails em `exemplo.test`.
- Instâncias ficam em `instances/`, fora do Git. Seu conteúdo nunca volta para o modelo.
- O Hub foi arquivado em `_backups/`. Não iniciar, instalar ou restaurar sem pedido explícito.
- O contrato e o schema da Base ficam em `workfoli BASE/scripts/workfoli-contract.mjs`
  e `workfoli BASE/schemas/workfoli.base.schema.json`. Preservar o formato das Bases existentes.
- Antes de concluir: `npm.cmd run validar` dentro de `workfoli BASE`. Depois de editar
  skills, executar `npm.cmd run sync:skills` e conferir o espelho.
- Sem push, deploy, DNS, publicação, contas externas ou pagamentos sem autorização explícita.
- Nunca imprimir segredos. Credenciais ficam em `instances/<empresa>/secrets/`.
- Nunca enviar `instances/`, `_backups/`, bancos ou dados privados para este repositório.
