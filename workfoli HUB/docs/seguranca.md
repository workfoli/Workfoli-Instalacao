# Segurança e limites

Dois componentes com fronteiras diferentes: o **Hub** (instalação por empresa, com usuários) e o
**importador desktop** (ferramenta local do operador). Nenhum dos dois certifica conformidade (LGPD,
saúde): são controles técnicos que precisam de validação jurídica antes de dados clínicos reais.

## Hub e instâncias

### Isolamento

- Uma instância por empresa: banco, arquivos privados, segredos, usuários e sessões próprios. Não existe banco global.
- `data/`, `files/` e `secrets/` nunca ficam dentro da Base; o instalador recusa layouts que misturem camadas.
- Instâncias não podem ser criadas dentro dos templates; `doctor --templates` verifica que o repositório do Hub
  não versiona dados de instância e, com `--denylist`, que nenhum termo privado (ex.: nomes de clientes) aparece.
- O Local Agent confere o `instanceId` do Hub antes de guardar a credencial; o Hub recusa snapshot de outra Base.

### Autenticação e sessão

- Senhas com scrypt (N=2^15, r=8, p=1, sal aleatório); comparação em tempo constante; custo pago mesmo para e-mail inexistente.
- Contas nascem pendentes com link de ativação de uso único (24 h proprietário, 72 h convites); só o hash do token é guardado; o token viaja no fragmento da URL (não chega a logs do servidor). `hub start --open` só emite link do proprietário em modo local e sem conta ativa, abre direto no navegador e não o imprime (quem roda o comando já tem acesso aos arquivos da instância, o mesmo que `hub owner` exige).
- Sessão em cookie `wf_session_<id curto da instalação>` (nome próprio por instalação: navegadores não separam cookies por porta, então dois Hubs na mesma máquina não derrubam a sessão um do outro) `HttpOnly`, `SameSite=Strict` (`Secure` quando `publicUrl` é HTTPS), expiração absoluta (12 h padrão) e por inatividade (120 min padrão); troca de senha, de papel ou desativação encerra sessões.
- Limite de tentativas de login por conta+origem (8 falhas → 10 min), inclusive para a senha correta durante o bloqueio.

### Requisições

- Checagem de `Host` contra a lista da instalação (proteção contra DNS rebinding em `127.0.0.1`).
- Mutações exigem cabeçalho `X-Workfoli-CSRF` igual ao token da sessão e `Origin` da própria instalação.
- Corpos JSON limitados a 1 MiB (upload privado 25 MiB; snapshot do Agent 40 MiB); tipo de conteúdo conferido.
- CSP `default-src 'self'`, `frame-ancestors 'none'`, `nosniff`, `no-referrer`, COOP/CORP; imagens da Base servidas com `sandbox`.
- Erros internos respondem mensagem genérica; detalhes só no log local do servidor.

### Autorização

- Permissões verificadas no servidor em toda rota (`escopo:ação`); negar é o padrão; negações vão para a auditoria.
- Proprietário sempre existe; só proprietário concede/retira propriedade; papéis sugeridos pela Base não concedem administração e dependem de aprovação.
- O acesso da Workfoli a uma empresa é o papel **Gestor Workfoli**: só o proprietário concede, retira ou gera link de ativação para ele; não administra usuários nem vê arquivos restritos.
- Itens `restricted` e arquivos privados restritos exigem `restricted:read`. Projetos, serviços, assets e recursos `restricted` ficam fora de **todas** as rotas para quem não tem essa permissão: conhecimento, arquivos da Base, imagens e anexos do CRM (o anexo aparece só como "sem acesso", sem o caminho).
- A tabela de rotas é testada (`tests/security.test.ts`): superfície pública e de dispositivo fixa, 401 sem sessão, CSRF e origem em toda mutação, e a matriz de papéis do Core contra cada rota.

### Base e conteúdo

- O Hub lê só as raízes declaradas; ignora `.git`, dependências, builds, pastas ocultas e pastas privadas; nunca segue links.
- Arquivos com nome reservado (`.env`, chaves, "confidencial", "pacientes"…) ou com credenciais/registros pessoais no texto ficam **restritos**: sem conteúdo, fora da IA.
- Markdown é renderizado como elementos React (sem HTML bruto); SVG com script é bloqueado.
- Alterações na Base são tipadas (projeto, nota, configuração do CRM), recusam credenciais e dados pessoais, conferem a revisão esperada, não sobrescrevem arquivos e ficam no journal e na auditoria.

### CRM

- Registros vivem só no banco da instância; o manifesto guarda só a estrutura (validada pelo contrato).
- Texto que parece credencial é recusado em todo campo; histórico de edição registra os **nomes** dos campos alterados, não os valores.
- Exclusão definitiva (LGPD) exige `crm:admin` e confirmação digitada; apaga histórico, etiquetas e anexos do registro; a auditoria guarda só tipo e id interno.
- Anexos: links com usuário/senha ou parâmetros de token são recusados; arquivos privados exigem `files:private` (e `restricted:read` quando restritos); pastas privadas da Base nunca são ligadas.

### Segredos

- Valores só em `secrets/secrets.env` da instância (permissão 0600 onde o sistema suporta; no Windows, protegido pelo perfil do usuário).
- A API expõe apenas nomes e "configurado sim/não"; a CLI lê valores pela entrada padrão e nunca os imprime.
- O validador do contrato rejeita credenciais em qualquer campo do manifesto; a verificação da Base bloqueia credenciais em arquivos versionáveis.

### Integrações

- OAuth no navegador do sistema: o Hub nunca vê senha de Google, Meta ou GitHub; nenhum navegador embutido.
- `state` de 256 bits, uso único, 10 minutos, amarrado a quem iniciou (que precisa seguir ativo e com `integrations:admin`); PKCE S256 onde o provedor aceita; troca do código sempre no servidor; segredo do app nunca vai ao navegador.
- Tokens cifrados com AES-256-GCM e dado autenticado por registro; chave mestra protegida pelo DPAPI da conta do Windows ou por `WORKFOLI_VAULT_KEY` do cofre do servidor. Tokens nunca aparecem em API, auditoria, logs, Base ou Git; tokens de página da Meta são pedidos na hora e descartados.
- Chamadas aos provedores: endereços fixos no Core, sem seguir redirecionamentos (o cabeçalho de autorização não vai a outro host), paginação só no mesmo host, tempo-limite e mensagens de erro saneadas.
- Uma conexão viva por provedor e por instância; nada é compartilhado entre empresas. Desconectar revoga no provedor quando possível e apaga os tokens.
- Retorno do OAuth é rota pública com limite de tentativas; a página devolvida não tem script e tem CSP própria.

### IA

- Contexto montado por permissão; provedor padrão local, sem rede; provedores externos exigem autorização explícita na configuração.
- Ações só por proposta tipada, confirmada pelo hash exibido, executada uma única vez, com revalidação de permissões e auditoria. Sem ações destrutivas, de envio, publicação ou pagamento.
- Conteúdo da Base é tratado como dado, nunca como instrução.

### Limites conhecidos

- Sem TLS próprio: fora de `127.0.0.1`, use proxy HTTPS. `host: 0.0.0.0` expõe o Hub à rede local.
- Banco, arquivos privados e segredos não são cifrados em repouso pela aplicação (exceto os tokens de integração, cifrados no cofre): use disco cifrado (BitLocker) e contas do sistema separadas quando necessário.
- Qualquer processo do mesmo usuário do Windows lê os arquivos da instância.
- Auditoria é uma tabela local: não é inviolável contra quem administra a máquina.
- Não validado para prontuários ou dados de saúde; módulos clínicos seguem planejados.

## Importador desktop

### Controles implementados

- ZIP integral copiado antes da análise; SHA-256 por conteúdo, CRC por entrada materializada e conferência de tamanho real.
- Caminhos absolutos, traversal, nomes reservados Windows, streams alternativos, colisões de caixa/Unicode e entradas especiais bloqueados.
- Symlinks e junctions não são seguidos. ZIPs aninhados não são extraídos automaticamente. ZIPs criptografados permanecem no original e têm entradas bloqueadas.
- Bytes materializados usam UUIDs internos, nunca caminhos fornecidos pelo ZIP.
- Captura de pasta verifica identidade, tamanho e datas antes/depois. Origem em alteração causa falha. Caminhos físicos redirecionados são recusados.
- Nenhum install, build, hook, skill, agente, shell ou Git do conteúdo importado é executado.
- HTML/SVG textual não é inserido como markup; React escapa o conteúdo. PDFs e documentos Office não são abertos por programas externos automaticamente.
- Renderer em sandbox, sem Node; contextIsolation ativo; origem dos IPCs validada; navegação e janelas externas bloqueadas; rede do renderer negada fora dos recursos do app (servidor local em desenvolvimento).
- Preview e consultas validam pertencimento ao workspace; IDs e revisões são validados; banco é aberto pelo serviço, não pela UI.
- Caminhos sensíveis e heurísticas de texto ficam fora de previews, busca e conhecimento; seus bytes continuam preservados. Dependências, Git, builds e instruções legadas ficam fora da busca.
- Logs e avisos não contêm valores de segredos. A análise nunca envia conteúdo para IA ou serviços externos.
- Prévia na revisão inicial usa as mesmas verificações de pertencimento, integridade e restrição do workspace definitivo. Trechos destacados continuam sendo texto escapado.
- Reanálise verifica as fontes preservadas, aplica limites de texto, exige proposta atual para o mesmo workspace e cria backup consistente antes da transação. Não amplia acesso a arquivos restritos nem executa instruções importadas.

### Limites padrão

| Recurso | Limite |
|---|---:|
| ZIP de entrada | 2 GiB |
| Conteúdo expandido total | 10 GiB |
| Entradas | 100.000 |
| Arquivo individual | 1 GiB |
| Texto analisado por arquivo | 1 MiB |
| Textos analisados no total | 32 MiB |
| Duração | 30 minutos |
| Razão de expansão para entradas acima de 1 MiB | 1.000× |
| Conhecimento proposto | 150 afirmações |

Os limites reais são aplicados durante streaming. Parâmetros adicionais para testes são internos, não uma opção para desativar regras de segurança na UI. Uma falha global impede confirmação; falhas por entrada compatíveis com preservação são sinalizadas no inventário.

### Limitações importantes

- Worker de Node é separação de processamento, não uma sandbox contra uma vulnerabilidade no parser ZIP. O parser faz parte da base de código confiável; a extração de formatos complexos permanece fora desta entrega.
- O scanner não é antivírus e não prova ausência de segredos. Não inspeciona texto em imagens/PDF/Office nem expande objetos Git. Extensões desconhecidas ficam no inventário.
- Palavras de contexto reservado podem restringir documentos técnicos legítimos. Essa escolha conservadora não remove seus bytes e deve ser refinada com corpus sintético.
- Conteúdos protegidos por política do aplicativo não estão cifrados. Um programa com os mesmos privilégios do usuário pode ler arquivos locais. Não há isolamento entre contas do sistema, criptografia própria, proteção clínica certificada ou controle de acesso multiusuário.
- A captura de pasta preserva conteúdo regular e nomes no manifesto; não é imagem forense de NTFS, não preserva ACLs/streams alternativos e não segue links. Diretórios bloqueados são registrados como lacunas.
- Nomes ZIP UTF-8 e campo Unicode são reconhecidos. Na ausência de indicação de encoding, usa-se OEM850 com aviso. O ZIP preserva a representação original.
- Alterações de valores feitas na revisão são declarações humanas. Não constituem conteúdo originalmente extraído.
- Hash não é backup. A reanálise cria backup transacional do banco anterior, sem duplicar fontes. Para backup completo, feche o aplicativo e copie toda a pasta de dados. Restauração, exportação e retenção automática dos backups ainda não possuem UI.

### Validação

`npm test` usa arquivos sintéticos: preservação, caminhos malformados, links, limites, cancelamento, segredos, CRC, projetos, persistência, isolamento e recuperação do catálogo. `npm run test:desktop` valida o aplicativo real, IPC, revisão, previews e reabertura. Fontes reais de cliente são usadas somente em análises privadas, nunca como fixtures versionadas.
