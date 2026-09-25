import React from 'react';
import { motion } from 'framer-motion';
import { Logo } from './Logo';

export const SplashLoader: React.FC = () => (
  <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950">
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: [0, 1, 0.55, 1], scale: 1 }}
      transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity, repeatType: 'reverse' }}
    >
      <Logo size="lg" />
    </motion.div>
  </div>
);
