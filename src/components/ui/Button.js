import React from 'react';

/**
 * Shared Button component.
 *
 * Variants: primary, secondary, danger, ghost, outline
 * Sizes: sm, md, lg
 * Supports theme override for amber cooking screens.
 *
 * Usage:
 *   <Button variant="primary" size="lg" onClick={fn}>Save</Button>
 *   <Button variant="primary" theme="amber" size="md">Build Recipe</Button>
 */

const VARIANT_CLASSES = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  'primary-amber': 'bg-accent-dark text-white hover:bg-amber-700',
  secondary: 'bg-secondary text-white hover:bg-secondary-hover',
  danger: 'bg-danger text-white hover:bg-danger-hover',
  ghost: 'bg-transparent text-body hover:bg-gray-100',
  outline: 'bg-white text-body border border-default hover:bg-gray-50',
};

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
};

const Button = React.forwardRef(({
  variant = 'primary',
  size = 'md',
  theme,
  disabled = false,
  loading = false,
  className = '',
  children,
  ...props
}, ref) => {
  // Use amber primary when theme is "amber"
  const resolvedVariant = (variant === 'primary' && theme === 'amber')
    ? 'primary-amber'
    : variant;

  const variantClass = VARIANT_CLASSES[resolvedVariant] || VARIANT_CLASSES.primary;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  const disabledClass = disabled || loading
    ? 'bg-gray-400 text-white cursor-not-allowed hover:bg-gray-400'
    : '';

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors ${sizeClass} ${disabledClass || variantClass} ${className}`}
      {...props}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
