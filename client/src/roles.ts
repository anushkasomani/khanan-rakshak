import { Role, Shift, User } from './types';

// Lowest first. DGMS is the outside regulator.
export const ROLES: Role[] = ['WORKER', 'SPECIALIST', 'SIRDAR', 'OVERMAN', 'OFFICER', 'ASSISTANT_MANAGER', 'MINE_MANAGER', 'OWNER', 'DGMS'];

export const ROLE_LEVEL: Record<Role, number> = {
  WORKER: 1,
  SPECIALIST: 1.5,
  SIRDAR: 2,
  OVERMAN: 3,
  OFFICER: 4,
  ASSISTANT_MANAGER: 5,
  MINE_MANAGER: 6,
  OWNER: 7,
  DGMS: 8,
};

export const ROLE_LABELS: Record<Role, string> = {
  WORKER: 'Worker',
  SPECIALIST: 'Specialist',
  SIRDAR: 'Mining Sirdar',
  OVERMAN: 'Overman',
  OFFICER: 'Officer',
  ASSISTANT_MANAGER: 'Assistant manager',
  MINE_MANAGER: 'Mine manager',
  OWNER: 'Owner / Agent',
  DGMS: 'DGMS',
};

/** One line on what each role is responsible for, shown when choosing a role. */
export const ROLE_HINTS: Record<Role, string> = {
  WORKER: 'Works in one district on one shift.',
  SPECIALIST: 'Blaster, shot-firer, surveyor or another certified specialist. Submits technical reports.',
  SIRDAR: 'Inspects one district before the shift and supervises its crew.',
  OVERMAN: 'Oversees every district for one shift.',
  OFFICER: 'Safety, ventilation, electrical or another specialist, for the whole mine.',
  ASSISTANT_MANAGER: 'Runs districts across all shifts for the mine manager.',
  MINE_MANAGER: 'Legally responsible for the whole mine.',
  OWNER: 'The company that holds the mine (Agent, Area GM).',
  DGMS: 'Government regulator. Can see every mine.',
};

export const SHIFTS: Shift[] = ['A', 'B', 'C'];

export const clockHour = (n: number) => {
  const h = ((n % 24) + 24) % 24;
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Shift A · 6 AM – 2 PM". Each mine sets when shift A starts; B and C follow every 8 hours. */
export const shiftLabel = (s: Shift, startHour = 6) => {
  const from = startHour + 8 * SHIFTS.indexOf(s);
  return `Shift ${s} · ${clockHour(from)} – ${clockHour(from + 8)}`;
};

/** Roles tied to one shift, and the ones also tied to one district. */
export const hasShift = (role?: string | null) => role === 'WORKER' || role === 'SIRDAR' || role === 'OVERMAN';
export const hasDistrict = (role?: string | null) => role === 'WORKER' || role === 'SIRDAR';

export const SPECIALIST_TYPES: Record<string, string> = {
  BLASTER: 'Blaster',
  SHOT_FIRER: 'Shot-firer',
  SURVEYOR: 'Surveyor',
  MAGAZINE_INCHARGE: 'Magazine in-charge',
  WINDING_ENGINE_OPERATOR: 'Winding engine operator',
  ELECTRICAL_SUPERVISOR: 'Electrical supervisor',
  OTHER: 'Other specialist',
};

/** Roles a contractor can supply. */
export const canBeContracted = (role?: string | null) => role === 'WORKER' || role === 'SPECIALIST' || role === 'SIRDAR';

export const OFFICER_TYPES: Record<string, string> = {
  SAFETY: 'Safety',
  VENTILATION: 'Ventilation',
  ELECTRICAL: 'Electrical',
  MECHANICAL: 'Mechanical',
  SURVEY: 'Survey',
  BLASTING: 'Blasting',
  OTHER: 'Other',
};

export const TRADES: Record<string, string> = {
  DRILLER: 'Driller',
  ELECTRICIAN: 'Electrician',
  FITTER: 'Fitter',
  BLASTER: 'Blaster',
  OPERATOR: 'Machine operator',
  HELPER: 'Helper',
  OTHER: 'Other',
};

export const levelOf = (role?: Role | null) => (role ? ROLE_LEVEL[role] : 0);

export const atLeast = (user: Pick<User, 'role' | 'isAdmin'> | null | undefined, min: Role) =>
  !!user && (user.isAdmin || levelOf(user.role) >= ROLE_LEVEL[min]);

export function describeRole(p: Pick<User, 'role' | 'officerType' | 'trade' | 'isAdmin'> & { specialistType?: string | null }): string {
  if (!p.role) return p.isAdmin ? 'Admin' : 'No role yet';
  if (p.role === 'OFFICER' && p.officerType) return `${OFFICER_TYPES[p.officerType] || p.officerType} officer`;
  if (p.role === 'WORKER' && p.trade) return `Worker · ${TRADES[p.trade] || p.trade}`;
  if (p.role === 'SPECIALIST' && p.specialistType) return SPECIALIST_TYPES[p.specialistType] || 'Specialist';
  return ROLE_LABELS[p.role];
}

/** "District 2 · Shift A" for people tied to a place and a shift. */
export function describePost(p: { district?: { name: string } | null; shift?: Shift | null }): string {
  return [p.district?.name, p.shift && `Shift ${p.shift}`].filter(Boolean).join(' · ');
}

/** The mines someone can switch between: every mine for DGMS and admins, the company's mines for an Owner, else their own. */
export function minesFor<M extends { id: string; company?: string | null }>(user: User | null | undefined, mines: M[]): M[] {
  if (!user) return [];
  if (user.isAdmin || user.role === 'DGMS' || !user.mineId) return mines;
  if (user.role === 'OWNER' && user.mine?.company) return mines.filter((m) => m.company === user.mine!.company);
  return mines.filter((m) => m.id === user.mineId);
}
