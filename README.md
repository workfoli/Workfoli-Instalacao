# Workfoli

> Sua empresa, organizada para funcionar melhor.

Este repositório contém o modelo genérico da **Workfoli Base**: memória, identidade, serviços,
processos, projetos, conhecimento e skills para Claude Code e Codex. Não contém dados de empresas.

O Hub foi retirado do projeto. A Base funciona diretamente com arquivos, Claude Code e Codex.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `workfoli BASE/` | Modelo genérico da Base |
| `instances/<empresa>/base/` | Base privada de cada empresa, fora do Git deste repositório |
| `_backups/` | Arquivos locais preservados; nunca enviados ao GitHub |

## Criar uma Base

Requisitos: Git, Node.js 22+ e Claude Code ou Codex. No PowerShell:

```powershell
git clone https://github.com/workfoli/workfoli.git
cd workfoli
New-Item -ItemType Directory -Path "instances/minha-empresa" -Force
Copy-Item -LiteralPath "workfoli BASE" -Destination "instances/minha-empresa/base" -Recurse
cd "instances/minha-empresa/base"
```

Use uma pasta de destino nova e vazia. Abra essa Base no Claude Code ou Codex e execute
`/instalar` ou `$instalar`. A entrevista configura o manifesto, a memória e a identidade.

```powershell
npm.cmd run validar
```

A validação do manifesto não exige instalação de dependências. Para os scripts de renderização,
instale as dependências dentro da Base com `npm.cmd install`.

## Trabalhar e preservar dados

Abra sempre a Base da empresa e siga seu `AGENTS.md`. Projetos ficam em `projetos/`,
marca em `identidade/`, processos em `processos/` e documentos pontuais em `saidas/`.
Respeite as pastas adicionais já adotadas pela empresa; não mova materiais apenas para igualar o modelo.

Cada empresa mantém seus dados privados em sua própria instalação. `data/`, `files/` e
`secrets/` ficam separados da Base e fora do Git. Bancos existentes são preservados, mas a Base
não oferece interface de CRM nem importa esses registros automaticamente.

O manifesto e o validador mantêm o formato existente para preservar as Bases já criadas.
Campos legados de CRM, módulos e papéis não ativam um Hub nem concedem acesso.

Antes de publicar, valide a Base e revise os arquivos do commit. Nunca envie instâncias,
credenciais, bancos, backups ou dados de clientes para este repositório.

## Documentação

- [Modelo da Base](workfoli%20BASE/README.md)
- [Regras de manutenção](AGENTS.md)
- [Instâncias privadas](instances/README.md)
