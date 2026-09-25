import React, { useState } from 'react';
import { AlertOctagon, X, Flame, HeartPulse, Wrench, Wind, Waves, Check } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Mine } from '../types';

interface SosEmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  mines: Mine[];
  onTriggered?: (sosId: string) => void;
}

const EMERGENCY_TYPES = [
  { id: 'ACCIDENT', label: 'Roof fall / accident', icon: AlertOctagon },
  { id: 'GAS_HAZARD', label: 'Gas / methane', icon: Wind },
  { id: 'FIRE', label: 'Fire / smoke', icon: Flame },
  { id: 'MEDICAL_EMERGENCY', label: 'Medical', icon: HeartPulse },
  { id: 'EQUIPMENT_FAILURE', label: 'Power / winder failure', icon: Wrench },
  { id: 'UNSAFE_CONDITION', label: 'Flooding', icon: Waves },
];

export const SosEmergencyModal: React.FC<SosEmergencyModalProps> = ({ isOpen, onClose, mines, onTriggered }) => {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState('ACCIDENT');
  const [mineId, setMineId] = useState(user?.mineId || '');
  const [districtId, setDistrictId] = useState(user?.districtId || '');
  const [locationNotes, setLocationNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEvent, setSuccessEvent] = useState<any>(null);

  if (!isOpen) return null;

  const currentMine = mines.find((m) => m.id === mineId) || mines[0];
  const districts = currentMine?.districts || [];

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.triggerSos({
        mineId: currentMine?.id || mineId,
        districtId: districtId || undefined,
        emergencyType: selectedType,
        workerIdentifier: user ? `${user.name}${user.badgeNumber ? ` (${user.badgeNumber})` : ''}` : 'ANONYMOUS',
        locationNotes,
      });
      setSuccessEvent(res.alert);
      onTriggered?.(res.alert.id);
    } catch (err: any) {
      setError(err.message || 'Could not send the alert. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSuccessEvent(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70">
      <div className="w-full sm:max-w-md bg-zinc-900 border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-panel-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <h2 className="text-sm font-semibold">Emergency SOS</h2>
          </div>
          <button onClick={handleClose} aria-label="Close" className="btn-ghost -mr-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {successEvent ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Alert sent</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Your Sirdar, the Overman on shift, the officers and the mine manager have been notified.
            </p>
            <p className="mt-4 font-mono text-xs text-zinc-500">{successEvent.id}</p>
            <button onClick={handleClose} className="btn-secondary w-full mt-6">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleTrigger} className="p-5 space-y-5">
            <div>
              <label className="label">What's happening?</label>
              <div className="grid grid-cols-2 gap-2">
                {EMERGENCY_TYPES.map(({ id, label, icon: Icon }) => {
                  const selected = selectedType === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedType(id)}
                      className={`flex items-center gap-2 h-10 px-3 rounded-lg border text-left text-sm transition-colors ${
                        selected
                          ? 'border-red-500/60 bg-red-500/10 text-zinc-100'
                          : 'border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-white/15'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-red-400' : ''}`} />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Mine</label>
                <select
                  value={currentMine?.id || ''}
                  onChange={(e) => {
                    setMineId(e.target.value);
                    setDistrictId('');
                  }}
                  className="input"
                >
                  {mines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">District</label>
                <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} className="input">
                  <option value="">Not sure</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Location details (optional)</label>
              <input
                type="text"
                placeholder="e.g. Gallery 14, near the junction"
                value={locationNotes}
                onChange={(e) => setLocationNotes(e.target.value)}
                className="input"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button type="submit" disabled={isSubmitting || mines.length === 0} className="btn-danger w-full h-11 text-sm font-semibold">
              {isSubmitting ? 'Sending…' : 'Send SOS alert'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
