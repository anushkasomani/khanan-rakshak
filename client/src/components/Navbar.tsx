import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { quick } from '../motion';
import { Bell, Menu, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Logo } from './Logo';
import { homePath } from '../navigation';

interface NavbarProps {
  onOpenSos?: () => void;
  onOpenMobileNav: () => void;
  hasBottomNav?: boolean; // on phones the bottom bar carries SOS and the menu
}

const Dropdown: React.FC<{ open: boolean; className: string; children: React.ReactNode }> = ({ open, className, children }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0, y: -4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.98 }}
        transition={quick}
        style={{ transformOrigin: 'top right' }}
        className={className}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function useCloseOnOutsideClick(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);
  return ref;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSos, onOpenMobileNav, hasBottomNav = false }) => {
  const { user, logout } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const notifRef = useCloseOnOutsideClick(showNotifs, () => setShowNotifs(false));
  const userRef = useCloseOnOutsideClick(showUserMenu, () => setShowUserMenu(false));

  useEffect(() => {
    api.getNotifications().then(setNotifications).catch(() => setNotifications([]));
  }, [user?.id]);

  const unread = notifications.filter((n) => !n.read).length;

  const toggleNotifs = () => {
    const opening = !showNotifs;
    setShowNotifs(opening);
    if (!opening || !unread) return;
    // Opening the panel counts as seeing them; the list keeps its bold state until next open.
    notifications.filter((n) => !n.read).forEach((n) => api.markNotificationRead(n.id).catch(() => {}));
    setTimeout(() => setNotifications((list) => list.map((n) => ({ ...n, read: true }))), 1500);
  };

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-4 px-4 lg:px-5 border-b border-white/[0.06] bg-zinc-950">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onOpenMobileNav} aria-label="Open navigation" className={`btn-ghost -ml-2 ${hasBottomNav ? 'hidden' : 'lg:hidden'}`}>
          <Menu className="w-5 h-5" />
        </button>
        <Link to={homePath(user)} className="flex items-center gap-2.5 min-w-0">
          <Logo />
          <span className="text-sm font-semibold tracking-tight text-zinc-100 truncate">Khanan Rakshak</span>
        </Link>
      </div>

      <div className="flex items-center gap-1.5">
        {onOpenSos && (
          <button onClick={onOpenSos} className={`btn-danger h-8 px-3 text-xs font-semibold tracking-wide ${hasBottomNav ? 'hidden lg:inline-flex' : ''}`}>
            SOS
          </button>
        )}

        <div className="relative" ref={notifRef}>
          <button onClick={toggleNotifs} aria-label="Notifications" className="btn-ghost relative">
            <Bell className="w-[18px] h-[18px]" />
            {unread > 0 && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-zinc-100" />}
          </button>
          <Dropdown open={showNotifs} className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/[0.08] bg-zinc-900 shadow-panel-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] text-sm font-medium">Notifications</div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500">You're all caught up.</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="px-4 py-3 border-b border-white/[0.04] last:border-0">
                      <p className={`text-sm ${n.read ? 'text-zinc-400' : 'text-zinc-100'}`}>{n.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{n.message}</p>
                      <p className="mt-1 text-[11px] text-zinc-600">{timeAgo(n.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
          </Dropdown>
        </div>

        <div className="relative" ref={userRef}>
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            aria-label="Account"
            className="ml-1 w-8 h-8 rounded-full bg-zinc-800 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </button>
          <Dropdown open={showUserMenu} className="absolute right-0 mt-2 w-56 rounded-xl border border-white/[0.08] bg-zinc-900 shadow-panel-lg z-50 py-1">
              <div className="px-3 py-2.5 border-b border-white/[0.06]">
                <p className="text-sm text-zinc-100 truncate">{user?.name}</p>
                <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
              </div>
              <Link
                to="/profile"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.04]"
              >
                <UserIcon className="w-4 h-4 text-zinc-500" />
                Profile
              </Link>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.04]"
              >
                <LogOut className="w-4 h-4 text-zinc-500" />
                Sign out
              </button>
          </Dropdown>
        </div>
      </div>
    </header>
  );
};
