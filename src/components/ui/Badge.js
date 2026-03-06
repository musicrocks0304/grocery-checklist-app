import React from 'react';

/**
 * Shared Badge / Tag / Pill component.
 *
 * Variants: primary, accent, danger, neutral, purple, blue, orange
 *
 * Usage:
 *   <Badge variant="primary">Basic</Badge>
 *   <Badge variant="accent">30 min</Badge>
 */

const VARIANT_CLASSES = {
  primary: 'bg-primary-light text-primary',
  accent: 'bg-accent-light text-accent',
  danger: 'bg-danger-light text-danger',
  neutral: 'bg-background text-body',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  orange: 'bg-accent-light text-accent',
};

const Badge = ({ variant = 'neutral', className = '', children, ...props }) => {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors duration-200 ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
