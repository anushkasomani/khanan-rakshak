import {
  LayoutGrid,
  AlertTriangle,
  Flame,
  ClipboardCheck,
  ListChecks,
  MessageSquare,
  Radio,
  BarChart3,
  Building2,
  FileKey2,
  Trophy,
  Activity,
  BrainCircuit,
  Scale,
  MapPinned,
  Users,
  CalendarCheck,
  ChevronsUp,
  Layers,
  HardHat,
  FileText,
  LucideIcon,
} from 'lucide-react';
import { Role, User } from './types';
import { atLeast } from './roles';

export interface NavItem {
  to: string;
  label: string;
  hint?: string; // when to open it, shown under the label in the phone menu
  icon: LucideIcon;
  group?: 'Safety' | 'People' | 'Governance' | 'Admin';
  subgroup?: string;
  min?: Role; // lowest role that can open it; admins can open everything
  adminOnly?: boolean;
  requiresRole?: boolean; // hidden for admin accounts that have no hierarchy role
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Home', hint: 'Your shift today', icon: LayoutGrid, requiresRole: true },
  { to: '/attendance', label: 'Attendance', hint: 'Check in and out, and who is on site', icon: CalendarCheck },

  { to: '/shifts', label: 'Shift board', hint: "Every district's pre-shift report", icon: Layers, group: 'Safety', min: 'OVERMAN' },
  { to: '/safety-reports', label: 'Hazards', hint: 'Something unsafe that needs fixing', icon: AlertTriangle, group: 'Safety' },
  { to: '/field-reports', label: 'Field reports', hint: 'Blast reports, surveys and other technical reports', icon: FileText, group: 'Safety', min: 'SPECIALIST' },
  { to: '/incidents', label: 'Incidents', hint: 'Something that already happened', icon: Flame, group: 'Safety', min: 'SIRDAR' },
  { to: '/inspections', label: 'Inspections', hint: 'Checks assigned to you, or waiting for approval', icon: ClipboardCheck, group: 'Safety' },
  { to: '/corrective-actions', label: 'Corrective actions', hint: 'Follow-up work with a deadline', icon: ListChecks, group: 'Safety', min: 'SIRDAR' },
  { to: '/sos-control', label: 'SOS control', hint: 'Live emergencies', icon: Radio, group: 'Safety', min: 'SIRDAR' },
  { to: '/escalations', label: 'Escalations', hint: 'Problems pushed up to you, or by you', icon: ChevronsUp, group: 'Safety', min: 'SIRDAR' },

  { to: '/grievances', label: 'Grievances', hint: 'Raise a complaint, anonymously if you want', icon: MessageSquare, group: 'People' },
  { to: '/contracts', label: 'Contracts', hint: 'Contractors working here, their workers and training', icon: HardHat, group: 'People', min: 'OVERMAN' },
  { to: '/recognition', label: 'Leaderboard', hint: 'Safety points', icon: Trophy, group: 'People', requiresRole: true },
  { to: '/future-health', label: 'Health monitoring', icon: Activity, group: 'People', min: 'OFFICER' },

  { to: '/compliance', label: 'Compliance', icon: BarChart3, group: 'Governance', min: 'OFFICER' },
  { to: '/corporate', label: 'Mine benchmark', icon: Building2, group: 'Governance', min: 'DGMS' },
  { to: '/audit-verification', label: 'Audit log', hint: 'Check that a record was not changed', icon: FileKey2, group: 'Governance', min: 'OFFICER' },

  { to: '/admin/mines', label: 'Mines', hint: 'Mines and their districts', icon: MapPinned, group: 'Admin', adminOnly: true },
  { to: '/admin/people', label: 'People', hint: 'Approve and edit accounts', icon: Users, group: 'Admin', adminOnly: true },
  { to: '/admin/governance', label: 'Governance intelligence', icon: BrainCircuit, group: 'Admin', subgroup: 'Governance', adminOnly: true },
  { to: '/admin/compliance', label: 'Statutory compliance', icon: Scale, group: 'Admin', subgroup: 'Governance', adminOnly: true },
];

export function canAccess(user: User | null | undefined, item: Pick<NavItem, 'min' | 'adminOnly' | 'requiresRole'>): boolean {
  if (!user) return false;
  if (item.adminOnly) return user.isAdmin;
  if (item.requiresRole && !user.role) return false;
  return item.min ? atLeast(user, item.min) : true;
}

export const homePath = (user: User | null | undefined) => (user?.role ? '/dashboard' : '/admin/people');

export const navFor = (user: User | null | undefined) => NAV.filter((item) => canAccess(user, item));
