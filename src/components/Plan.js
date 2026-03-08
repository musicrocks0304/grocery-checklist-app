import React, { useState, useCallback } from 'react';
import { ClipboardList, MessageSquare, UtensilsCrossed } from 'lucide-react';
import ChatBot from './ChatBot';
import MealCreator from './MealCreator';
import GroceryChecklist from './GroceryChecklist';

/**
 * Plan screen — unified container with two primary tabs:
 *   1. Meals — AI meal planning (ChatBot + MealCreator sub-modes)
 *   2. Grocery List — weekly checklist with one-off quick-add
 *
 * The Meals tab has sub-modes: "planner" (ChatBot) and "creator" (MealCreator).
 */

const PLAN_TABS = [
  { id: 'list', label: 'Grocery List', icon: ClipboardList },
  { id: 'meals', label: 'Meals', icon: UtensilsCrossed },
];

const MEAL_MODES = [
  { id: 'planner', label: 'AI Meal Planner', icon: MessageSquare },
  { id: 'creator', label: 'Create Recipe', icon: UtensilsCrossed },
];

const Plan = ({
  onNavigate,
  onUnsavedChanges,
  onStartShopping,
  selectedMeals,
  setSelectedMeals,
  groceryListData,
  setGroceryListData,
  debugMode,
}) => {
  const [activeTab, setActiveTab] = useState('list');
  const [mealMode, setMealMode] = useState('planner');

  // When ChatBot navigates to MealCreator (or vice versa), switch sub-mode instead
  const handleMealNavigate = useCallback((screen) => {
    if (screen === 'chatbot') {
      setMealMode('planner');
    } else if (screen === 'meal-creator') {
      setMealMode('creator');
    } else {
      // Pass through to parent for other screens (recipe-ingredients, etc.)
      onNavigate(screen);
    }
  }, [onNavigate]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="sticky top-12 lg:top-0 z-20 bg-surface/95 backdrop-blur-md border-b border-default px-4 pt-2">
        <div className="max-w-6xl mx-auto flex gap-1">
          {PLAN_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-body hover:border-default'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Meal sub-mode switcher (only when Meals tab is active) */}
        {activeTab === 'meals' && (
          <div className="max-w-6xl mx-auto flex gap-1 pb-2 pt-1">
            {MEAL_MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = mealMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setMealMode(mode.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'bg-background text-body hover:bg-default'
                  }`}
                >
                  <Icon size={12} />
                  {mode.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'list' && (
          <GroceryChecklist
            onNavigate={onNavigate}
            onUnsavedChanges={onUnsavedChanges}
            onStartShopping={onStartShopping}
            debugMode={debugMode}
          />
        )}

        {activeTab === 'meals' && mealMode === 'planner' && (
          <ChatBot
            onBack={() => setActiveTab('list')}
            onNavigate={handleMealNavigate}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        )}

        {activeTab === 'meals' && mealMode === 'creator' && (
          <MealCreator
            onBack={() => setMealMode('planner')}
            onNavigate={handleMealNavigate}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            debugMode={debugMode}
          />
        )}
      </div>
    </div>
  );
};

export default Plan;
