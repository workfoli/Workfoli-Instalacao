# Backup e recuperação local

O backup protege o estado da instalação local. Ele é diferente do pacote de entrega de um workspace:

| Operação | Finalidade e conteúdo |
|---|---|
| **Exportar ZIP** no workspace | Entregar uma empresa/cliente a outro ambiente. Exporta conteúdo selecionado pelas regras de transferência, fontes e curadoria permitidas. Não leva a identidade local nem atribui propriedade no destino. O ZIP não é cifrado por este fluxo. |
| **Criar backup** | Recuperar a instalação, incluindo empresa principal, identificação local do responsável, vínculos, workspaces confirmados, conhecimento revisado, histórico e arquivos privados preservados. Gera um arquivo `.workfoli-backup` cifrado por senha. |

O backup completo **inclui material restrito e possíveis segredos existentes nas fontes**, como `.env`. Não deve ser usado como entrega neutra de um cliente. A identificação recuperada continua sendo local: este recurso não implementa login, sessão autenticada, conta cloud ou autorização entre usuários.

## Criar um backup

1. Conclua as importações, inclusive a revisão pendente, e aguarde as exportações terminarem.
2. Abra **Backup e recuperação**, selecione **Criar backup** e informe a senha duas vezes.
3. Use pelo menos 12 caracteres. A interface aceita até 256; o serviço também impõe o limite de 1.024 bytes UTF-8.
4. Clique em **Salvar backup protegido** e escolha um destino fora da pasta interna de dados do aplicativo.
5. Aguarde a confirmação e guarde a senha em um local seguro, separado do arquivo.

A senha não é gravada no arquivo nem na configuração do Workfoli. Não há recuperação de senha. Durante a operação, a interface apresenta **Processando…** e bloqueia os controles do diálogo; o processo principal impede novas mutações relacionadas aos dados. O arquivo final só é apresentado após a operação terminar.

O formato atual é `workfoli-backup`, versão **1**. Usa **AES-256-GCM**, chave de 256 bits derivada com **scrypt**, salt aleatório de 16 bytes e nonce aleatório de 12 bytes. O cabeçalho também participa da autenticação. A recuperação verifica a autenticação antes de interpretar ou extrair o ZIP interno. Senha errada ou alteração do conteúdo cifrado impede a publicação de um ambiente recuperado.

## O que é preservado

- IDs, empresa principal, identificação local, relacionamento empresa/cliente e histórico do ambiente.
- Workspaces confirmados, inventário, categorias, projetos, conhecimento, decisões de revisão e atividades armazenadas.
- `manifest.json` de cada workspace, arquivos preservados em `source/entries/` e `source/original.zip`, quando existente.
- Fontes restritas, excluídas da busca ou não exibidas pela interface, desde que seus bytes tenham sido preservados na importação.

Entradas bloqueadas durante a importação conservam seus metadados; não se inventam bytes que nunca foram preservados. Symlinks importados não são recriados como links ativos.

O backup **não inclui `staging`**, importações ainda não confirmadas, cópias de backups antigos, diretórios externos apontados pelos projetos, dependências da aplicação ou arquivos soltos fora da estrutura reconhecida. Cópias auxiliares de bancos geradas antes de reanálises não são incluídas recursivamente; o estado atual e as atividades registradas são preservados.

O conteúdo operacional é serializado em snapshots JSON. A recuperação cria bancos SQLite novos com o schema conhecido pelo aplicativo: **não recebe nem abre bancos SQLite arbitrários do pacote**. Isso é recuperação lógica do estado suportado, não cópia física byte a byte de todo o diretório da instalação.

## Recuperar e abrir outro ambiente

1. Em **Backup e recuperação**, selecione **Recuperar ambiente**.
2. Informe a senha original e clique em **Restaurar e abrir em nova pasta**.
3. Escolha o arquivo `.workfoli-backup` e uma **pasta vazia, fora do ambiente atual**.
4. Aguarde as verificações. O destino publicado será a subpasta `Workfoli-restaurado` dentro da pasta escolhida.

O Workfoli valida versão, estrutura, IDs, caminhos permitidos, tamanhos, hashes SHA-256 e referências das fontes. Arquivos ausentes, caminhos indevidos, entradas repetidas, links ou conteúdo incompatível impedem a recuperação. A fonte do backup permanece intacta.

Após sucesso, o aplicativo abre o ambiente recuperado e registra sua localização para as próximas aberturas. O ambiente anterior permanece no disco; não há mesclagem, sobrescrita de clientes ou substituição de arquivos nele. A identidade e os vínculos do backup pertencem à nova cópia recuperada. Não existe, neste fluxo, um seletor geral de múltiplas instalações nem sincronização entre as duas cópias.

Em execução de desenvolvimento, `WORKFOLI_DATA_DIR` continua tendo precedência na escolha da raiz na inicialização. Essa configuração pode fazer uma abertura posterior voltar à raiz definida pela variável, mesmo após a recuperação.

## Limites e cuidados operacionais

| Limite atual | Valor |
|---|---:|
| Workspaces por backup | 1.000 |
| Arquivos relacionados pelo manifesto | 100.000 |
| Bytes de conteúdo inventariado | 10 GiB |
| Arquivo cifrado aceito na recuperação | 10 GiB |
| Metadados JSON por arquivo | 64 MiB |
| Razão de descompressão na recuperação, para entradas acima de 1 MiB | até 1.000× |

Os limites de conteúdo, arquivo cifrado e metadados são verificados separadamente; os 10 GiB não representam uma promessa de capacidade útil exata. O ZIP inclui metadados e overhead próprios. Versões incompatíveis são recusadas; não há migração automática de formatos futuros.

A busca é reconstruída a partir das fontes permitidas, com nova verificação de material restrito. Essa etapa lê até 1 MiB por arquivo e até 32 MiB de texto por workspace. Os arquivos preservados continuam disponíveis mesmo quando não entram no índice reconstruído. Conteúdo identificado como restrito não vira texto de busca só porque existia em um backup.

A operação usa uma área temporária local e pode exigir espaço para o conteúdo decifrado e para o ambiente reconstruído. O código remove os temporários ao terminar normalmente ou ao tratar uma falha; isso não equivale a apagamento seguro do disco nem cobre desligamento abrupto. A senha protege o arquivo de backup, **não cifra automaticamente a instalação recuperada ou os temporários**. A proteção dessas pastas depende também do sistema operacional e do disco.

Ainda não há agendamento, upload automático, retenção de cópias, cancelamento durante processamento ou garantia de recuperação de versões futuras. Guarde cópias fora da máquina principal e valide a recuperação com a senha disponível; possuir um arquivo salvo não substitui esse ensaio.

Implementação: [serviço de backup](../packages/adapters/backup.ts), [integração desktop](../apps/desktop/main/index.ts) e [diálogo](../apps/desktop/renderer/BackupDialog.tsx). Os [testes sintéticos](../tests/backup.test.ts) exercitam recuperação, conteúdo privado, decisões, senha incorreta, adulteração, destino ocupado, links e pacotes incompatíveis.
