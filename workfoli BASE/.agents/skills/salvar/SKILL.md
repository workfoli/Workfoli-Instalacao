---
name: salvar
description: >
  Salva o trabalho do Workfoli no GitHub (commit + push). Na primeira vez, configura o repositório
  remoto. Antes de enviar, confere que nenhuma chave ou arquivo sensível vai junto. Use quando o
  usuário disser "salvar", "salva no github", "commit", "push", "faz backup", "/salvar" ou pedir
  pra guardar o trabalho.
---

# /salvar — Salvar no GitHub

Uma função só: garantir que o trabalho do usuário está seguro no GitHub. Precisa ser fácil pra quem nunca usou git.

## Pré-requisitos

- `git --version` precisa funcionar. Se não funcionar, orientar a instalação (Windows: `winget install Git.Git` ou https://git-scm.com/downloads; Mac: `xcode-select --install`) e parar.
- Se `git config user.name` ou `git config user.email` estiverem vazios, perguntar nome e e-mail e configurar com `git config --global`.

## Checagem de segurança (sempre, antes de qualquer commit)

1. Confirmar que o `.gitignore` contém `.env`. Se não contiver, adicionar a linha.
2. Rodar `git ls-files .env` (em repositório já existente). Se retornar algo, o `.env` está versionado: parar, avisar o usuário e oferecer `git rm --cached .env` antes de seguir.
3. Olhar os arquivos que vão entrar no commit. Se aparecer algo com cara de segredo (`.env*`, `*.pem`, `*.key`, `credentials*.json`, `token*`), parar e perguntar antes de incluir.
4. Nada de `dados/`, bancos (`*.sqlite`, `*.db`), planilhas de clientes ou documentos pessoais entra no commit: se aparecer, parar e explicar que esse material fica fora do Git (camadas privadas da instância).
5. Rodar `npm run validar`. Manifesto inválido: corrigir antes de salvar.

## Workflow

### Primeira vez (pasta ainda não é repositório)

Detectar com `git rev-parse --is-inside-work-tree`. Se falhar:

1. Perguntar:
   > "É a primeira vez que vamos salvar no GitHub. Você já criou um repositório pra este projeto?
   > 1. Sim, aqui está a URL (ex: https://github.com/seu-usuario/nome-do-negocio.git)
   > 2. Não, cria pra mim: me diz um nome pro repositório (ex: nome-do-negocio)"

2. **Opção 1:** `git init` → checagem de segurança → `git add .` → `git commit -m "Setup inicial do Workfoli"` → `git branch -M main` → `git remote add origin <URL>` → `git push -u origin main`.

3. **Opção 2:** verificar se o GitHub CLI está instalado (`gh --version`).
   - Se estiver: `git init` → checagem de segurança → commit inicial → `gh repo create <nome> --private --source=. --push`.
   - Se não: orientar a instalação do `gh` (Windows: `winget install GitHub.cli`; Mac: `brew install gh`; depois `gh auth login`) ou a criação manual do repositório em https://github.com/new, e voltar pra opção 1 com a URL.

Repositório novo é sempre **privado**, a menos que o usuário peça o contrário.

### Das próximas vezes (já configurado)

1. `git status`. Se não houver mudança: "Está tudo sincronizado, nada novo pra salvar." e parar.
2. Checagem de segurança.
3. Mostrar um resumo curto do que mudou e perguntar:
   > "Vou salvar isso tudo. Quer descrever a mudança em uma frase ou uso um resumo automático?"
4. Mensagem do usuário, se houver. Senão, gerar uma linha a partir dos arquivos alterados ("Adiciona carrossel sobre X", "Atualiza memória do negócio", "Cria proposta pro cliente Y").
5. `git add .` → `git commit -m "<mensagem>"` → `git push`.
6. Confirmar com o link do repositório (a partir de `git remote get-url origin`):
   > "Salvo. Ver no GitHub: <URL>"

## Regras

- Nunca usar `--force` sem pedido explícito do usuário
- Nunca rodar `git reset --hard` ou outro comando destrutivo sem confirmação clara
- Se o push falhar por divergência (alguém mudou o remoto), explicar em linguagem simples e oferecer `git pull --rebase` antes de tentar de novo
- Nunca pular a checagem de segurança
