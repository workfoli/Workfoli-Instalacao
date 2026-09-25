export interface ModuleInfo { id: string; label: string; icon: string; description: string; admin?: boolean; }
export interface BaseStatus { mode: 'local' | 'remote'; available: boolean; revision: string | null; updatedAt: string | null; message: string | null; truncated: boolean; }
export interface Session {
  csrf: string;
  user: { id: string; name: string; roleId: string; permissions: string[] };
  company: { name: string; tagline: string | null; slug: string };
  mode: 'local' | 'remote'; theme: 'dark' | 'light' | 'system'; version: string;
  modules: { active: ModuleInfo[]; planned: ModuleInfo[]; custom: ModuleInfo[] };
  base: BaseStatus;
}
export interface Brand { company: { name: string; tagline: string | null }; symbol: string | null; theme: 'dark' | 'light' | 'system'; }

export interface Task {
  id: string; title: string; notes: string | null; status: 'open' | 'doing' | 'done'; dueDate: string | null;
  assignee: { id: string; name: string } | null; projectId: string | null; createdAt: string; updatedAt: string; source: string;
  related: { type: 'contact' | 'organization' | 'lead' | 'opportunity'; id: string; label: string | null } | null;
}
export interface Person { id: string; name: string; }

export interface Service { id: string; name: string; summary?: string | null; status: string; visibility: string; transversal?: boolean; path?: string | null; }
export interface CompanyView {
  company: { name: string; slug: string; tagline?: string | null; description?: string | null; segment?: string | null; website?: string | null; legalName?: string | null };
  profile: string;
  identity: {
    colors: Record<string, string>; typography: { heading?: string; body?: string };
    voice: { tagline?: string | null; message?: string | null; concept?: string | null; description?: string | null; method?: string[] };
    guide: string | null; logo: string | null; symbol: string | null;
  };
  services: Service[];
  resources: Array<{ id: string; kind: string; label: string; url?: string | null; path: string | null; visibility: string }>;
  assets: Array<{ id: string; kind: string; path: string; label?: string | null; url: string | null }>;
}

export interface DocumentInfo { path: string; title: string; folder: string; excerpt: string; size: number; modifiedAt: string | null; }
export interface ProjectView {
  id: string; name: string; type: string; typeLabel: string; status: string; path?: string | null; summary?: string | null;
  services: Array<{ id: string; name: string }>; links?: Array<{ label: string; url: string }>; tasks: { open: number; done: number }; createdAt?: string | null;
}
export interface ProjectsResponse { projects: ProjectView[]; pending: Array<{ commandId: string; name: string; createdAt: string }>; types: Array<{ id: string; label: string }>; services: Array<{ id: string; name: string }>; }
export type BaseChangeOutcome = { status: 'applied'; result: { files: string[]; summary: string; projectId?: string } } | { status: 'queued'; commandId: string; summary: string };

export interface FileNode { path: string; name: string; size: number; kind: 'document' | 'text' | 'image' | 'other'; restricted: boolean; modifiedAt: string | null; viewable: boolean; }
export interface PrivateFile { id: string; name: string; mime: string; size: number; visibility: string; note: string | null; createdAt: string; createdBy: string | null; }


export interface Proposal { id: string; type: string; label: string; fields: Array<{ label: string; value: string }>; status: string; hash: string; expiresAt: string; result: { message: string; link?: string } | null; }
export interface Message { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; proposals: Proposal[]; }

export interface AuditEntry { id: number; at: string; actorType: string; actorId: string | null; actorName: string | null; action: string; target: string | null; detail: Record<string, unknown> | null; result: 'ok' | 'denied' | 'error'; }
export interface UserView { id: string; name: string; email: string | null; roleId: string; roleName: string; status: 'pending' | 'active' | 'disabled'; createdAt: string; lastLoginAt: string | null; }
export interface RoleView { id: string; name: string; description: string; permissions: string[]; source: 'core' | 'base' | 'custom'; users: number; }

export interface CustomField { id: string; label: string; type: string; required: boolean; options?: string[]; }
export interface CustomModule { id: string; label: string; description: string; icon: string; entityLabel: string; fields: CustomField[]; listFields: string[]; }

export interface Overview {
  user: { name: string };
  company: { name: string; tagline: string | null; description: string | null; segment: string | null; services: Array<{ id: string; name: string; status: string; transversal: boolean }>; method: string[]; message: string | null; concept: string | null } | null;
  base: BaseStatus;
  counts: { tasksOpen: number | null; tasksDoing: number | null; projectsActive: number | null; projectsPlanned: number | null; documents: number | null; opportunitiesOpen: number | null; leadsNew: number | null };
  myTasks: Task[] | null;
  baseTasks: Array<{ title: string; items: Array<{ text: string; done: boolean }> }> | null;
  projects: Array<{ id: string; name: string; typeLabel: string; status: string }> | null;
  crm: { label: string; pipeline: string; currency: string; newLeads: number; openCount: number; openValueCents: number; stages: Array<{ stage: string; count: number }> } | null;
  activity: AuditEntry[] | null;
}
