import type { Transition } from 'framer-motion';

/** One motion language for the whole app: short, eased-out, never bouncy. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const quick: Transition = { duration: 0.18, ease: EASE_OUT };
export const smooth: Transition = { duration: 0.28, ease: EASE_OUT };
/** For elements that physically slide (drawers, sheets, sliding tab indicators). */
export const slide: Transition = { type: 'spring', stiffness: 520, damping: 44, mass: 0.9 };
