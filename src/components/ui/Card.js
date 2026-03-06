import React from 'react';

/**
 * Shared Card / Panel component.
 *
 * Variants:
 *   elevated — warm shadow + border (default)
 *   flat     — border only, no shadow
 *
 * Usage:
 *   <Card>content</Card>
 *   <Card variant="flat" className="p-4">content</Card>
 */

const VARIANT_CLASSES = {
  elevated: 'bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200',
  flat: 'bg-surface rounded-2xl border border-default transition-colors duration-200',
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
