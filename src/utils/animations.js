/**
 * Shared Framer Motion animation variants and transitions.
 *
 * Usage:
 *   import { pageTransition, staggerContainer, staggerItem } from '../utils/animations';
 *   <motion.div {...pageTransition}>
 *   <motion.ul variants={staggerContainer} initial="initial" animate="animate">
 *     <motion.li variants={staggerItem}>
 */

export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

export const staggerContainer = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.04 },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

export const modalSpring = {
  initial: { opacity: 0, y: 80, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 40, scale: 0.96 },
  transition: { type: 'spring', damping: 28, stiffness: 320 },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
  transition: { type: 'spring', damping: 25, stiffness: 300 },
};
