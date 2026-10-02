---
name: novo-projeto
description: >
  Cria uma pasta de projeto nova com `AGENTS.md`, `CLAUDE.md` e `briefing.md` próprios, depois de uma entrevista
  curta (cliente, objetivo, entregas previstas). Use quando o usuário disser "novo projeto",
  "novo cliente", "fechei com X", "/novo-projeto", "começar projeto pra X" ou pedir pra estruturar
  um trabalho novo.
---

# /novo-projeto — Pasta de projeto com contexto próprio

Quando começa um projeto novo (cliente, iniciativa, produto), cria uma pasta com `AGENTS.md` próprio e um `CLAUDE.md` curto com `@AGENTS.md`. As regras específicas herdam o contexto da raiz.

## Workflow

### Passo 1 — Entrevista (4 perguntas)

1. "Qual o nome do projeto ou do cliente?"
2. "É cliente, projeto interno ou iniciativa pessoal?"
3. "Qual o objetivo principal, em uma frase?"
4. "Que entregas vai ter? (ex: ads, site, conteúdo, automação, proposta; pode ser mais de uma)"

### Passo 2 — Decidir o local

Conferir a convenção de pastas na seção "Sobre este negócio" do `AGENTS.md`. Padrão:

- **Cliente:** `clientes/<Nome>/`
- **Projeto interno:** `projetos/<nome>/`
- **Iniciativa pessoal:** perguntar onde a pessoa prefere

### Passo 3 — Estrutura básica

Criar a pasta com:

- `AGENTS.md` do projeto (regras específicas)
- `CLAUDE.md` do projeto contendo `@AGENTS.md`
- `briefing.md` com tudo o que foi coletado na entrevista
- Subpastas só para as entregas mencionadas (ex: "ads e conteúdo" → `ads/` e `conteudo/`)

### Passo 4 — `AGENTS.md` e `CLAUDE.md` do projeto

```markdown
# [Nome do projeto]

> Projeto criado em [data]. As instruções daqui valem dentro desta pasta e
> têm prioridade sobre as da raiz quando houver conflito.

## Sobre

[Objetivo, resposta 3]

## Tipo

[Cliente / Projeto interno / Iniciativa pessoal]

## Entregas previstas

- [entrega 1]
- [entrega 2]

## Onde salvar o quê

- Briefing e contexto: na raiz desta pasta
- Entregas: em cada subpasta (ads/, conteudo/, site/ etc.)

## Contexto herdado

Tom de voz, marca e contexto do negócio vêm de `_memoria/` e `identidade/`
na raiz. Não duplicar aqui.

## Específico deste projeto

[Vazio: preencher com as regras que valem só aqui, conforme aparecerem]
```

Criar também `CLAUDE.md` com apenas:

```text
@AGENTS.md
```

### Passo 5 — Registrar no manifesto

Acrescentar o projeto em `workfoli.base.json` → `projects[]` (mostrar antes de gravar):

```json
{ "id": "<slug da pasta>", "name": "<nome do projeto>", "type": "<tipo>", "status": "active", "path": "<caminho da pasta>", "summary": "<objetivo, resposta 3>", "createdAt": "<data ISO>" }
```

Tipo pela entrega principal: site → `website`, landing page → `landing-page`, ads/campanha → `campaign`,
conteúdo → `content`, sistema/app → `system`, automação → `automation`, integração → `integration`,
dashboard → `dashboard`, dados/relatório → `data`, marca → `brand`; senão `other`. Se o projeto
atende um serviço já listado em `services[]`, incluir `"services": ["<id>"]`. Rodar `npm run validar`.

Dados de pessoas do cliente (contatos, pacientes, CPF) não entram no briefing nem no manifesto:
eles pertencem à camada privada da instalação, fora da Base e do Git.

### Passo 6 — Resumo

```
Pasta criada: [caminho]
✓ AGENTS.md do projeto
✓ CLAUDE.md do projeto
✓ briefing.md
✓ Subpastas: [lista]
✓ Registrado em workfoli.base.json

Pode continuar abrindo o Claude Code ou o Codex na raiz. Quando formos
trabalhar neste projeto, eu leio o AGENTS.md da pasta antes de começar.
```

Se "proposta" estiver entre as entregas, oferecer: "Quer que eu já monte a proposta com o `/proposta`?"

## Regras

- Nome da pasta: do jeito que o usuário falou, reconhecível (espaços viram hífen)
- Não criar subpastas que não foram pedidas "pra organizar melhor"
- Se já existir pasta com o mesmo nome, avisar e perguntar se é pra usar a existente ou criar com sufixo
- Depois de criar, perguntar se deve registrar o cliente/projeto em `_memoria/empresa.md`
