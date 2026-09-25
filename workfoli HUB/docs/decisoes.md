# Decisões de arquitetura

Registro curto. Cada decisão tem motivo e consequência; revisar quando o contexto mudar.

| # | Decisão | Motivo | Consequência |
|---|---|---|---|
| 1 | Workfoli é serviço, não SaaS: **uma instalação por empresa** | Dados e contexto pertencem a cada empresa; nada de banco central | Custo/manutenção por instalação; atualizações em ondas |
| 2 | **Core dentro do repositório do Hub** (`packages/*`); a Base recebe só a cópia do validador | Um único lugar para código; Base continua um template de arquivos | `npm run sync:contract` e `doctor --templates` mantêm a cópia idêntica |
| 3 | Contrato **`workfoli.base.json`** (hoje v3) em JavaScript sem dependências + JSON Schema | Mesmo validador na Base (Node puro) e no Core; editores ganham autocompletar | Mudança de contrato = código + schema + testes + sincronização |
| 4 | Instância = `instances/<slug>/{base,hub,data,files,secrets}`, fora dos templates | Separar versionável × operacional × privado × segredo; templates nunca contaminados | O instalador recusa layouts que misturem camadas |
| 5 | **SQLite do próprio Node** (`node:sqlite`) para dados operacionais | Sem módulo nativo para compilar (Windows sem Python), transações reais, arquivo por instância | Hospedagem futura pode trocar o adaptador (ex.: Postgres por instância) |
| 6 | CLI/servidor/agent em TypeScript via **tsx** em runtime | Sem etapa de build no Node; instalação = `npm install` | Startup ~0,5 s; empacotamento dedicado quando houver deploy |
| 7 | Hub web **servido pelo próprio servidor** (Vite + React, Manrope local) | Funciona offline e sem CDN; mesma origem simplifica cookies e CSP | `npm run build:hub` antes de usar |
| 8 | Sessão por cookie `HttpOnly` + CSRF + checagem de `Host`/`Origin` | Navegador comum, inclusive celular, sem tokens em `localStorage` | Hospedagem precisa de HTTPS (`publicUrl`) |
| 9 | Permissões `escopo:ação` checadas no servidor; papéis da Base são **sugestões** | Arquivo editável não pode conceder acesso | Proprietário aprova papéis vindos da Base |
| 10 | **Local Agent** com conexão de saída, pareamento de uso único e fila com revisão esperada | Hub hospedado não enxerga disco local; nenhuma porta aberta na máquina da Base | Alterações remotas aparecem como "aguardando o computador da Base" |
| 11 | IA com **provedor local determinístico** por padrão; externos só com `externalContext: true` | Nada de contexto sai da instância sem decisão explícita | Qualidade de linguagem limitada até plugar um provedor autorizado |
| 12 | Ações da IA = lista fechada de ações tipadas, confirmadas por hash, execução única | Texto livre nunca altera dados críticos silenciosamente | Novas capacidades entram como novas ações tipadas |
| 13 | Módulos customizados **declarativos** (sem código) | Customização sem fork e sem executar JavaScript da instância | Lógica específica exige módulo do Core |
| 14 | Atualização do template da Base por **merge em três vias** com lock de hashes | Atualizar sem apagar customizações | Conflitos ficam em `.workfoli/upgrade/` para revisão |
| 15 | Toda empresa, inclusive a operadora, é uma **instância** em `instances/<empresa>`, fora dos templates | O mesmo fluxo para todos | Nada de uma instância volta para os templates; conferido por `doctor --templates --denylist` |
| 16 | Importador desktop mantido como ferramenta do operador | Código maduro e testado para analisar material legado com segurança | Integração importador → Base fica no roadmap |
| 17 | **CRM: estrutura na Base, registros no banco, Hub = interface** (seção `crm` do manifesto v3) | Funil e regras são contexto da empresa (versionado, revisável); pessoas e valores são dados operacionais | Configuração muda só por alteração tipada `crm.config`; sem sincronização em laço; oportunidade fora da configuração fica visível para mover |
| 18 | CRM **genérico**: contato ≠ paciente; vocabulário e campos por configuração | Um Core para qualquer negócio; dados de saúde exigem controles próprios | Módulos setoriais futuros relacionam contato → paciente/aluno sem mudar o CRM |
| 19 | Etapas com **regras** (campos exigidos) e perda com **motivo**, conferidas no servidor em transação única | Funil confiável para relatório; a interface não é a única proteção | O Hub pede o que falta antes de mover; nada muda se a regra recusar |
| 20 | **OAuth pelo navegador do sistema**, `state` de uso único + PKCE, troca no servidor; retorno validado só pelo `state` | Nunca capturar senha; cookie `SameSite=Strict` não volta no redirecionamento do provedor | Credenciais do app ficam no cofre da instância; ativação real depende delas |
| 21 | **Cofre de tokens** AES-256-GCM com chave protegida por DPAPI (Windows) ou `WORKFOLI_VAULT_KEY` | Tokens valem mais que a senha do Hub; cópia da pasta não pode reutilizá-los | Instância copiada para outra máquina reconecta as integrações |
| 22 | **Uma conexão por provedor e por instância**; acesso da Workfoli = papel Gestor Workfoli concedido pelo proprietário | Isolamento entre empresas e controle do dono | Nenhum token é compartilhado; o proprietário pode retirar o acesso a qualquer momento |
| 23 | Marketing separa **dado da plataforma × CRM × cálculo da Workfoli**; sem dado = vazio | Não inventar métricas; leitor sabe de onde vem cada número | Sincronizar substitui o período (plataformas corrigem números); sem somar o que não é somável |
| 24 | Gráficos de **série única** na cor da marca (verde; mistura verde+grafite no tema claro, ≥ 3:1) | A identidade só tem uma cor de dado; nada de cores inventadas | Várias medidas = vários gráficos (nunca eixo duplo); toda visualização tem tabela equivalente |
| 25 | **Papéis do Core sincronizados** na instalação, ao abrir o Hub e no `update` | Cada versão pode trazer papéis e permissões novos; sem isso instâncias atualizadas ficavam sem o Gestor Workfoli | Papel antigo da Base/personalizado com id agora reservado é preservado como `<id>-anterior`, com quem o usa; mudança auditada |
| 26 | **Cookie de sessão com nome por instalação** (`wf_session_<id curto>`) | Navegadores não separam cookies por porta: dois Hubs locais derrubavam a sessão um do outro | Sessões antigas (`wf_session`) deixam de valer após a atualização: basta entrar de novo |
| 27 | **E2E sobre clone descartável** da instância (`npm run test:e2e`) com provedores falsos | Validar o produto com a configuração real de cada empresa sem tocar nos dados nem em contas reais | Expectativas lidas do manifesto e da configuração do CRM da própria instância; o clone é apagado ao sair |
