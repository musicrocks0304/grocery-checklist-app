import React, { useState } from 'react';
import StaplesScreen from './StaplesScreen';
import ReviewScreen from './staples/ReviewScreen';
import useWeekStaples from '../hooks/useWeekStaples';
import useWeekMeals from '../hooks/useWeekMeals';

// Plan owns the `useWeekStaples` + `useWeekMeals` hooks so StaplesScreen and
// ReviewScreen share one instance — toggling between them is instant and
// mutations in Review (remove item, etc.) reflect immediately in both.
const Plan = ({ onNavigate }) => {
  const staplesHook = useWeekStaples();
  const mealsHook = useWeekMeals();
  const [showReview, setShowReview] = useState(false);

  return (
    <>
      <StaplesScreen
        staplesHook={staplesHook}
        mealsHook={mealsHook}
        onReview={() => setShowReview(true)}
      />
      {showReview && (
        <ReviewScreen
          items={staplesHook.items}
          selected={staplesHook.selected}
          meals={mealsHook.meals}
          onToggle={staplesHook.toggle}
          onRemoveOneOff={staplesHook.removeOneOff}
          onBack={() => setShowReview(false)}
          onStartShopping={() => {
            setShowReview(false);
            onNavigate('shop');
          }}
        />
      )}
    </>
  );
};

export default Plan;
