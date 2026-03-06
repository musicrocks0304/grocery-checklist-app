import React from 'react';

/**
 * Shared LoadingSpinner.
 *
 * Sizes: sm (inline), lg (full-page placeholder)
 * Theme: "green" (default) or "amber" for cooking screens.
 *
 * Usage:
 *   <LoadingSpinner />                              — large green
 *   <LoadingSpinner size="sm" />                    — inline green
 *   <LoadingSpinner theme="amber" />                — large amber
 *   <LoadingSpinner size="lg" label="Loading..." /> — with text
 */

const THEME_COLORS = {
  green: 'border-primary',
  amber: 'border-accent',
};

const LoadingSpinner = ({
  size = 'lg',
  theme = 'green',
  label,
  sublabel,
  className = '',
}) => {
  const color = THEME_COLORS[theme] || THEME_COLORS.green;

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <div className={`animate-spin rounded-full h-4 w-4 border-2 border-t-transparent ${color}`} />
        {label && <span className="text-sm text-muted">{label}</span>}
      </div>
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <div className={`animate-spin rounded-full h-12 w-12 border-4 border-t-transparent ${color} mx-auto`} />
      {label && <p className="mt-4 text-body">{label}</p>}
      {sublabel && <p className="mt-2 text-sm text-muted">{sublabel}</p>}
    </div>
  );
};

export default LoadingSpinner;
