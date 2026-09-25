# Workfoli Hub (Core)

> Sua empresa, organizada para funcionar melhor.

Este repositório é o **motor da Workfoli**: o Core genérico, a CLI de instalação, o servidor e a
interface do **Workfoli Hub**, o **Local Agent** e o importador desktop. Ele é um template canônico:
não contém dados de nenhuma empresa.

- **Workfoli Base** (repositório irmão `workfoli BASE`): estrutura interna de contexto de uma empresa.
- **Workfoli Hub** (este repositório): camada visual e operacional **opcional**, instalada depois sobre
  uma Base madura, **uma instalação por empresa**. A empresa não é cadastrada de novo: o Hub lê o
  contrato da Base (`workfoli.base.json`).

A Workfoli é uma empresa de serviços, não um SaaS: cada cliente tem a própria instalação, com dados,
usuários e credenciais isolados. O motor é reutilizado; os dados não.

## Começar

```powershell
npm.cmd install
npm.cmd run build:hub
node bin/workfoli.mjs doctor --templates

# empresa nova (cria instances/<slug>/base a partir do template da Base)
node bin/workfoli.mjs init minha-empresa --name "Minha Empresa" --profile services

# depois de estruturar a Base (/instalar no Claude Code ou $instalar no Codex):
node bin/workfoli.mjs hub install "..\instances\minha-empresa"
node bin/workfoli.mjs hub start "..\instances\minha-empresa"
```

O `hub install` imprime o link de ativação do proprietário (uso único); no computador do Hub,
`hub start --open` abre a ativação direto no navegador enquanto o proprietário não tem conta. A interface abre em
`http://127.0.0.1:4870` e funciona no computador, notebook e celular (na rede, via HTTPS/proxy).

Guia completo: [docs/instalacao.md](docs/instalacao.md).

## CLI

| Comando | Faz |
|---|---|
| `init <slug> --name "Empresa"` | Cria a instância da empresa com a Base a partir do template (`--with-hub` instala o Hub junto) |
| `base init/validate/upgrade <pasta>` | Cria, valida (contrato, credenciais, `.gitignore`) e atualiza a Base sem perder customizações |
| `hub install/sync/start <instância>` | Instala o Hub sobre a Base, relê a Base (aprovação para papéis sugeridos), inicia o servidor |
| `hub owner/invite/pair-code <instância>` | Link de ativação do proprietário, convite, código de pareamento do Local Agent |
| `agent pair/run <instância>` | Pareia e roda o Local Agent (Base local ↔ Hub hospedado) |
| `doctor [<instância>] [--templates] [--denylist <arq>]` | Diagnóstico de instância e dos templates |
| `update <instância> [--apply]` | Migra banco, configuração e manifesto com backup |
| `secrets list/set/remove <instância>` | Cofre de credenciais da instância (valores nunca exibidos) |

Aliases em português: `iniciar`, `diagnosticar`, `atualizar`, `segredos`, `hub instalar|sincronizar|iniciar`…

## Estrutura

```text
bin/workfoli.mjs          CLI
packages/contract/        contrato Base ↔ Hub (validador + JSON Schemas; cópia na Base)
packages/core/            módulos, políticas de dados, sensibilidade, classificação
packages/instance/        Base, instalação, sincronização, atualização, diagnóstico, segredos
packages/hub/             servidor: banco, autenticação, permissões, auditoria, serviços, IA, API
packages/hub/crm/         CRM nativo (funil, leads, contatos, empresas, histórico, automações)
packages/hub/integrations/ cofre de tokens, OAuth, provedores e sincronização
packages/agent/           Local Agent
apps/hub-web/             interface web do Hub (React + Vite → dist-hub/)
apps/desktop/             importador desktop (Electron)
template/hub/             template da instalação do Hub (copiado para cada instância)
docs/                     documentação
tests/                    testes com dados sintéticos
```

## Documentação

- [Arquitetura implementada](docs/arquitetura.md)
- [Contrato Base ↔ Hub](docs/contrato-base-hub.md)
- [Instalação e operação](docs/instalacao.md)
- [CRM](docs/crm.md) · [Integrações](docs/integracoes.md)
- [Segurança e limites](docs/seguranca.md)
- [Decisões](docs/decisoes.md) · [Roadmap](docs/roadmap.md)
- [Importador desktop](docs/importador-desktop.md) · [Backup do importador](docs/backup.md)

## Desenvolvimento

```powershell
npm.cmd run typecheck
npm.cmd test              # 125 testes, dados sintéticos
npm.cmd run test:ui       # interface real no Edge/Chrome instalado (após build:hub)
npm.cmd run test:e2e -- "..\instances\<x>"   # E2E num clone descartável da instância (a original não muda)
npm.cmd run dev:hub -- "..\instances\<x>"
npm.cmd run sync:contract # após mudar o contrato
npm.cmd run dev           # importador desktop
```

Nunca adicione dados de clientes a este repositório (nem em testes). Instâncias ficam em
`../instances/`, fora dos templates; `doctor --templates` confere.
