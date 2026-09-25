import React from 'react';
import { Phone, MessageSquareText } from 'lucide-react';

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

export const telHref = (phone: string) => `tel:${digits(phone)}`;
// "?&body=" is the form both Android and iOS accept for a prefilled message.
export const smsHref = (phone: string, body?: string) => `sms:${digits(phone)}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;

/** Call and SMS buttons for one person. Opens the phone's dialer / messages app. */
export const ContactButtons: React.FC<{ name: string; phone?: string | null; sms?: string; size?: 'sm' | 'md' }> = ({
  name,
  phone,
  sms,
  size = 'sm',
}) => {
  if (!phone) return <span className="text-xs text-zinc-600 shrink-0">No phone</span>;
  const cls =
    size === 'md'
      ? 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-white/10 text-sm text-zinc-200 hover:bg-white/[0.05] transition-colors'
      : 'btn-ghost border border-white/10';
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <a href={telHref(phone)} className={cls} aria-label={`Call ${name}`} title={`Call ${phone}`}>
        <Phone className="w-4 h-4" />
        {size === 'md' && 'Call'}
      </a>
      <a href={smsHref(phone, sms)} className={cls} aria-label={`Text ${name}`} title={`SMS ${phone}`}>
        <MessageSquareText className="w-4 h-4" />
        {size === 'md' && 'SMS'}
      </a>
    </div>
  );
};
