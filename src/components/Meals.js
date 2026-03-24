import React, { useState, useCallback, useEffect } from 'react';
import { MessageSquare, UtensilsCrossed } from 'lucide-react';
import { motion } from 'framer-motion';
import ChatBot from './ChatBot';
import MealCreator from './MealCreator';

/**
 * Meals screen — segmented control switching between:
 *   1. AI Meal Planner (ChatBot)
 *   2. Create Recipe (MealCreator)
 */

const MEAL_MODES = [
  { id: 'planner', label: 'AI Planner', icon: MessageSquare },
  { id: 'creator', label: 'Create Recipe', icon: UtensilsCrossed },
];

const Meals = ({
  onNavigate,
  selectedMeals,
  setSelectedMeals,
  refreshMeals,
  groceryListData,
  setGroceryListData,
  debugMode,
}) => {
  const [mealMode, setMealMode] = useState(() => {
    try {
      return localStorage.getItem('mealsTabState') || 'planner';
    } catch { return 'planner'; }
  });

  useEffect(() => {
    try { localStorage.setItem('mealsTabState', mealMode); }
    catch { /* ignore */ }
  }, [mealMode]);

  // Internal navigation: switch sub-mode instead of leaving screen
  const handleMealNavigate = useCallback((screen) => {
    if (screen === 'chatbot') {
      setMealMode('planner');
    } else if (screen === 'meal-creator') {
      setMealMode('creator');
    } else {
      onNavigate(screen);
    }
  }, [onNavigate]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Segmented control */}
      <div className="sticky top-12 lg:top-0 z-20 bg-surface/95 backdrop-blur-md border-b border-default px-4 py-3">
        <div className="max-w-6xl mx-auto flex justify-center">
          <div className="inline-flex bg-background rounded-full p-1 gap-0.5">
            {MEAL_MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = mealMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setMealMode(mode.id)}
                  className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10 ${
                    isActive ? 'text-white' : 'text-muted hover:text-body'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="meals-segment"
                      className="absolute inset-0 bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon size={14} />
                    {mode.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {mealMode === 'planner' && (
          <ChatBot
            onBack={() => onNavigate('plan')}
            onNavigate={handleMealNavigate}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        )}

        {mealMode === 'creator' && (
          <MealCreator
            onBack={() => setMealMode('planner')}
            onNavigate={handleMealNavigate}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            debugMode={debugMode}
          />
        )}
      </div>
    </div>
  );
};

export default Meals;
