// The chain of responsibility at a mine, lowest first. DGMS is the outside regulator.
export const ROLES = ['WORKER', 'SPECIALIST', 'SIRDAR', 'OVERMAN', 'OFFICER', 'ASSISTANT_MANAGER', 'MINE_MANAGER', 'OWNER', 'DGMS'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LEVEL: Record<Role, number> = {
  WORKER: 1,
  SPECIALIST: 1.5, // a competent person (blaster, surveyor...): above a worker, supervises nobody
  SIRDAR: 2,
  OVERMAN: 3,
  OFFICER: 4,
  ASSISTANT_MANAGER: 5,
  MINE_MANAGER: 6,
  OWNER: 7,
  DGMS: 8,
};

export const ROLE_LABEL: Record<Role, string> = {
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

export const OFFICER_TYPES = ['SAFETY', 'VENTILATION', 'ELECTRICAL', 'MECHANICAL', 'SURVEY', 'BLASTING', 'OTHER'] as const;
export const SPECIALIST_TYPES = ['BLASTER', 'SHOT_FIRER', 'SURVEYOR', 'MAGAZINE_INCHARGE', 'WINDING_ENGINE_OPERATOR', 'ELECTRICAL_SUPERVISOR', 'OTHER'] as const;
export const TRADES = ['DRILLER', 'ELECTRICIAN', 'FITTER', 'BLASTER', 'OPERATOR', 'HELPER', 'OTHER'] as const;
export const USER_STATUSES = ['NEW', 'PENDING', 'APPROVED', 'REJECTED'] as const;

/** Roles tied to one shift, and the ones also tied to one district. */
export const SHIFT_ROLES: readonly string[] = ['WORKER', 'SIRDAR', 'OVERMAN'];
export const DISTRICT_ROLES: readonly string[] = ['WORKER', 'SIRDAR'];
/** Roles a contractor can supply. */
export const CONTRACT_ROLES: readonly string[] = ['WORKER', 'SPECIALIST', 'SIRDAR'];

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

export const roleLevel = (role?: string | null) => (isRole(role) ? ROLE_LEVEL[role] : 0);

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type ProfileInput = {
  role?: unknown;
  officerType?: unknown;
  trade?: unknown;
  mineId?: unknown;
  districtId?: unknown;
  shift?: unknown;
  trainingValidUntil?: unknown;
  specialistType?: unknown;
};

// Returns an error message, or null when the combination is valid. District ownership is checked by the caller.
export function validateProfile({ role, officerType, trade, mineId, districtId, shift, trainingValidUntil, specialistType }: ProfileInput): string | null {
  if (!isRole(role)) return 'Choose a valid role.';
  if (role === 'OFFICER' && !(OFFICER_TYPES as readonly unknown[]).includes(officerType)) return 'Choose an officer type.';
  if (role === 'WORKER' && !(TRADES as readonly unknown[]).includes(trade)) return 'Choose a trade.';
  if (role === 'SPECIALIST' && !(SPECIALIST_TYPES as readonly unknown[]).includes(specialistType)) return 'Choose what kind of specialist.';
  if (role !== 'DGMS' && !mineId) return 'Choose a mine.';
  if (DISTRICT_ROLES.includes(role) && !districtId) return 'Choose a district.';
  if (SHIFT_ROLES.includes(role) && !['A', 'B', 'C'].includes(String(shift))) return 'Choose a shift.';
  if (trainingValidUntil && Number.isNaN(new Date(String(trainingValidUntil)).getTime())) return 'Enter a valid training date.';
  return null;
}

/** Fields that only apply to some roles are cleared for the others. */
export const profileFields = (
  role: string | null,
  v: {
    officerType?: unknown;
    trade?: unknown;
    specialistType?: unknown;
    mineId?: unknown;
    districtId?: unknown;
    shift?: unknown;
    contractId?: unknown;
    trainingValidUntil?: unknown;
  }
) => ({
  officerType: role === 'OFFICER' ? (v.officerType as string) : null,
  trade: role === 'WORKER' ? (v.trade as string) : null,
  specialistType: role === 'SPECIALIST' ? (v.specialistType as string) : null,
  mineId: role === 'DGMS' ? null : ((v.mineId as string) ?? null),
  districtId: role && DISTRICT_ROLES.includes(role) ? (v.districtId as string) : null,
  shift: role && SHIFT_ROLES.includes(role) ? (v.shift as string) : null,
  // Contract workers, specialists and the contractor's own Sirdars; everyone else is the mine's own staff.
  contractId: role && CONTRACT_ROLES.includes(role) && v.contractId ? (v.contractId as string) : null,
  trainingValidUntil: role && CONTRACT_ROLES.includes(role) && v.trainingValidUntil ? new Date(String(v.trainingValidUntil)) : null,
});
