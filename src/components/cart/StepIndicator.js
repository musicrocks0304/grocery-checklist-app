import React from 'react';
import { Check } from 'lucide-react';

// ─── Step indicator ─────────────────────────────────────────────
const STEPS = [
  { id: 'connect', label: 'Connect' },
  { id: 'review', label: 'Match & Review' },
  { id: 'build', label: 'Build Cart' },
];

const StepIndicator = ({ currentStep }) => {
  const stepIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="flex items-center gap-1 sm:gap-2 mb-6">
      {STEPS.map((step, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex;
        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div className={`flex-1 h-0.5 ${isDone ? 'bg-primary' : 'bg-default'}`} />
            )}
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5 w-[72px] sm:w-auto text-center sm:text-left flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isDone ? 'bg-primary text-white' :
                isActive ? 'bg-primary text-white ring-2 ring-primary ring-offset-2' :
                'bg-default text-muted'
              }`}>
                {isDone ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-[11px] sm:text-sm font-medium leading-tight ${
                isActive ? 'text-heading' : isDone ? 'text-primary' : 'text-muted'
              }`}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default StepIndicator;
