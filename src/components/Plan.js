import React from 'react';
import GroceryChecklist from './GroceryChecklist';

/**
 * Plan screen — renders the weekly grocery checklist.
 * Meal planning has been moved to the separate Meals screen.
 */
const Plan = ({
  onNavigate,
  onUnsavedChanges,
  onStartShopping,
  debugMode,
}) => {
  return (
    <GroceryChecklist
      onNavigate={onNavigate}
      onUnsavedChanges={onUnsavedChanges}
      onStartShopping={onStartShopping}
      debugMode={debugMode}
    />
  );
};

export default Plan;
