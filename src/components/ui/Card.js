import React from 'react';

/**
 * Shared Card / Panel component.
 *
 * Variants:
 *   elevated — shadow + border (default)
 *   flat     — border only, no shadow
 *
 * Usage:
 *   <Card>content</Card>
 *   <Card variant="flat" className="p-4">content</Card>
 */

const VARIANT_CLASSES = {
  elevated: 'bg-surface rounded-xl shadow-lg border border-default',
  flat: 'bg-surface rounded-xl border border-default',
};

const Card = ({ variant = 'elevated', className = '', children, ...props }) => {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.elevated;

  return (
    <div className={`${variantClass} ${className}`} {...props}>
      {children}
    </div>
  );
};

export default Card;
