import type { ReactNode } from 'react';
import { AlertCircle, FileText, Folder, Image, Code2, Shield, LoaderCircle } from 'lucide-react';
import type { Category, Disposition, FileEntry, KnowledgeItem } from '../../../packages/contracts';
import { CATEGORY_LABELS } from '../../../packages/contracts';

export { CATEGORY_LABELS };
export const dispositionLabels: Record<Disposition, string> = {
  indexed: 'Texto disponível', metadata: 'Somente inventário', restricted: 'Restrito', blocked: 'Bloqueado', excluded: 'Fora da busca',
};
export const statusLabels: Record<KnowledgeItem['status'], string> = { pending: 'A revisar', confirmed: 'Confirmado', rejected: 'Descartado' };
export function bytes(value: number): string {
  if (value < 1024) return `${value.toLocaleString('pt-BR')} B`;
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
  return `${(value / 1024 ** exponent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${['B', 'KB', 'MB', 'GB'][exponent]}`;
}
export function count(value: number): string { return value.toLocaleString('pt-BR'); }
export function date(value: string): string { return new Date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }
export function errorText(error: unknown): string { return error instanceof Error ? error.message : 'Não foi possível concluir esta ação. Tente novamente.'; }
export function initials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    'identity.name': 'Nome do cliente', 'business.specialty': 'Especialidade', 'business.location': 'Localização',
    'business.audience': 'Público-alvo', 'communication.tone': 'Tom de voz', 'strategy.objective': 'Objetivo',
    'business.mission': 'Propósito', 'business.positioning': 'Posicionamento', 'business.website': 'Site',
    'brand.primaryColor': 'Cor principal', 'brand.secondaryColor': 'Cor secundária', 'brand.name': 'Nome da marca',
    'client.name': 'Nome do cliente', 'company.name': 'Nome da empresa', 'company.description': 'Sobre a empresa',
    'brand.font': 'Tipografia', 'brand.typography': 'Tipografia', 'contact.email': 'E-mail', 'contact.phone': 'Telefone',
    'brand.tone': 'Tom de voz', 'company.website': 'Site', 'business.name': 'Nome do negócio',
    'business.description': 'Sobre o negócio', 'brand.palette': 'Paleta de cores',
    'brand.backgroundColor': 'Cor de fundo', 'brand.textColor': 'Cor do texto', 'brand.accentColor': 'Cor de destaque',
  };
  return labels[field] ?? field.replace(/[_.]/g, ' ').replace(/^./, x => x.toUpperCase());
}
export function FileIcon({ file, size = 18 }: { file: Pick<FileEntry, 'extension' | 'kind'>; size?: number }) {
  if (file.kind === 'symlink') return <Folder size={size} />;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(file.extension)) return <Image size={size} />;
  if (['js', 'ts', 'tsx', 'html', 'css', '.js', '.ts', '.tsx', '.html', '.css'].includes(file.extension)) return <Code2 size={size} />;
  return <FileText size={size} />;
}
export function CategoryTag({ category }: { category: Category }) { return <span className={`tag category-${category}`}>{CATEGORY_LABELS[category]}</span>; }
export function StatusTag({ status }: { status: KnowledgeItem['status'] }) { return <span className={`tag status-${status}`}>{statusLabels[status]}</span>; }
export function ErrorNotice({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return <div className="notice error-notice" role="alert"><AlertCircle size={18} /><span>{children}</span>{retry && <button className="text-button" onClick={retry}>Tentar novamente</button>}</div>;
}
export function Loading({ text = 'Carregando…' }: { text?: string }) { return <div className="loading-state" role="status"><LoaderCircle className="spin" size={24} /><span>{text}</span></div>; }
export function PrivacyNote() { return <span className="privacy-note"><Shield size={13} /> Armazenado neste computador</span>; }
export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="small-empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{children}</p></div>;
}
