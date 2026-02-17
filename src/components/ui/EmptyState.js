import React from 'react';

/**
 * Shared EmptyState component.
 *
 * Shows a centered icon + title + description + optional CTA button.
 * Icon should be a lucide-react component.
 *
 * Usage:
 *   <EmptyState
 *     icon={ShoppingBag}
 *     title="No Shopping List"
 *     description="Save a grocery list first."
 *     action={{ label: "Go to Grocery Selection", onClick: handleClick }}
 *   />
 */

const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`text-center py-12 ${className}`}>
      {Icon && <Icon size={56} className="mx-auto text-gray-300 mb-4" />}
      {title && <h2 className="text-xl font-semibold text-body mb-2">{title}</h2>}
      {description && <p className="text-muted mb-6 max-w-sm mx-auto">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
