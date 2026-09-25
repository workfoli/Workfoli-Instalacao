# Workfoli

> Sua empresa, organizada para funcionar melhor.

Este repositório é o ponto de partida de uma nova instalação da Workfoli. Ele traz só a estrutura genérica:
o modelo da **Workfoli Base** e o **Workfoli Hub** (Core, CLI e interface web). Não contém dados de nenhuma
empresa.

Cada empresa recebe uma instalação própria e isolada, chamada **instância**, criada a partir deste repositório.
Os dados de cada empresa ficam na pasta dela e nunca voltam para cá.

## O que tem aqui

| Pasta | O que é |
|---|---|
| `workfoli BASE/` | Modelo da Base: a estrutura de contexto que cada empresa recebe (memória, identidade, serviços, processos, projetos e skills para Claude Code e Codex). |
| `workfoli HUB/` | Core e Hub: a CLI `workfoli`, o contrato Base ↔ Hub, o servidor e a interface web do Hub, o Local Agent e o importador desktop. |
| `instances/` | Onde as empresas são criadas. Fica fora do Git: nada desta pasta vai para o GitHub. |

Os nomes das pastas têm espaço. Nos comandos, use sempre aspas: `cd "workfoli HUB"`.

## Antes de começar

- **Node.js 22.13 ou mais recente** (recomendado: 24): <https://nodejs.org>
- **Git**: <https://git-scm.com>
- **Edge ou Chrome**
- **Claude Code ou Codex**, para cadastrar a empresa na Base

Testado no Windows 11 com PowerShell. Se o PowerShell bloquear o `npm`, use `npm.cmd`, como nos exemplos.

## 1. Clonar

Escolha uma pasta de trabalho no computador que vai rodar a Workfoli da empresa (por exemplo, `C:\Workfoli`) e
clone o repositório:

```powershell
cd C:\Workfoli
git clone https://github.com/workfoli/workfoli.git
cd workfoli
```

## 2. Preparar o Core (uma vez por computador)

```powershell
cd "workfoli HUB"
npm.cmd install
npm.cmd run build:hub
node bin/workfoli.mjs doctor --templates
```

O `doctor` deve mostrar só linhas com ✓. A partir daqui, todos os comandos rodam dentro de `workfoli HUB`.

## 3. Criar a instância da empresa

```powershell
node bin/workfoli.mjs init nome-da-empresa --name "Nome da Empresa" --profile services
```

- `nome-da-empresa` é o identificador da pasta: minúsculas, sem acento, com hífen.
- `--profile` sugere os módulos iniciais: `general`, `services`, `agency`, `clinic`, `development` ou `retail`.
- O resultado é `instances\nome-da-empresa\base`, uma cópia do modelo com identificador próprio e repositório
  Git local. O modelo em `workfoli BASE` não é alterado.

Se o Git deste computador ainda não tiver nome e e-mail, a Base nasce sem o primeiro commit. Para resolver:

```powershell
cd "..\instances\nome-da-empresa\base"
git config user.name "Nome da Empresa"
git config user.email "contato@empresa.com.br"
git add -A
git commit -m "Base criada a partir do modelo da Workfoli"
cd "..\..\..\workfoli HUB"
```

## 4. Cadastrar a empresa na Base

Abra a pasta `instances\nome-da-empresa\base` no Claude Code e rode `/instalar` (no Codex: `$instalar`).
A entrevista preenche a memória da empresa, a identidade visual, os serviços, os processos e os projetos.

Tenha em mãos: nome e descrição da empresa, clientes que ela atende, serviços, contatos, redes sociais, logo e
cores, ferramentas que ela já usa e o que precisa melhorar primeiro.

Depois, valide:

```powershell
node bin/workfoli.mjs base validate "..\instances\nome-da-empresa\base"
```

A Base pode ser versionada num repositório **privado da própria empresa**, se ela quiser. Nunca neste repositório.

## 5. Instalar e abrir o Hub (opcional)

O Hub é a interface visual da empresa: projetos, clientes (CRM), tarefas, arquivos, conhecimento e usuários.

```powershell
node bin/workfoli.mjs hub install "..\instances\nome-da-empresa"
node bin/workfoli.mjs hub start "..\instances\nome-da-empresa" --open
```

- O Hub abre em <http://127.0.0.1:4870>. Para usar outra porta, rode o `hub install` com `--port 4871`.
- Na primeira vez, o navegador abre a **ativação do proprietário** (link de uso único, válido por 24 h). Para
  gerar outro link: `node bin/workfoli.mjs hub owner "..\instances\nome-da-empresa"`.
- O terminal aberto é o Hub rodando. Fechar o terminal (ou Ctrl+C) desliga o Hub.

Atalho: `init nome-da-empresa --name "Nome da Empresa" --with-hub` cria a Base e instala o Hub de uma vez.

## Onde ficam os dados de cada empresa

Tudo fica em `instances\nome-da-empresa\`:

| Pasta | Conteúdo | Vai para o Git? |
|---|---|---|
| `base/` | Contexto da empresa: memória, identidade, serviços, processos, projetos | Só no repositório privado da própria empresa |
| `hub/` | Configuração do Hub e módulos customizados | Opcional, sem segredos |
| `data/` | Banco do Hub, histórico e backups | Nunca |
| `files/` | Arquivos privados | Nunca |
| `secrets/` | Credenciais da empresa | Nunca |

## Regras de segurança

- Nada de `instances/` entra neste repositório. O `.gitignore` já bloqueia a pasta.
- Credenciais vão para o cofre da instância, nunca para a Base ou para o Git. O valor entra pela entrada padrão e
  não aparece na tela:
  ```powershell
  Get-Content .\token.txt | node bin/workfoli.mjs secrets set "..\instances\nome-da-empresa" NOME_DA_CREDENCIAL
  ```
- Backup: pare o Hub e copie a pasta inteira da instância para um destino cifrado.
- Antes de publicar mudanças nos modelos, rode o `doctor --templates` com uma lista privada de termos proibidos
  (nomes de clientes), guardada fora do repositório: `--denylist "<caminho da lista>"`.

## Atualizar uma instalação

```powershell
cd "C:\Workfoli\workfoli"
git pull
cd "workfoli HUB"
npm.cmd install
npm.cmd run build:hub
node bin/workfoli.mjs update "..\instances\nome-da-empresa"             # mostra o que vai mudar
node bin/workfoli.mjs update "..\instances\nome-da-empresa" --apply     # aplica, com backup antes
node bin/workfoli.mjs base upgrade "..\instances\nome-da-empresa\base"  # novidades do modelo da Base (simulação)
```

## Comandos úteis

| Comando | Faz |
|---|---|
| `node bin/workfoli.mjs --help` | Lista todos os comandos |
| `doctor "<instância>"` | Diagnóstico da instância |
| `hub invite "<instância>" --name "Nome" --role member` | Convida uma pessoa da equipe |
| `hub owner "<instância>" --recover` | Recupera o acesso do proprietário (link de 2 h) |
| `secrets list "<instância>"` | Mostra quais credenciais estão configuradas, sem os valores |

## Problemas comuns

- **`npm` bloqueado no PowerShell:** use `npm.cmd`.
- **Aviso "install scripts not yet covered" no `npm install`:** é um aviso do npm 11. Se o `build:hub` falhar por
  causa do `esbuild`, rode `npm.cmd install-scripts approve esbuild` e instale de novo.
- **"Template da Base não encontrado":** rode os comandos dentro de `workfoli HUB`, com `workfoli BASE` na mesma
  pasta do clone.
- **Porta ocupada:** instale o Hub com outra porta (`hub install ... --port 4871`).

## Documentação

- [Instalação e operação](workfoli%20HUB/docs/instalacao.md)
- [Arquitetura](workfoli%20HUB/docs/arquitetura.md)
- [Contrato Base ↔ Hub](workfoli%20HUB/docs/contrato-base-hub.md)
- [CRM](workfoli%20HUB/docs/crm.md) · [Integrações](workfoli%20HUB/docs/integracoes.md)
- [Segurança e limites](workfoli%20HUB/docs/seguranca.md)
- [Decisões](workfoli%20HUB/docs/decisoes.md) · [Roadmap](workfoli%20HUB/docs/roadmap.md)
- [Modelo da Base](workfoli%20BASE/README.md)

## Para quem mantém o código

Regras de manutenção em [AGENTS.md](AGENTS.md). Antes de concluir uma mudança no Hub:

```powershell
cd "workfoli HUB"
npm.cmd run typecheck
npm.cmd test
```
