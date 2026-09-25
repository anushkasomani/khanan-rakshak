import React from 'react';
import { Field } from './ui';
import { ROLES, ROLE_LABELS, ROLE_HINTS, OFFICER_TYPES, TRADES, SPECIALIST_TYPES, SHIFTS, shiftLabel, hasShift, hasDistrict, canBeContracted } from '../roles';
import { Role } from '../types';

export interface PersonValues {
  name: string;
  email: string;
  phone: string;
  role: string;
  officerType: string;
  trade: string;
  specialistType: string;
  mineId: string;
  districtId: string;
  shift: string;
  contractId: string; // '' = the mine's own staff
  trainingValidUntil: string; // YYYY-MM-DD
  badgeNumber: string;
  isAdmin: boolean;
}

export const emptyPerson = (overrides: Partial<PersonValues> = {}): PersonValues => ({
  name: '',
  email: '',
  phone: '',
  role: '',
  officerType: '',
  trade: '',
  specialistType: '',
  mineId: '',
  districtId: '',
  shift: '',
  contractId: '',
  trainingValidUntil: '',
  badgeNumber: '',
  isAdmin: false,
  ...overrides,
});

export const personFromUser = (u: any): PersonValues =>
  emptyPerson({
    name: u.name || '',
    email: u.email || '',
    phone: u.phone || '',
    role: u.role || '',
    officerType: u.officerType || '',
    trade: u.trade || '',
    specialistType: u.specialistType || '',
    mineId: u.mineId || '',
    districtId: u.districtId || '',
    shift: u.shift || '',
    contractId: u.contractId || '',
    trainingValidUntil: u.trainingValidUntil ? String(u.trainingValidUntil).slice(0, 10) : '',
    badgeNumber: u.badgeNumber || '',
    isAdmin: !!u.isAdmin,
  });

// Mirrors the server's validation so people see problems before submitting.
export function personProblem(v: PersonValues, opts: { requireEmail?: boolean; requirePhone?: boolean; allowNoRole?: boolean } = {}): string | null {
  if (!v.name.trim()) return 'Enter a name.';
  if (opts.requireEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return 'Enter a valid email.';
  if (opts.requirePhone && v.phone.replace(/\D/g, '').length < 10) return 'Enter a valid phone number.';
  if (!v.role) return opts.allowNoRole ? null : 'Choose a role.';
  if (v.role === 'OFFICER' && !v.officerType) return 'Choose an officer type.';
  if (v.role === 'WORKER' && !v.trade) return 'Choose a trade.';
  if (v.role === 'SPECIALIST' && !v.specialistType) return 'Choose what kind of specialist.';
  if (v.role !== 'DGMS' && !v.mineId) return 'Choose a mine.';
  if (hasDistrict(v.role) && !v.districtId) return 'Choose a district.';
  if (hasShift(v.role) && !v.shift) return 'Choose a shift.';
  if (canBeContracted(v.role) && v.contractId && !v.trainingValidUntil) return 'Enter when their vocational training certificate expires. Contract workers need one.';
  return null;
}

export const personPayload = (v: PersonValues) => ({
  name: v.name.trim(),
  phone: v.phone.trim(),
  role: v.role || null,
  officerType: v.role === 'OFFICER' ? v.officerType : undefined,
  trade: v.role === 'WORKER' ? v.trade : undefined,
  specialistType: v.role === 'SPECIALIST' ? v.specialistType : undefined,
  mineId: v.role === 'DGMS' ? undefined : v.mineId || undefined,
  districtId: hasDistrict(v.role) ? v.districtId : undefined,
  shift: hasShift(v.role) ? v.shift : undefined,
  contractId: canBeContracted(v.role) ? v.contractId : undefined,
  trainingValidUntil: canBeContracted(v.role) ? v.trainingValidUntil : undefined,
  badgeNumber: v.badgeNumber.trim(),
});

export const PersonFields: React.FC<{
  value: PersonValues;
  onChange: (v: PersonValues) => void;
  mines: {
    id: string;
    name: string;
    shiftStartHour?: number;
    districts?: { id: string; name: string; location?: string | null }[];
    contracts?: { id: string; title: string; contractor: { name: string } }[];
  }[];
  showEmail?: boolean;
  showAdmin?: boolean;
}> = ({ value, onChange, mines, showEmail, showAdmin }) => {
  const set = (patch: Partial<PersonValues>) => onChange({ ...value, ...patch });
  const mine = mines.find((m) => m.id === value.mineId);
  const districts = mine?.districts || [];
  const contracts = mine?.contracts || [];

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${showEmail ? 'sm:grid-cols-2' : ''}`}>
        <Field label="Full name">
          <input value={value.name} onChange={(e) => set({ name: e.target.value })} className="input" autoComplete="name" />
        </Field>
        {showEmail && (
          <Field label="Email">
            <input type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} className="input" placeholder="name@example.com" />
          </Field>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Phone">
          <input
            type="tel"
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            className="input"
            placeholder="+91 98xxx xxxxx"
            autoComplete="tel"
          />
        </Field>
        <Field label="Employee ID (optional)">
          <input value={value.badgeNumber} onChange={(e) => set({ badgeNumber: e.target.value })} className="input" />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Role">
          <select value={value.role} onChange={(e) => set({ role: e.target.value })} className="input" aria-describedby="role-hint">
            <option value="">{showAdmin ? 'No role (admin only)' : 'Select'}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        {value.role === 'OFFICER' && (
          <Field label="Officer type">
            <select value={value.officerType} onChange={(e) => set({ officerType: e.target.value })} className="input">
              <option value="">Select</option>
              {Object.entries(OFFICER_TYPES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {value.role === 'SPECIALIST' && (
          <Field label="Specialist in">
            <select value={value.specialistType} onChange={(e) => set({ specialistType: e.target.value })} className="input">
              <option value="">Select</option>
              {Object.entries(SPECIALIST_TYPES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {value.role === 'WORKER' && (
          <Field label="Trade">
            <select value={value.trade} onChange={(e) => set({ trade: e.target.value })} className="input">
              <option value="">Select</option>
              {Object.entries(TRADES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {value.role && (
        <p id="role-hint" className="-mt-2 text-xs text-zinc-500">
          {ROLE_HINTS[value.role as Role]}
        </p>
      )}

      {value.role && value.role !== 'DGMS' && (
        <Field label="Mine">
          <select value={value.mineId} onChange={(e) => set({ mineId: e.target.value, districtId: '' })} className="input">
            <option value="">Select</option>
            {mines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {(hasDistrict(value.role) || hasShift(value.role)) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {hasDistrict(value.role) && (
            <Field label="District">
              <select value={value.districtId} onChange={(e) => set({ districtId: e.target.value })} className="input" disabled={!value.mineId}>
                <option value="">{!value.mineId ? 'Choose the mine first' : districts.length ? 'Select' : 'This mine has no districts yet'}</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.location ? ` · ${d.location}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Shift">
            <select value={value.shift} onChange={(e) => set({ shift: e.target.value })} className="input">
              <option value="">Select</option>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {shiftLabel(s, mine?.shiftStartHour)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {canBeContracted(value.role) && value.mineId && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Employed by">
            <select value={value.contractId} onChange={(e) => set({ contractId: e.target.value })} className="input">
              <option value="">The mine (own staff)</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contractor.name} · {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Training valid until${value.contractId ? '' : ' (optional)'}`}>
            <input type="date" value={value.trainingValidUntil} onChange={(e) => set({ trainingValidUntil: e.target.value })} className="input" />
          </Field>
          <p className="sm:col-span-2 -mt-1 text-xs text-zinc-500">
            The vocational training certificate. Contract workers can't check in without a valid one.
          </p>
        </div>
      )}

      {showAdmin && (
        <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.isAdmin}
            onChange={(e) => set({ isAdmin: e.target.checked })}
            className="w-4 h-4 rounded accent-zinc-100"
          />
          Admin access
        </label>
      )}
    </div>
  );
};
