# Instalação e operação

Todos os comandos rodam na pasta `workfoli HUB`. Onde aparece `workfoli`, use `node bin/workfoli.mjs`
(ou rode `npm link` uma vez para ter o comando `workfoli` global). No PowerShell, prefira `npm.cmd`.

## 1. Preparar o Core (uma vez por máquina)

```powershell
npm.cmd install
npm.cmd run build:hub      # interface web do Hub (dist-hub/)
node bin/workfoli.mjs doctor --templates
```

Requisitos: Node.js 22.13+ (recomendado 24), Git. Sem Python e sem módulos nativos para compilar.

## 2. Empresa nova: criar a Base

```powershell
node bin/workfoli.mjs init nome-da-empresa --name "Nome da Empresa" --profile services
```

Cria `instances/nome-da-empresa/base/` a partir do template canônico (o template não é alterado),
com identificador próprio, manifesto ativo, lock do template e repositório Git local. Se o Git não
tiver `user.name`/`user.email`, a Base fica sem o commit inicial: configure e faça o commit.

Depois:

1. Abra `instances/nome-da-empresa/base` no Claude Code ou Codex e rode `/instalar` (`$instalar`).
2. Estruture serviços, processos, projetos (`/novo-projeto`), infraestrutura e integrações.
3. Valide: `npm run validar` (na Base) e `node bin/workfoli.mjs base validate <base>` (completo).
4. Versione num repositório **privado** da própria empresa quando ela decidir (push é decisão do cliente).

Material antigo do cliente (ZIP, pastas) fica fora da Base. O importador desktop analisa sem executar
nada (ver [importador-desktop.md](importador-desktop.md)).

## 3. Instalar o Hub sobre a Base

```powershell
node bin/workfoli.mjs hub install "..\instances\nome-da-empresa"
node bin/workfoli.mjs hub start "..\instances\nome-da-empresa"
```

O instalador valida a Base, lê o contrato, cria `hub/`, `data/`, `files/`, `secrets/`, o banco, os
papéis (Core + sugestões da Base) e um **proprietário pendente**, e imprime um link de ativação de
uso único (24 h). Envie o link ao dono por canal privado. Para gerar outro: `hub owner <instância>`.
No próprio computador do Hub (modo local), `hub start <instância> --open` abre direto a página de ativação
enquanto o proprietário não tiver conta, sem mostrar o link no terminal; o link anterior deixa de valer.
Rodar `hub install` de novo não sobrescreve nada.

Opções: `--port`, `--host`, `--mode remote`, `--base <pasta>` (Base fora da instância).

## 4. Pessoas e acesso

- Convidar pela interface (Usuários → Convidar) ou `hub invite <instância> --name "Nome" --role member`.
- Papéis sugeridos pela Base: revisar com `hub sync <instância>` e aprovar com `--apply` (ou Configurações).
- Recuperar acesso do proprietário na própria máquina: `hub owner <instância> --recover` (link de 2 h).

## 5. Integrações

Conectar contas (Google, Meta, GitHub, Vercel, Cloudflare, Supabase) é feito no próprio Hub, em
**Integrações**, por quem tem `integrations:admin`: OAuth abre a página oficial do provedor no navegador;
provedores por token pedem o token uma vez. Tokens ficam cifrados no cofre da instância. Guia completo,
inclusive como criar os apps OAuth e qual endereço de retorno cadastrar: [integracoes.md](integracoes.md).

Credenciais do **app** (client id/secret, developer token) e outros segredos: nunca na Base. Grave no
cofre da instância sem exibir o valor:

```powershell
Get-Content .\client-id.txt | node bin/workfoli.mjs secrets set "..\instances\nome-da-empresa" GOOGLE_OAUTH_CLIENT_ID
node bin/workfoli.mjs secrets list "..\instances\nome-da-empresa"
```

O manifesto declara só nomes (`"secrets": ["GITHUB_TOKEN"]`); o Hub mostra apenas se cada credencial está
configurada. Sem as credenciais do app, a integração aparece como "Aguardando credenciais do app" e o resto
do Hub funciona normalmente.

## 6. Hub fora do computador (modo remoto + Local Agent)

1. No servidor da empresa: instância com `hub install ... --mode remote` e `server.publicUrl` HTTPS em `workfoli.hub.json`.
2. No Hub: Configurações → Gerar código de pareamento (ou `hub pair-code`).
3. No computador da Base: `node bin/workfoli.mjs agent pair "<instância>" --hub https://... --code <código>`.
4. Deixar rodando `agent run "<instância>"` (ou agendar `agent run --once`).

O Agent só abre conexões de saída, envia documentos de conhecimento e imagens de identidade permitidos,
e aplica alterações da fila conferindo a revisão da Base. Revogue dispositivos em Configurações.
Hospedagem, domínio e TLS são decisões de implantação por empresa (não automatizadas aqui).

## 7. Manutenção

```powershell
node bin/workfoli.mjs doctor "..\instances\nome-da-empresa"
node bin/workfoli.mjs update "..\instances\nome-da-empresa"            # simulação
node bin/workfoli.mjs update "..\instances\nome-da-empresa" --apply    # migra com backup
node bin/workfoli.mjs base upgrade "..\instances\nome-da-empresa\base" # template novo, simulação
node bin/workfoli.mjs hub sync "..\instances\nome-da-empresa"
```

Da 0.3 para a 0.4: `update --apply` converte o manifesto para v3 (o CRM antigo vira a seção `crm`, com aviso)
e migra o banco para v2 (contatos antigos viram contatos e oportunidades; a tabela original é preservada como
`legacy_contacts_v1`). Revise depois o funil em CRM → Configuração e commite a Base.

O `update --apply` também atualiza o validador dentro da Base (`scripts/workfoli-contract.mjs` e o schema) e os
papéis do Core (novos papéis e permissões da versão; o Hub faz o mesmo ao abrir). Um papel antigo da Base ou
personalizado cujo id o Core passou a reservar é preservado como `<id>-anterior`, com quem o usa.

Backups: antes de mudar qualquer coisa, o `update --apply` guarda em `data/backups/` o banco
(`hub-v<N>-<data>.sqlite`, cópia consistente), o manifesto original (`workfoli.base-v<N>-<data>.json`) e o
validador anterior da Base (`contrato-<data>/`). Para backup completo, pare o Hub e copie a pasta da instância
inteira para um destino seguro (contém dados privados e segredos: cifre).

Voltar ao estado anterior a um `update` (não há comando nesta versão; procedimento validado com dados reais):

1. Pare o Hub.
2. Copie `data/backups/hub-v<N>-<data>.sqlite` para `data/hub.sqlite` e apague `data/hub.sqlite-wal` e `data/hub.sqlite-shm`.
3. Copie `data/backups/workfoli.base-v<N>-<data>.json` para `base/workfoli.base.json` (ou recupere pelo Git da Base).
4. Copie `data/backups/contrato-<data>/scripts/*` e `schemas/*` para `base/scripts/` e `base/schemas/`.
5. Rode `doctor`: ele mostra de novo as migrações pendentes; use o Core anterior ou rode `update --apply` quando quiser.

## 8. Desenvolvimento

```powershell
npm.cmd run typecheck
npm.cmd test                                    # 125 testes, só dados sintéticos
npm.cmd run build:hub; npm.cmd run test:ui      # interface real no Edge/Chrome instalado
npm.cmd run test:e2e -- "..\instances\<x>" [--also chrome,<exe>]  # E2E completo num CLONE descartável da instância
npm.cmd run test:desktop                        # importador desktop (Electron) de ponta a ponta
npm.cmd run dev:hub -- "..\instances\<x>"       # Vite + API com recarga
node scripts/preview-hub.mjs "<pasta da Base>"  # prévia descartável do Hub de uma Base
npm.cmd run sync:contract                       # copia o contrato para o template da Base
```
