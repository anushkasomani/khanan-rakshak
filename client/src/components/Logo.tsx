import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Logo: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => {
  const box = size === 'lg' ? 'w-10 h-10 rounded-xl' : 'w-7 h-7 rounded-lg';
  const icon = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  return (
    <div className={`${box} bg-zinc-100 flex items-center justify-center shrink-0`}>
      <ShieldCheck className={`${icon} text-zinc-950`} strokeWidth={2.25} />
    </div>
  );
};
