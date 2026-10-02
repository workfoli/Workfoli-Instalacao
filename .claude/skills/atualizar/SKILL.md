---
name: atualizar
description: >
  Varre o projeto e atualiza os arquivos de contexto (`_memoria/empresa.md`, `preferencias.md`,
  `estrategia.md`, `AGENTS.md`, `identidade/design-guide.md`, `tarefas.md`) que ficaram
  desatualizados em relação ao estado real do workspace. Use quando o usuário disser "atualiza",
  "/atualizar", "varre o projeto", "a memória está certa?" ou pedir uma revisão geral.
---

# /atualizar — Varredura e atualização de contexto

Compara o que está nos arquivos de contexto com o estado real do workspace e propõe atualizações.

## Workflow

### Passo 1 — Levantamento

Listar:
- Pastas na raiz (cada uma representa uma área de trabalho)
- Subpastas em `clientes/` e `projetos/` (se existirem): cada uma é um cliente ou projeto
- Skills em `.claude/skills/`
- Arquivos criados ou alterados nos últimos 30 dias (usar `git log` se a pasta for repositório; senão, a data de modificação)
- Pendências em `tarefas.md`

### Passo 2 — Comparação

Ler os arquivos de contexto e identificar:

- **`_memoria/empresa.md`:** clientes, serviços e ferramentas batem com o que existe no workspace?
- **`_memoria/estrategia.md`:** o foco ainda faz sentido? Tem prazo vencido em "Prazos e datas"?
- **`AGENTS.md`:** as regras de organização batem com o uso real? Tem skill criada que não está documentada?
- **`identidade/design-guide.md`:** continua coerente com as últimas peças geradas (carrosséis, propostas)?
- **`tarefas.md`:** itens concluídos (`[x]`) ainda em "Agora", ou pendências que o workspace mostra que já foram feitas?
- **`workfoli.base.json`:** cada pasta em `projetos/` e `clientes/` está em `projects[]`? Cada arquivo em `servicos/` está em `services[]`? Algum item aponta para caminho que não existe? Integrações citadas na memória estão em `integrations[]` (só com o nome das credenciais)? Rodar `npm run validar` e incluir os avisos na proposta.

Pasta listada no `AGENTS.md` que ainda não existe não é problema: ela é criada quando o primeiro arquivo chegar. Sinalizar só o contrário: pasta que existe e não está documentada, ou regra que o uso real contradiz.

### Passo 3 — Proposta de mudanças

Apresentar uma lista curta:

```
Encontrei [N] coisas pra atualizar:

1. _memoria/empresa.md: falta o cliente "Acme" (pasta clientes/Acme/ criada em [data])
2. AGENTS.md: a regra diz "propostas vão em propostas/", mas elas estão em clientes/<x>/
3. _memoria/estrategia.md: fala em "fechar o 1º cliente em fevereiro"; já é abril e há 3 clientes ativos
4. tarefas.md: 4 itens concluídos ainda em "Agora"

Quer que eu aplique? Posso aplicar todas, só algumas ou nenhuma.
```

### Passo 4 — Aplicação

Com aprovação, editar com precisão: só a linha relevante, sem reformatar o documento. Itens concluídos de `tarefas.md` vão pra seção "Feito". Mostrar o que mudou em cada arquivo.

## Regras

- Não inventar fatos: só registrar o que tem evidência no workspace
- Evidência ambígua (ex: pasta vazia chamada "Cliente Novo") → perguntar antes de registrar
- Não apagar conteúdo dos arquivos de contexto, só atualizar e acrescentar (exceto mover tarefas concluídas)
- Nunca mexer nas regras compartilhadas do `AGENTS.md`
- Se nada precisar mudar: "Está tudo coerente, nada pra atualizar."
