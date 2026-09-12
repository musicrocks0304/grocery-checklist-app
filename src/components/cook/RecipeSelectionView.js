import React from 'react';
import { ArrowLeft, Clock, Wifi, ChevronDown, ChevronUp, ChefHat, Utensils, Play } from 'lucide-react';

export default function RecipeSelectionView({
  availableRecipes, debugMode, showDebug, setShowDebug, debugInfo,
  showResumePrompt, savedSessionData, handleResumeSession, handleDismissResume,
  handleBackToApp, onNavigate, handleRecipeSelect,
}) {
    return (
      <div className="min-h-screen bg-background transition-colors duration-200">
        {/* Header */}
        <div className="bg-surface shadow-sm border-b border-default">
          <div className="max-w-4xl mx-auto px-4 py-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBackToApp}
                aria-label="Back to grocery list"
                className="flex items-center justify-center min-h-[44px] min-w-[44px] w-10 h-10 text-body hover:text-heading transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-display font-bold text-heading truncate">Cook</h1>
                <p className="text-xs text-muted truncate">
                  {availableRecipes.length > 0
                    ? `${availableRecipes.length} meal${availableRecipes.length !== 1 ? 's' : ''} planned this week`
                    : 'Choose a recipe to cook'}
                </p>
              </div>
              {debugMode ? (
                <button
                  type="button"
                  onClick={() => setShowDebug(!showDebug)}
                  aria-label="Toggle debug log"
                  aria-expanded={showDebug}
                  className="flex items-center gap-1 text-sm text-body hover:text-heading transition-colors min-h-[44px] min-w-[44px] justify-center"
                >
                  <Wifi size={16} />
                  <span className="hidden sm:inline">Debug</span>
                  {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              ) : (
                <div className="w-10" />
              )}
            </div>
          </div>
        </div>

        {/* Debug Panel */}
        {debugMode && showDebug && (
          <div className="bg-gray-900 text-white border-b border-default">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                <Wifi size={20} />
                Recipe Selection Debug Information
              </h3>
              <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
                {debugInfo.map((log, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-gray-400">[{log.timestamp}]</span>
                    <span className="text-gray-200">{log.message}</span>
                    {log.data && (
                      <span className="text-gray-500">
                        {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                      </span>
                    )}
                  </div>
                ))}
                {debugInfo.length === 0 && (
                  <div className="text-gray-400">No debug information yet...</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recipe Selection Content */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Feature 7: Resume cooking banner */}
          {showResumePrompt && savedSessionData && (
            <div className="mb-6 bg-accent-light border border-accent rounded-2xl p-4 transition-colors duration-200">
              <div className="flex items-start gap-3">
                <ChefHat size={24} className="text-accent flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-bold text-heading">Continue cooking?</h3>
                  <p className="text-sm text-body mt-1">
                    You were on step {(savedSessionData.currentStep || 0) + 1} of{' '}
                    {savedSessionData.recipeName || 'your recipe'}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleResumeSession}
                      className="flex-1 px-4 py-2.5 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
                    >
                      Resume
                    </button>
                    <button
                      onClick={handleDismissResume}
                      className="px-4 py-2.5 bg-background text-body rounded-xl font-medium hover:bg-background transition-colors active:scale-[0.98]"
                    >
                      Start Fresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {availableRecipes.length === 0 ? (
            <div className="text-center py-12">
              <ChefHat size={64} className="mx-auto text-muted mb-4" />
              <h2 className="text-xl font-semibold text-body mb-2">No meals planned yet</h2>
              <p className="text-muted mb-6">
                Pick meals in the Meal Planner and they'll show up here with step-by-step instructions.
              </p>
              <button
                onClick={() => onNavigate('meals')}
                className="px-6 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors font-medium"
              >
                Plan meals
              </button>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-display font-bold text-heading mb-2">Available Recipes</h2>
                <p className="text-body">
                  Select a recipe to view step-by-step cooking instructions
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableRecipes.map((meal, index) => (
                  <div key={meal.id || index} className="bg-surface rounded-2xl shadow-warm border border-default hover:shadow-warm-lg transition-shadow transition-colors duration-200">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <Utensils className="text-accent flex-shrink-0" size={24} />
                        {meal.totalTime && (
                          <div className="flex items-center gap-1 text-sm text-muted">
                            <Clock size={16} />
                            {meal.totalTime}
                          </div>
                        )}
                      </div>

                      <h3 className="text-lg font-semibold text-heading mb-2">
                        {meal.name}
                      </h3>

                      {meal.description && (
                        <p className="text-body text-sm mb-4 line-clamp-3">
                          {meal.description}
                        </p>
                      )}

                      <button
                        onClick={() => handleRecipeSelect(meal.recipeId || meal.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors font-medium"
                      >
                        <Play size={18} />
                        Start Cooking
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
}
