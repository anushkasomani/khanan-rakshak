import React from 'react';
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { quick, slide } from '../motion';
import { useAuth } from '../context/AuthContext';
import { navFor, NavItem } from '../navigation';
import { Logo } from './Logo';

interface SidebarProps {
  variant: 'desktop' | 'mobile';
  isOpen?: boolean;
  onClose?: () => void;
}

const GROUP_ORDER: (NavItem['group'] | undefined)[] = [undefined, 'Safety', 'People', 'Governance', 'Admin'];

export const Sidebar: React.FC<SidebarProps> = ({ variant, isOpen = false, onClose }) => {
  const { user } = useAuth();
  const items = navFor(user);
  const groups = GROUP_ORDER.map((g) => ({ label: g, items: items.filter((i) => i.group === g) })).filter((g) => g.items.length);
  // On phones the menu has room to say what each page is for; the desktop sidebar keeps it in a tooltip.
  const showHint = variant === 'mobile';
  const renderItem = ({ to, label, hint, icon: Icon }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      onClick={onClose}
      title={!showHint ? hint : undefined}
      className={({ isActive }) =>
        `relative flex items-center gap-2.5 ${showHint && hint ? 'min-h-12 py-1.5' : variant === 'mobile' ? 'h-10' : 'h-8'} px-2.5 rounded-md text-[13px] transition-colors ${
          isActive ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId={`nav-active-${variant}`} transition={slide} className="absolute inset-0 rounded-md bg-white/[0.07]" />}
          <Icon className="relative w-4 h-4 shrink-0 opacity-80" />
          <span className="relative min-w-0">
            <span className="block truncate">{label}</span>
            {showHint && hint && <span className="block text-[11px] leading-tight text-zinc-500 truncate">{hint}</span>}
          </span>
        </>
      )}
    </NavLink>
  );

  const nav = (
    <nav className="px-3 py-4 space-y-5">
      {groups.map((g) => {
        const topLevel = g.items.filter((item) => !item.subgroup);
        const subgroups = [...new Set(g.items.map((item) => item.subgroup).filter(Boolean))] as string[];
        return <div key={g.label || 'main'}>
          {g.label && <div className="px-2.5 mb-1 text-xs text-zinc-500">{g.label}</div>}
          <div className="space-y-px">
            {topLevel.map(renderItem)}
            {subgroups.map((subgroup) => <div key={subgroup} className="ml-2 mt-2 border-l border-white/[0.08] pl-2">
              <p className="px-2.5 pb-1 text-[11px] text-zinc-600">{subgroup}</p>
              <div className="space-y-px">{g.items.filter((item) => item.subgroup === subgroup).map(renderItem)}</div>
            </div>)}
          </div>
        </div>;
      })}
    </nav>
  );

  if (variant === 'desktop') {
    return <aside className="hidden lg:block w-56 shrink-0 border-r border-white/[0.06] overflow-y-auto">{nav}</aside>;
  }

  return (
    <AnimatePresence>
      {isOpen && (
    <div className="fixed inset-0 z-50 lg:hidden">
      <motion.div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={quick}
      />
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={slide}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.4, right: 0 }}
        onDragEnd={(_, info) => (info.offset.x < -80 || info.velocity.x < -400) && onClose?.()}
        className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] flex flex-col bg-zinc-950 border-r border-white/[0.06] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-sm font-semibold tracking-tight">Khanan Rakshak</span>
          </div>
          <button onClick={onClose} aria-label="Close navigation" className="btn-ghost -mr-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
      </motion.aside>
    </div>
      )}
    </AnimatePresence>
  );
};
