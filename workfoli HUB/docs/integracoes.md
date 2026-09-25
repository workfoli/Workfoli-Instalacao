# Integrações

Core 0.4.0. Cada empresa conecta **as próprias contas**, na própria instância. Uma conexão nunca é
compartilhada entre empresas, e o acesso da equipe Workfoli a uma empresa só existe pelo papel
**Gestor Workfoli**, concedido (e retirável) pelo proprietário daquela instância.

## O que existe

| Provedor | Como conecta | O que o Hub faz |
|---|---|---|
| Google | OAuth 2.0 + PKCE, no navegador | Google Ads (campanhas, investimento, cliques, conversões), GA4 (sessões, eventos-chave), Search Console (cliques, impressões, posição) — somente leitura de relatórios |
| Meta | OAuth 2.0 (state + troca no servidor), no navegador | Meta Ads (campanhas, investimento, alcance, leads reportados) e formulários de lead das páginas escolhidas entrando no CRM |
| GitHub | OAuth 2.0 + PKCE | Identificação da conta; repositórios privados só se o recurso for marcado |
| Vercel, Cloudflare, Supabase | Token criado no painel do provedor, colado uma vez | Verificação da conta/token; consultas (publicar e alterar DNS continuam exigindo confirmação) |

O que a Base declara em `integrations[]` (planejamento) aparece junto do cartão do provedor; o que ainda não
tem conector (Gmail, Agenda, Drive, WhatsApp, Netlify) aparece em "Planejadas na Base".

## Fluxo OAuth

```text
Hub → [Conectar] → escolhe recursos (escopos mínimos) → navegador vai à página oficial do provedor
    → pessoa entra e autoriza lá → provedor devolve para /api/integrations/oauth/callback
    → Hub confere o state, troca o código (com o verificador PKCE) no servidor → tokens cifrados no cofre
    → página "Conexão concluída" volta sozinha para Integrações
```

- O Hub **nunca** pede nem vê a senha do Google, da Meta ou do GitHub; não existe navegador embutido.
- `state` aleatório (256 bits), de uso único, válido por 10 minutos e amarrado a quem iniciou; quem iniciou
  precisa continuar ativo e com `integrations:admin` na hora do retorno.
- PKCE S256 no Google e no GitHub. Na Meta, `state` + troca no servidor com o segredo do app e troca por
  token de longa duração (cerca de 60 dias; a Meta não emite refresh token — perto do fim, "Reconectar").
- O retorno é público (o navegador volta sem o cookie `SameSite=Strict`) e por isso é validado só pelo
  `state`; a página devolvida não tem script, tem CSP própria e volta ao Hub por meta-refresh.
- Escopos concedidos são guardados e exibidos em linguagem simples; recurso não autorizado aparece como tal.

## Tokens e cofre

- Cifrados com **AES-256-GCM**, com o registro dono como dado autenticado (uma cifra copiada para outra linha
  não abre). Nunca vão para a Base, o Git, Markdown, manifesto, auditoria, logs ou respostas da API.
- Chave mestra em `secrets/vault.key`: no Windows, protegida pelo **DPAPI** da conta do usuário (uma cópia da
  instância em outra máquina ou conta não decifra; é preciso reconectar). Em servidor, use
  `WORKFOLI_VAULT_KEY` (32 bytes em base64) vinda do cofre do provedor de hospedagem. Sem DPAPI nem variável,
  a chave fica em arquivo com permissão restrita e o `doctor` avisa.
- Renovação automática com refresh token (Google); autorização revogada ou vencida marca a conexão como
  "Autorização vencida" e pede reconexão — sem inventar dado no meio tempo.
- **Desconectar** revoga no provedor quando há API (Google: revoke; Meta: `DELETE /me/permissions`; GitHub:
  remoção do grant) e apaga os tokens. Dados já sincronizados e leads do CRM ficam (são da empresa).

## Ativar numa instalação (credenciais do app)

Sem as credenciais do app OAuth, o cartão mostra **"Aguardando credenciais do app"** e o botão "Como ativar".
Só a ativação real fica bloqueada; CRM, marketing (com dados do CRM), telas e testes funcionam.

Os valores vão para o cofre de segredos da instância, pela entrada padrão (nunca aparecem na tela):

```powershell
# na pasta do Workfoli Hub
Get-Content client-id.txt | .\workfoli.cmd secrets set ..\instances\<empresa> GOOGLE_OAUTH_CLIENT_ID
```

| Segredo | Para |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | App OAuth do Google (tipo "App para computador" no Hub local, ou "Aplicativo da Web" no Hub hospedado) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Leitura da API do Google Ads (token aprovado no Centro de API da conta gerenciadora) |
| `META_APP_ID`, `META_APP_SECRET` | App da Meta com Login do Facebook |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App do GitHub |

Endereço de retorno a cadastrar nos apps (o Hub mostra o exato em "Como ativar"):

- Hub local: `http://127.0.0.1:4870/api/integrations/oauth/callback` (porta de `workfoli.hub.json`).
- Hub hospedado: `https://<publicUrl>/api/integrations/oauth/callback`.

### Google Cloud (por instalação)

1. Projeto no Google Cloud → ativar **Google Ads API**, **Google Analytics Data API**, **Google Analytics
   Admin API** e **Google Search Console API**.
2. Tela de consentimento OAuth com os escopos `openid`, `email`, `…/auth/adwords`,
   `…/auth/analytics.readonly`, `…/auth/webmasters.readonly`. Escopos sensíveis exigem verificação do Google
   para uso fora do modo de teste.
3. Credencial OAuth com o endereço de retorno acima → `GOOGLE_OAUTH_CLIENT_ID`/`SECRET`.
4. Google Ads: developer token (`GOOGLE_ADS_DEVELOPER_TOKEN`). Se o acesso à conta vier por uma conta
   gerenciadora (MCC), informe o id dela em Integrações → Gerenciar.

### Meta for Developers

1. App do tipo empresa com **Login do Facebook**; endereço de retorno acima em "URIs de redirecionamento".
2. Permissões: `ads_read` (Meta Ads) e `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_metadata` (formulários de lead). Fora do modo de desenvolvimento exigem **Revisão do App** e
   verificação da empresa. [A CONFIRMAR na revisão: o conjunto exato pode variar com a versão da Graph API.]
3. `META_APP_ID`/`META_APP_SECRET`. A versão da Graph API usada fica em
   `packages/hub/integrations/catalog.ts` (`API_VERSIONS`) e é atualizada junto com o Core.

### GitHub

OAuth App com o endereço de retorno acima → `GITHUB_OAUTH_CLIENT_ID`/`SECRET`.

> Decisão de implantação: usar **um app por instalação** (cada empresa cria o seu) ou **um app da
> operadora** para todas as instalações que ela administra. O código aceita os dois (credenciais por instância).

## Depois de conectar

1. **Gerenciar**: escolher as contas que esta empresa acompanha (conta do Google Ads, propriedade do GA4, site
   do Search Console, conta de anúncios e páginas da Meta). Só aparecem contas que a conexão enxerga.
2. **Sincronizar** (manual) — e automaticamente a cada 6 horas enquanto o Hub estiver aberto. Cada rodada
   **substitui** o período (padrão: 30 dias), porque as plataformas corrigem números antigos: sincronizar de
   novo nunca duplica. O resultado mostra por fonte o que entrou, o que foi pulado (e por quê) e o que falhou.
3. **Leads da Meta no CRM**: só entram se a Base ligar a regra (CRM → Configuração → Integrações:
   `crm.integrations`), com a origem escolhida e, opcionalmente, abrindo oportunidade num funil. Cada lead
   entra uma única vez (par conexão + id do lead), com a atribuição da campanha, do anúncio e do formulário;
   se a oportunidade automática falhar, o lead fica e o motivo vai para o histórico. Os tokens de página são
   pedidos na hora e nunca guardados.

## Dados de marketing

Normalizados em `mkt_campaigns` e `mkt_metrics_daily` (fonte, escopo — conta, campanha, propriedade, site —,
dia, métrica, valor, unidade, moeda). Métricas guardam **só o que a plataforma informou**. O painel separa:

| Tipo | Exemplos | Marca na tela |
|---|---|---|
| Dado da plataforma | investimento, impressões, cliques, conversões, leads reportados pela Meta, sessões, cliques na busca | "Dado da plataforma" + hora da sincronização |
| Do CRM | leads por origem, valor ganho por origem | "Do CRM" |
| Calculado pela Workfoli | CTR, custo por clique, custo por resultado, custo por lead do CRM, retorno sobre investimento, posição média ponderada | "Calculado pela Workfoli" |

Sem dado, o painel mostra travessão ou mensagem — nunca zero inventado. Usuários do GA4 não são somados dia a
dia (não é somável). Retorno só é calculado quando investimento e CRM estão na mesma moeda.

## Testes

`tests/integrations.test.ts` usa provedores falsos (`tests/fake-providers.ts`) que validam o que os reais
validam: `client_id`, segredo, código de uso único, `redirect_uri`, PKCE, renovação, revogação, paginação
(sem seguir `next` para outro host) e o caminho completo até o CRM e o painel.
