import React from 'react';

/**
 * Shared Badge / Tag / Pill component.
 *
 * Variants: primary, accent, danger, neutral, purple
 *
 * Usage:
 *   <Badge variant="primary">Basic</Badge>
 *   <Badge variant="accent">30 min</Badge>
 */

const VARIANT_CLASSES = {
  primary: 'bg-primary-light text-green-700',
  accent: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-700',
  blue: 'bg-blue-100 text-blue-700',
  orange: 'bg-orange-100 text-orange-700',
};

const Badge = ({ variant = 'neutral', className = '', children, ...props }) => {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
