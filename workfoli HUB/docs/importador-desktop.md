# Importador desktop (Electron)

Este documento descreve o **importador desktop** herdado do Hub 0.2 (Electron): a ferramenta do operador para analisar material existente de uma empresa (ZIP ou pasta) sem executá-lo. A arquitetura geral da Workfoli (Base, Core, Hub web, Local Agent) está em [arquitetura.md](arquitetura.md).

## Limites

- **BASE:** kit independente de skills, templates e instruções; não é o banco do cliente. Não é copiada ou executada automaticamente.
- **CORE (`packages/core`):** classificação, regras de sensibilidade e interpretação de projetos/conhecimento. Não acessa filesystem, banco, Electron ou UI.
- **Contratos (`packages/contracts`):** modelos tipados do inventário, conhecimento, revisão, projetos e IPC.
- **Adapters:** `import-source.ts` captura ZIP/pasta e orquestra a análise chamando o Core; `storage.ts` implementa SQLite por workspace, catálogo, busca e leitura de bytes preservados.
- **Desktop (`apps/desktop`):** main compõe os serviços; worker processa fontes; preload expõe métodos limitados; renderer React apresenta resultados.

O Core não importa Electron, React, BASE ou código LeanAI. A compatibilidade LeanAI reconhece dados por evidências no interpretador, sem importar o framework. Não existe um sistema de plugins executáveis neste MVP. Formatos de origem são normalizados em entradas canônicas antes dessa interpretação.

## Fluxo e persistência

O diálogo nativo cria um token temporário de seleção, consumido uma vez. O renderer não recebe uma API de filesystem. Uma importação gera UUID, staging e worker. As fontes regulares são armazenadas com IDs internos; nomes de origem ficam no manifesto. O ZIP também é preservado integralmente. O worker retorna relatório e textos elegíveis; o main persiste um banco de revisão.

Somente após **Criar cliente**, o armazenamento aplica correções em transação, grava identidade e atividade, fecha o banco, marca a captura pronta, move o diretório no mesmo volume e registra o catálogo. Repetir a confirmação retorna o mesmo workspace. Se a execução for interrompida depois da movimentação e antes do catálogo, a próxima inicialização reconcilia workspaces marcados como prontos.

Arquivos e banco não compartilham uma transação única. Esse protocolo de publicação evita anunciar um workspace incompleto. Análises interrompidas antes da publicação não aparecem como clientes. Nesta versão, uma revisão interrompida pelo fechamento do aplicativo precisa ser iniciada novamente; dados temporários anteriores podem permanecer no staging. Não há limpeza de workspaces confirmados nem exclusão automática de fontes.

## Dados

```text
%LOCALAPPDATA%/Workfoli/data/
├── catalog.sqlite
├── staging/<import-id>/
└── workspaces/<workspace-id>/
    ├── workspace.sqlite
    ├── ready.json
    ├── manifest.json
    ├── backups/               bancos anteriores à reanálise
    └── source/
        ├── original.zip       quando aplicável
        └── entries/<file-id>
```

O manifesto registra o resultado original da análise. Correções posteriores são canônicas no banco e não reescrevem o manifesto ou source. Tabelas: metadados versionados, arquivos, conhecimento, projetos, atividades e busca FTS5. Relacionamentos são IDs locais do workspace; consultas nunca unem bancos de clientes. O catálogo global contém somente o necessário para a lista de clientes.

O MVP mantém uma captura por workspace. Client e Workspace têm relação 1:1 nesta versão, representada pelo registro de workspace; separar identidades e acrescentar múltiplas capturas é evolução futura, sem inferir vínculos pelo nome.

`KnowledgeItem` separa dado explícito, inferência e edição humana. Alterar o valor durante a revisão preserva o valor original e marca a origem como usuário. Arquivo/linha continuam apontando para a evidência original, não para uma suposta declaração do valor editado. Valores contraditórios permanecem sinalizados.

## Reanálise de conhecimento (0.2)

`knowledge.ts` extrai sugestões de textos elegíveis; `reanalysis.ts` reconcilia com decisões anteriores. O escopo de uso participa da comparação de campos e conflitos. Evidências podem apontar para um intervalo inclusivo de linhas. A extração continua determinística e não interpreta as instruções dos documentos como comandos.

O serviço verifica hashes e limites ao reler as fontes. A proposta fica em memória, ligada ao workspace, a um token opaco com duração de 30 minutos e à revisão atual do banco. A UI recebe uma cópia; aplicar recebe somente o token, nunca aceita uma lista arbitrária de substituição. Revisões ou edições posteriores invalidam a proposta. Fechar o aplicativo descarta apenas a proposta, sem modificar o conhecimento.

Ao aplicar, `VACUUM INTO` gera um backup consistente, a revisão é conferida novamente sob transação de escrita e somente conhecimento, metadados de análise e atividade são atualizados. O catálogo é sincronizado após o commit e pode ser reconciliado na próxima abertura. Falha durante a transação restaura o estado anterior. O manifesto da importação continua representando a análise original.

Sugestões pendentes são conciliadas por fonte, campo e escopo, reutilizando IDs quando há correspondência. Itens confirmados, rejeitados ou editados pelo usuário são mantidos. Quando já há decisão humana para fonte/campo/escopo, a extração não a substitui. Esta operação não importa mudanças externas nem revisa restrições de arquivos; snapshots incrementais permanecem fora do escopo.

## Atualizações e roadmap

O MVP não implementa updater nem instalação de skills. HUB, BASE e schema são versionamentos distintos. Uma atualização futura da BASE precisa de manifesto, versão fixada e customizações separadas. Nunca usar o espelhamento destrutivo de skills para atualizar dados do cliente.

Próximas fases: parsers de documentos; backup/exportação consistente; revisão retomável; snapshots incrementais; instalação opcional da BASE; IA com contexto autorizado; desenvolvimento sobre cópias editáveis; integrações e colaboração.

## Uso

### Abrir no Windows

Depois de empacotar, abra `release/Workfoli 0.2.0.exe` (portátil) ou `release/win-unpacked/Workfoli.exe`. Na segunda opção, mantenha a pasta inteira junto do executável. Feche a versão anterior antes de abrir a atualização. Os dados locais existentes são mantidos.

1. Clique em **Novo cliente**.
2. Selecione um ZIP ou uma pasta.
3. Aguarde o inventário e confira as categorias, restrições e conhecimento encontrado.
4. Ajuste o nome e os dados necessários. Informações pendentes continuam a revisar.
5. Clique em **Criar cliente**.

Os originais ficam intactos. As cópias e bancos ficam em `%LOCALAPPDATA%/Workfoli/data`, fora do código. Os workspaces só aparecem após a confirmação. Arquivos restritos permanecem preservados, sem prévia e fora da busca.

### Atualizar o conhecimento de um cliente existente

Na área **Conhecimento**, escolha **Reanalisar conhecimento**, confira a proposta e aplique a atualização. A operação usa os textos elegíveis da captura já preservada; não exige importar novamente, não cria outro cliente e não modifica fontes, arquivos, categorias ou projetos.

Sugestões pendentes antigas podem ser corrigidas ou removidas. Conhecimentos confirmados, descartados e valores editados por você são preservados; sugestões novas continuam pendentes. Uma edição ou revisão feita depois da proposta exige gerar outra proposta. Os hashes das fontes são conferidos antes de analisar e antes de aplicar.

Antes de aplicar, o aplicativo cria uma cópia consistente do banco em `workspaces/<id>/backups/knowledge-<data>-<id>.sqlite`. Essa cópia permite recuperação técnica do estado anterior, mas não substitui backup da pasta completa, pois não duplica os arquivos de origem. Não há restauração de backup pela interface nesta versão.

Também é possível **editar** um valor depois da importação. O valor originalmente extraído e sua fonte continuam disponíveis. A revisão inicial agora permite abrir as fontes antes de criar o cliente; citações abrem com o trecho destacado.

### Análise sem interface

```powershell
npm.cmd run analyze -- "C:\Clientes\empresa.zip"
npm.cmd run analyze -- "C:\Clientes\empresa" --output "C:\AnalisesPrivadas"
```

O comando cria uma captura e `manifest.json` em `%LOCALAPPDATA%/Workfoli/analyses/<id>` por padrão. Não cria nem confirma um cliente no aplicativo. O manifesto contém dados privados, inclusive conhecimento extraído: mantenha-o fora de repositórios e serviços públicos. O terminal mostra apenas contagens, campos e metadados da análise, sem valores de conhecimento ou segredos.
