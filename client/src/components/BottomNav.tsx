import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutGrid, CalendarCheck, ClipboardCheck, AlertTriangle, Layers, Users, FileText, Menu, LucideIcon } from 'lucide-react';
import { slide } from '../motion';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';

type Tab = { to: string; label: string; icon: LucideIcon };
const HOME: Tab = { to: '/dashboard', label: 'Home', icon: LayoutGrid };
const HAZARDS: Tab = { to: '/safety-reports', label: 'Hazards', icon: AlertTriangle };

/** Two tabs either side of SOS; the ones each role opens most on shift. */
const TABS_FOR: Partial<Record<Role, [Tab, Tab, Tab]>> = {
  WORKER: [HOME, HAZARDS, { to: '/inspections', label: 'Tasks', icon: ClipboardCheck }],
  SPECIALIST: [HOME, { to: '/field-reports', label: 'Reports', icon: FileText }, HAZARDS],
  SIRDAR: [HOME, { to: '/attendance', label: 'Crew', icon: Users }, HAZARDS],
  OVERMAN: [HOME, { to: '/shifts', label: 'Districts', icon: Layers }, HAZARDS],
};
const DEFAULT_TABS: [Tab, Tab, Tab] = [HOME, { to: '/attendance', label: 'Attendance', icon: CalendarCheck }, { to: '/inspections', label: 'Inspections', icon: ClipboardCheck }];

/** Phone-only tab bar, app style. SOS sits in the middle where a thumb finds it without looking. */
export const BottomNav: React.FC<{ onOpenSos: () => void; onOpenMore: () => void }> = ({ onOpenSos, onOpenMore }) => {
  const { user } = useAuth();
  const [first, second, third] = (user?.role && TABS_FOR[user.role]) || DEFAULT_TABS;
  const tab = ({ to, label, icon: Icon }: Tab) => (
    <NavLink key={to} to={to} className="relative flex-1 flex flex-col items-center justify-center gap-1 h-full">
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="bottom-nav-active" transition={slide} className="absolute top-0 h-0.5 w-8 rounded-full bg-zinc-100" />}
          <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`} />
          <span className={`text-[10px] transition-colors ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`}>{label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <nav className="lg:hidden shrink-0 border-t border-white/[0.06] bg-zinc-950 pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <div className="h-16 flex items-stretch">
        {[first, second].map(tab)}
        <div className="flex-1 flex items-center justify-center">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenSos}
            aria-label="Send SOS"
            className="w-14 h-14 -mt-6 rounded-full bg-red-600 text-white text-xs font-bold tracking-wider shadow-[0_8px_24px_-6px_rgba(220,38,38,0.6)] ring-4 ring-zinc-950"
          >
            SOS
          </motion.button>
        </div>
        {tab(third)}
        <button onClick={onOpenMore} className="flex-1 flex flex-col items-center justify-center gap-1 text-zinc-500 active:text-zinc-200">
          <Menu className="w-5 h-5" />
          <span className="text-[10px]">More</span>
        </button>
      </div>
    </nav>
  );
};
