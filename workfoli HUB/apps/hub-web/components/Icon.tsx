import {
  BookOpen, Briefcase, Building2, Calendar, ChartColumn, ClipboardList, CodeXml, Contact, FileText, Files, FolderKanban, Globe, Heart, HeartPulse,
  History, Images, Layers, LayoutDashboard, ListChecks, Megaphone, Package, PenLine, Plug, Settings, Sparkles, Star, Tag, Target, Truck, Users, Wallet, Workflow, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, 'building-2': Building2, 'book-open': BookOpen, 'folder-kanban': FolderKanban, files: Files,
  'list-checks': ListChecks, contact: Contact, plug: Plug, sparkles: Sparkles, history: History, users: Users, settings: Settings,
  calendar: Calendar, megaphone: Megaphone, globe: Globe, target: Target, 'pen-line': PenLine, 'chart-column': ChartColumn, workflow: Workflow,
  'heart-pulse': HeartPulse, images: Images, wallet: Wallet, 'code-2': CodeXml, layers: Layers, 'clipboard-list': ClipboardList, 'file-text': FileText,
  package: Package, star: Star, tag: Tag, truck: Truck, wrench: Wrench, briefcase: Briefcase, heart: Heart,
};

export function ModuleIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Component = ICONS[name] ?? Layers;
  return <Component size={size} strokeWidth={1.8} aria-hidden="true" />;
}
