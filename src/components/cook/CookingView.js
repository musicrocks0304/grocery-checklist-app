import React from 'react';
import {
  ChevronLeft, ChevronRight, ArrowLeft, Clock, CheckCircle, Wifi,
  ChevronDown, ChevronUp, ChefHat, Play, Smartphone, Sun, Moon,
  Timer, Pause, X, List,
} from 'lucide-react';

const formatTimer = (totalSeconds) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function CookingView({
  kitchenMode, handleBackToSelection, activeRecipeData, currentStep, totalSteps,
  usingSampleData, wakeLockActive, showStepMenu, setShowStepMenu,
  handleToggleKitchenMode, debugMode, showDebug, setShowDebug, debugInfo,
  completedSteps, handleJumpToStep, handleToggleStepDrawer, showStepDrawer,
  setShowStepDrawer, showAllIngredients, setShowAllIngredients, showSwipeHint,
  handleTouchStart, handleTouchEnd, handleStepComplete, currentInstruction,
  parseTimeMinutes, handleStartTimer, handleNext, isLastStep, handlePrevious,
  isFirstStep, handleRecipeCompleteBack, timerRunning, timerSeconds,
  timerStepIndex, setCurrentStep, handlePauseResumeTimer, handleCancelTimer,
}) {
  return (
    <div className={`min-h-screen transition-colors duration-200 ${kitchenMode ? 'bg-gray-900' : 'bg-background'}`}>
      {/* Simplified Sticky Header (Feature 8) */}
      <div className={`sticky top-0 z-20 shadow-sm border-b ${
        kitchenMode ? 'bg-gray-800 border-gray-700' : 'bg-surface border-default'
      }`}>
        <div className="max-w-4xl mx-auto px-3 h-14 flex items-center gap-3">
          {/* Back arrow only */}
          <button
            onClick={handleBackToSelection}
            className={`p-2 -ml-1 rounded-xl transition-colors ${
              kitchenMode ? 'text-gray-300 hover:bg-gray-700' : 'text-body hover:bg-background'
            }`}
            aria-label="Go back"
          >
            <ArrowLeft size={22} />
          </button>

          {/* Recipe name + step indicator */}
          <div className="flex-1 min-w-0">
            <h1 className={`font-bold truncate ${
              kitchenMode ? 'text-white text-base' : 'text-heading text-sm'
            }`}>
              {activeRecipeData.recipe_name}
            </h1>
            <p className={`text-xs ${kitchenMode ? 'text-gray-400' : 'text-muted'}`}>
              Step {currentStep + 1} of {totalSteps}
              {usingSampleData && <span className="ml-2 text-amber-500 font-medium">(Sample)</span>}
            </p>
          </div>

          {/* Wake lock indicator */}
          {wakeLockActive && (
            <Smartphone size={16} className="text-primary flex-shrink-0" title="Screen stays on" />
          )}

          {/* Step menu toggle */}
          <button
            onClick={() => setShowStepMenu(prev => !prev)}
            className={`p-2 rounded-xl transition-colors ${
              showStepMenu
                ? (kitchenMode ? 'text-amber-400 bg-gray-700' : 'text-accent bg-accent-light')
                : (kitchenMode ? 'text-gray-300 hover:bg-gray-700' : 'text-muted hover:bg-background')
            }`}
            title="All Steps"
            aria-label="All steps"
          >
            <List size={20} />
          </button>

          {/* Kitchen mode toggle (Feature 9) */}
          <button
            onClick={handleToggleKitchenMode}
            className={`p-2 rounded-xl transition-colors ${
              kitchenMode
                ? 'text-amber-400 bg-gray-700 hover:bg-gray-600'
                : 'text-muted hover:bg-background'
            }`}
            title={kitchenMode ? 'Exit Kitchen Mode' : 'Kitchen Mode'}
            aria-label={kitchenMode ? 'Exit kitchen mode' : 'Enter kitchen mode'}
          >
            {kitchenMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Debug toggle */}
          {debugMode && (
            <button
              type="button"
              onClick={() => setShowDebug(!showDebug)}
              aria-label="Toggle debug log"
              aria-expanded={showDebug}
              className="flex items-center gap-1 text-sm text-muted hover:text-body min-h-[44px] min-w-[44px] justify-center"
            >
              <Wifi size={16} />
              {showDebug ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Debug Panel */}
      {debugMode && showDebug && (
        <div className="bg-gray-900 text-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Wifi size={20} />
              Recipe Instructions Debug Information
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

      {/* Step Navigation Menu (slide-down panel with all steps) */}
      {showStepMenu && (
        <div className={`border-b ${kitchenMode ? 'bg-gray-800 border-gray-700' : 'bg-surface border-default'}`}>
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-bold text-sm ${kitchenMode ? 'text-gray-300' : 'text-body'}`}>
                All Steps
              </h3>
              <span className={`text-xs ${kitchenMode ? 'text-gray-500' : 'text-muted'}`}>
                {completedSteps.size}/{totalSteps} done
              </span>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {activeRecipeData.instructions.map((step, index) => (
                <button
                  key={index}
                  onClick={() => { handleJumpToStep(index); setShowStepMenu(false); }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                    min-h-[48px] active:scale-[0.98] ${
                    index === currentStep
                      ? (kitchenMode
                          ? 'bg-amber-500/20 border border-amber-500/40'
                          : 'bg-accent-light border border-accent')
                      : completedSteps.has(index)
                        ? (kitchenMode
                            ? 'bg-gray-700/50 border border-gray-600'
                            : 'bg-primary-light border border-primary-border')
                        : (kitchenMode
                            ? 'bg-gray-700/30 border border-gray-700 hover:bg-gray-700/50'
                            : 'bg-background border border-default hover:bg-background')
                  }`}
                >
                  {/* Step number circle */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${
                    index === currentStep
                      ? (kitchenMode ? 'bg-amber-400 text-gray-900' : 'bg-accent text-white')
                      : completedSteps.has(index)
                        ? 'bg-primary text-white'
                        : (kitchenMode ? 'bg-gray-600 text-gray-400' : 'bg-default text-body')
                  }`}>
                    {completedSteps.has(index) ? <CheckCircle size={14} /> : index + 1}
                  </div>

                  {/* Step preview text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      index === currentStep
                        ? (kitchenMode ? 'text-amber-400' : 'text-accent')
                        : completedSteps.has(index)
                          ? (kitchenMode ? 'text-gray-500 line-through' : 'text-muted line-through')
                          : (kitchenMode ? 'text-gray-300' : 'text-body')
                    }`}>
                      {step.instruction.length > 60 ? step.instruction.substring(0, 60) + '...' : step.instruction}
                    </p>
                    <p className={`text-xs mt-0.5 ${kitchenMode ? 'text-gray-500' : 'text-muted'}`}>
                      {step.time}
                    </p>
                  </div>

                  {/* Current indicator */}
                  {index === currentStep && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                      kitchenMode ? 'bg-amber-400/20 text-amber-400' : 'bg-accent-light text-accent'
                    }`}>
                      Current
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compact Progress Bar with Expandable Drawer (Feature 5) */}
      <div className={`border-b ${kitchenMode ? 'bg-gray-800 border-gray-700' : 'bg-surface border-default'}`}>
        <div className="max-w-4xl mx-auto px-4 py-2">
          {/* Thin progress bar */}
          <div className={`h-1.5 rounded-full overflow-hidden ${kitchenMode ? 'bg-gray-700' : 'bg-default'}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                kitchenMode ? 'bg-amber-400' : 'bg-accent'
              }`}
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>

          {/* Step counter + expand toggle */}
          <button
            onClick={handleToggleStepDrawer}
            className={`w-full flex items-center justify-center gap-2 mt-1.5 py-1 text-sm font-medium transition-colors ${
              kitchenMode ? 'text-gray-400' : 'text-muted'
            }`}
          >
            <span>Step {currentStep + 1} of {totalSteps}</span>
            <span className="text-xs">({completedSteps.size} done)</span>
            {showStepDrawer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Expandable step drawer */}
          {showStepDrawer && (
            <div className="pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5 justify-center">
                {activeRecipeData.instructions.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => { handleJumpToStep(index); setShowStepDrawer(false); }}
                    className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                      index === currentStep
                        ? (kitchenMode
                            ? 'bg-amber-400 text-gray-900 scale-110'
                            : 'bg-accent text-white shadow-warm scale-110')
                        : completedSteps.has(index)
                          ? 'bg-primary text-white'
                          : (kitchenMode
                              ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                              : 'bg-default text-body hover:bg-default')
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* All Ingredients Panel (collapsible) */}
      {activeRecipeData?.allIngredients?.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-2">
          <button
            onClick={() => setShowAllIngredients(!showAllIngredients)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              kitchenMode
                ? 'bg-gray-800 text-amber-400 border border-gray-700'
                : 'bg-accent-light text-accent border border-accent'
            }`}
          >
            <span className="flex items-center gap-2">
              <List size={16} />
              All Ingredients ({activeRecipeData.allIngredients.length})
            </span>
            {showAllIngredients ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showAllIngredients && (
            <div className={`mt-2 rounded-xl p-4 ${
              kitchenMode
                ? 'bg-gray-800 border border-gray-700'
                : 'bg-surface border border-default'
            }`}>
              <ul className="space-y-1.5">
                {activeRecipeData.allIngredients.map((ing, i) => (
                  <li key={i} className={`flex items-start gap-2 text-sm ${
                    kitchenMode ? 'text-gray-200' : 'text-body'
                  }`}>
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      kitchenMode ? 'bg-amber-400' : 'bg-accent'
                    }`} />
                    {ing}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Swipe hint overlay (Feature 3) */}
      {showSwipeHint && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="bg-white/90 rounded-2xl px-6 py-3 shadow-warm text-center">
            <p className="text-body font-medium flex items-center gap-2">
              <ChevronLeft size={20} /> Swipe left or right to navigate <ChevronRight size={20} />
            </p>
          </div>
        </div>
      )}

      {/* Main Content - Swipeable area (Features 2, 3) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="max-w-4xl mx-auto px-4 py-4"
      >
        <div className={`rounded-2xl shadow-warm overflow-hidden transition-colors duration-200 ${
          kitchenMode ? 'bg-gray-800 border border-gray-700' : 'bg-surface'
        }`}>
          {/* Step Header */}
          <div className={`p-5 ${
            kitchenMode
              ? 'bg-gray-800 border-b border-gray-700'
              : 'bg-accent'
          } text-white`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className={`font-bold ${kitchenMode ? 'text-2xl text-amber-400' : 'text-xl'}`}>
                  Step {currentStep + 1}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <Clock size={16} className={kitchenMode ? 'text-gray-400' : 'text-white/70'} />
                  <span className={`text-sm ${kitchenMode ? 'text-gray-400' : 'text-white/70'}`}>
                    {currentInstruction.time}
                  </span>
                </div>
              </div>

              <button
                onClick={handleStepComplete}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all
                  min-h-[48px] active:scale-[0.98] ${
                  completedSteps.has(currentStep)
                    ? 'bg-primary text-white'
                    : (kitchenMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-white/20 text-white hover:bg-white/30')
                }`}
              >
                <CheckCircle size={18} />
                {completedSteps.has(currentStep) ? 'Done' : 'Complete'}
              </button>
            </div>

            {/* Timer button (Feature 6) - only if step has time > 0 */}
            {parseTimeMinutes(currentInstruction) > 0 && (
              <button
                onClick={handleStartTimer}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                  font-medium min-h-[48px] active:scale-[0.98] transition-all ${
                  kitchenMode
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-white/20 text-white border border-white/30 hover:bg-white/30'
                }`}
              >
                <Timer size={18} />
                Start {currentInstruction.time} Timer
              </button>
            )}
          </div>

          {/* Instruction Text (Feature 2: Larger Text) */}
          <div className={`p-5 ${kitchenMode ? 'bg-gray-800' : ''}`}>
            <p className={`leading-relaxed font-medium ${
              kitchenMode
                ? 'text-2xl md:text-3xl text-white'
                : 'text-xl md:text-2xl text-body'
            }`}>
              {currentInstruction.instruction}
            </p>
          </div>

          {/* Ingredients for this step */}
          {currentInstruction.ingredients && currentInstruction.ingredients.length > 0 && (
            <div className="px-5 pb-5">
              <div className={`rounded-xl p-4 ${
                kitchenMode
                  ? 'bg-gray-700 border border-gray-600'
                  : 'bg-accent-light border border-accent'
              }`}>
                <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
                  kitchenMode ? 'text-amber-400' : 'text-accent'
                }`}>
                  <ChefHat size={16} />
                  Ingredients for this step:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {currentInstruction.ingredients.map((ingredient, index) => (
                    <span
                      key={index}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full font-medium ${
                        kitchenMode
                          ? 'text-sm bg-surface text-heading border border-default'
                          : 'text-sm bg-accent-light text-accent border border-accent'
                      }`}
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation - Stacked vertically (Feature 2: Large Touch Targets) */}
          <div className={`px-5 py-4 space-y-3 ${
            kitchenMode ? 'bg-gray-900' : 'bg-background'
          }`}>
            {/* Next button (primary, on top) */}
            <button
              onClick={handleNext}
              disabled={isLastStep}
              className={`w-full flex items-center justify-center gap-2 min-h-[56px] rounded-xl
                font-bold text-lg transition-all active:scale-[0.98] ${
                isLastStep
                  ? (kitchenMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-default text-muted cursor-not-allowed')
                  : (kitchenMode
                      ? 'bg-amber-500 text-gray-900 hover:bg-amber-400'
                      : 'bg-accent text-white hover:bg-accent-hover')
              }`}
            >
              Next Step
              <ChevronRight size={22} />
            </button>

            {/* Previous button (secondary, below) */}
            <button
              onClick={handlePrevious}
              disabled={isFirstStep}
              className={`w-full flex items-center justify-center gap-2 min-h-[56px] rounded-xl
                font-medium text-lg transition-all active:scale-[0.98] ${
                isFirstStep
                  ? (kitchenMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-default text-muted cursor-not-allowed')
                  : (kitchenMode
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                      : 'bg-heading text-white hover:bg-heading')
              }`}
            >
              <ChevronLeft size={22} />
              Previous Step
            </button>
          </div>
        </div>

        {/* Recipe Complete */}
        {completedSteps.size === totalSteps && totalSteps > 0 && (
          <div className={`mt-4 rounded-2xl p-6 text-center transition-colors duration-200 ${
            kitchenMode
              ? 'bg-gray-800 border border-green-500/30'
              : 'bg-primary-light border border-primary-border'
          }`}>
            <CheckCircle size={48} className="text-primary mx-auto mb-4" />
            <h3 className={`text-xl font-display font-bold mb-2 ${kitchenMode ? 'text-green-400' : 'text-primary'}`}>
              Recipe Complete!
            </h3>
            <p className={kitchenMode ? 'text-gray-400' : 'text-primary'}>
              You've finished preparing {activeRecipeData.recipe_name}. Enjoy your meal!
            </p>
            <button
              onClick={handleRecipeCompleteBack}
              className="mt-4 w-full min-h-[56px] px-6 py-3 bg-primary text-white rounded-xl
                hover:bg-primary-hover transition-colors font-bold text-lg active:scale-[0.98]"
            >
              Back to Grocery List
            </button>
          </div>
        )}
      </div>

      {/* Floating Timer Pill (Feature 6) */}
      {(timerRunning || timerSeconds > 0) && (
        <div style={{ bottom: 'calc(var(--tab-bar-height) + 0.5rem)' }} className={`fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
          px-4 py-3 rounded-full shadow-warm-lg ${
          kitchenMode ? 'bg-gray-800 border border-amber-500/50' : 'bg-surface border border-accent'
        }`}>
          {/* Timer display */}
          <span className={`font-mono text-xl font-bold ${
            timerSeconds <= 30 && timerSeconds > 0
              ? 'text-danger animate-pulse'
              : (kitchenMode ? 'text-amber-400' : 'text-accent')
          }`}>
            {formatTimer(timerSeconds)}
          </span>

          {/* Step label (only if not on timer step) */}
          {timerStepIndex !== null && timerStepIndex !== currentStep && (
            <button
              onClick={() => setCurrentStep(timerStepIndex)}
              className={`text-xs font-medium underline ${
                kitchenMode ? 'text-gray-400' : 'text-muted'
              }`}
            >
              Step {timerStepIndex + 1}
            </button>
          )}

          {/* Pause/Resume */}
          <button
            onClick={handlePauseResumeTimer}
            className={`p-1.5 rounded-full transition-colors ${
              kitchenMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-background text-body'
            }`}
          >
            {timerRunning ? <Pause size={18} /> : <Play size={18} />}
          </button>

          {/* Cancel */}
          <button
            onClick={handleCancelTimer}
            className={`p-1.5 rounded-full transition-colors ${
              kitchenMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-background text-muted'
            }`}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
