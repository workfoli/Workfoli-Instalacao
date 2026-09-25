/**
 * Catálogo técnico das integrações (sem dados de nenhuma empresa). Cada instância conecta as PRÓPRIAS
 * contas: tokens ficam no cofre da instância e nunca são compartilhados entre empresas.
 *
 * Endereços são constantes do Core. Só testes podem substituí-los (programaticamente), nunca a Base,
 * a configuração ou o navegador.
 */

export type ConnectionProvider = 'google' | 'meta' | 'github' | 'vercel' | 'cloudflare' | 'supabase';
export const CONNECTION_PROVIDERS: readonly ConnectionProvider[] = ['google', 'meta', 'github', 'vercel', 'cloudflare', 'supabase'];

export const DEFAULT_ENDPOINTS = Object.freeze({
  'google.authorize': 'https://accounts.google.com/o/oauth2/v2/auth',
  'google.token': 'https://oauth2.googleapis.com/token',
  'google.revoke': 'https://oauth2.googleapis.com/revoke',
  'google.userinfo': 'https://openidconnect.googleapis.com/v1/userinfo',
  'google.ads': 'https://googleads.googleapis.com',
  'google.analyticsData': 'https://analyticsdata.googleapis.com',
  'google.analyticsAdmin': 'https://analyticsadmin.googleapis.com',
  'google.searchConsole': 'https://www.googleapis.com/webmasters/v3',
  'meta.dialog': 'https://www.facebook.com',
  'meta.graph': 'https://graph.facebook.com',
  'github.authorize': 'https://github.com/login/oauth/authorize',
  'github.token': 'https://github.com/login/oauth/access_token',
  'github.api': 'https://api.github.com',
  'vercel.api': 'https://api.vercel.com',
  'cloudflare.api': 'https://api.cloudflare.com/client/v4',
  'supabase.api': 'https://api.supabase.com',
});
export type EndpointKey = keyof typeof DEFAULT_ENDPOINTS;

/** Versões das APIs. Ficam aqui (Core) para serem atualizadas junto com os adaptadores. */
export const API_VERSIONS = Object.freeze({ googleAds: 'v21', metaGraph: 'v23.0' });

export interface Capability {
  id: string; label: string; description: string; scopes: string[];
  /** Pedida por padrão ao conectar (o administrador pode desmarcar). */
  default: boolean;
  /** Credencial extra do app necessária para esta capacidade (ex.: developer token do Google Ads). */
  requires?: string[];
}

interface ProviderBase {
  id: ConnectionProvider; label: string; category: string; description: string;
}
export interface OAuthProvider extends ProviderBase {
  kind: 'oauth';
  /** Nomes (nunca valores) das credenciais do app OAuth desta instalação, no cofre de segredos da instância. */
  appSecrets: { clientId: string; clientSecret: string; clientSecretRequired: boolean };
  pkce: boolean;
  scopeSeparator: ' ' | ',';
  identityScopes: string[];
  capabilities: Capability[];
  authorizeParams?: Record<string, string>;
}
export interface TokenProvider extends ProviderBase {
  kind: 'token';
  tokenLabel: string; tokenHelp: string;
}
export type ProviderDefinition = OAuthProvider | TokenProvider;

export const PROVIDERS: Readonly<Record<ConnectionProvider, ProviderDefinition>> = Object.freeze({
  google: {
    id: 'google', kind: 'oauth', label: 'Google', category: 'Mídia, dados e SEO',
    description: 'Google Ads, Google Analytics 4 e Search Console da própria empresa, somente leitura de relatórios.',
    appSecrets: { clientId: 'GOOGLE_OAUTH_CLIENT_ID', clientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET', clientSecretRequired: false },
    pkce: true, scopeSeparator: ' ', identityScopes: ['openid', 'email'],
    authorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    capabilities: [
      { id: 'ads', label: 'Google Ads', description: 'Campanhas, investimento, cliques e conversões (relatórios).', scopes: ['https://www.googleapis.com/auth/adwords'], default: true, requires: ['GOOGLE_ADS_DEVELOPER_TOKEN'] },
      { id: 'analytics', label: 'Google Analytics 4', description: 'Sessões, usuários e eventos-chave (leitura).', scopes: ['https://www.googleapis.com/auth/analytics.readonly'], default: true },
      { id: 'search-console', label: 'Search Console', description: 'Cliques, impressões e posição na busca orgânica (leitura).', scopes: ['https://www.googleapis.com/auth/webmasters.readonly'], default: true },
    ],
  },
  meta: {
    id: 'meta', kind: 'oauth', label: 'Meta', category: 'Mídia e leads',
    description: 'Meta Ads (relatórios) e formulários de lead do Facebook/Instagram entrando no CRM.',
    appSecrets: { clientId: 'META_APP_ID', clientSecret: 'META_APP_SECRET', clientSecretRequired: true },
    pkce: false, scopeSeparator: ',', identityScopes: ['public_profile'],
    capabilities: [
      { id: 'ads', label: 'Meta Ads', description: 'Campanhas, investimento, alcance e leads reportados (leitura).', scopes: ['ads_read'], default: true },
      { id: 'leads', label: 'Formulários de lead', description: 'Leads dos formulários das páginas autorizadas entram no CRM.', scopes: ['leads_retrieval', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata'], default: true },
    ],
  },
  github: {
    id: 'github', kind: 'oauth', label: 'GitHub', category: 'Código',
    description: 'Repositórios da empresa ligados aos projetos.',
    appSecrets: { clientId: 'GITHUB_OAUTH_CLIENT_ID', clientSecret: 'GITHUB_OAUTH_CLIENT_SECRET', clientSecretRequired: true },
    pkce: true, scopeSeparator: ' ', identityScopes: ['read:user'],
    capabilities: [
      { id: 'repos', label: 'Repositórios privados', description: 'Acesso aos repositórios privados (o GitHub não oferece escopo só de leitura).', scopes: ['repo'], default: false },
    ],
  },
  vercel: {
    id: 'vercel', kind: 'token', label: 'Vercel', category: 'Hospedagem',
    description: 'Projetos e deploys (consulta). Publicar continua exigindo confirmação.',
    tokenLabel: 'Token de acesso da Vercel', tokenHelp: 'Vercel → Account Settings → Tokens. Prefira escopo limitado ao time da empresa.',
  },
  cloudflare: {
    id: 'cloudflare', kind: 'token', label: 'Cloudflare', category: 'DNS e rede',
    description: 'Zonas e DNS (consulta). Alterar DNS continua exigindo confirmação.',
    tokenLabel: 'Token de API da Cloudflare', tokenHelp: 'Cloudflare → My Profile → API Tokens. Use permissão de leitura por zona.',
  },
  supabase: {
    id: 'supabase', kind: 'token', label: 'Supabase', category: 'Banco e autenticação',
    description: 'Projetos da empresa (consulta pela API de gestão).',
    tokenLabel: 'Token de acesso pessoal do Supabase', tokenHelp: 'Supabase → Account → Access Tokens. A chave service_role nunca vai para o navegador.',
  },
});

/** Rótulos legíveis de escopos, para mostrar o que foi autorizado sem jargão. */
export const SCOPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  openid: 'Identificação', email: 'E-mail da conta', public_profile: 'Perfil público', 'read:user': 'Perfil',
  'https://www.googleapis.com/auth/adwords': 'Google Ads', 'https://www.googleapis.com/auth/analytics.readonly': 'Analytics (leitura)',
  'https://www.googleapis.com/auth/webmasters.readonly': 'Search Console (leitura)', 'https://www.googleapis.com/auth/userinfo.email': 'E-mail da conta',
  ads_read: 'Relatórios de anúncios', leads_retrieval: 'Leads dos formulários', pages_show_list: 'Lista de páginas',
  pages_read_engagement: 'Leitura das páginas', pages_manage_metadata: 'Configuração de webhooks das páginas', repo: 'Repositórios privados',
});

/** Adaptadores de dados de marketing (normalizados). A chave é a usada nas tabelas `mkt_*`. */
export const MARKETING_SOURCES = Object.freeze({
  'google-ads': { label: 'Google Ads', connection: 'google' as const, capability: 'ads' },
  'meta-ads': { label: 'Meta Ads', connection: 'meta' as const, capability: 'ads' },
  'google-analytics': { label: 'Google Analytics 4', connection: 'google' as const, capability: 'analytics' },
  'search-console': { label: 'Search Console', connection: 'google' as const, capability: 'search-console' },
});
export type MarketingSource = keyof typeof MARKETING_SOURCES;

export function isProvider(value: unknown): value is ConnectionProvider {
  return typeof value === 'string' && (CONNECTION_PROVIDERS as readonly string[]).includes(value);
}
