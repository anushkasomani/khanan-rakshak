import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { quick, slide, smooth } from '../motion';

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export const Section: React.FC<{
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, action, className = '', children }) => (
  <section className={`min-w-0 ${className}`}>
    <div className="flex items-center justify-between gap-4 mb-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'default' | 'danger' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <div className="card px-3 py-3 sm:px-4 sm:py-4 min-w-0">
    <p className="text-xs text-zinc-500 truncate">{label}</p>
    <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-red-400' : ''}`}>{value}</p>
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-10 text-center text-sm text-zinc-500">{children}</p>
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="label">{label}</label>
    {children}
  </div>
);

type Option<T> = { value: T; label: string };

/** Pill tabs; the active background slides between options. */
export const Tabs = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Option<T>[] }) => {
  const id = useId();
  return (
    <div className="inline-flex max-w-full overflow-x-auto p-1 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative h-7 px-3 rounded-md text-sm whitespace-nowrap transition-colors ${
            value === o.value ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {value === o.value && <motion.span layoutId={`tab-${id}`} transition={slide} className="absolute inset-0 rounded-md bg-zinc-800" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
};

/** Full-width segmented control for forms. */
export const Segmented = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Option<T>[] }) => {
  const id = useId();
  return (
    <div className="grid gap-1 p-1 rounded-lg bg-zinc-950 border border-white/10" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative h-7 rounded-md text-xs truncate transition-colors ${
            value === o.value ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} transition={slide} className="absolute inset-0 rounded-md bg-zinc-800" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
};

const useIsDesktop = () => {
  const query = '(min-width: 640px)';
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return match;
};

/**
 * Bottom sheet on phones, centered dialog on larger screens. Closing from inside (X, backdrop, Esc) plays the
 * exit animation first, then calls onClose.
 */
export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: 'md' | 'lg';
}> = ({ title, onClose, children, width = 'md' }) => {
  const [open, setOpen] = useState(true);
  const desktop = useIsDesktop();
  const requestClose = () => setOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={quick}
          onClick={requestClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={desktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: '100%' }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.98, y: 4 } : { y: '100%' }}
            transition={desktop ? smooth : slide}
            className={`w-full ${width === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'} bg-zinc-900 border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-panel-lg max-h-[92vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]`}
          >
            <div className="sticky top-0 z-10 bg-zinc-900 flex items-center justify-between px-5 h-14 border-b border-white/[0.06]">
              <h2 className="text-sm font-semibold truncate">{title}</h2>
              <button onClick={requestClose} aria-label="Close" className="btn-ghost -mr-2">
                <X className="w-4 h-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

/** Placeholder rows shown while a list loads; same rhythm as real rows so nothing jumps. */
export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div aria-hidden className="divide-y divide-white/[0.05]">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3" style={{ width: `${70 - ((i * 17) % 30)}%` }} />
          <div className="skeleton h-2.5 w-1/3" />
        </div>
        <div className="skeleton h-3 w-14" />
      </div>
    ))}
  </div>
);

export const DetailRows: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <dl className="divide-y divide-white/[0.05]">
    {rows.map(([label, value]) => (
      <div key={label} className="flex items-start justify-between gap-4 py-2.5">
        <dt className="text-sm text-zinc-500 shrink-0">{label}</dt>
        <dd className="text-sm text-zinc-200 text-right min-w-0 break-words">{value || <span className="text-zinc-600">—</span>}</dd>
      </div>
    ))}
  </dl>
);

const ACRONYMS = ['PPE', 'SOS', 'DGMS', 'GM'];

export const titleCase = (s?: string | null) =>
  s
    ? s
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase())
        .replace(new RegExp(`\\b(${ACRONYMS.join('|')})\\b`, 'gi'), (m) => m.toUpperCase())
    : '';

export const shortDate = (d: string | Date) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
