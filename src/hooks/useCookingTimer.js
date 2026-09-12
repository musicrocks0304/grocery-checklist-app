import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

export default function useCookingTimer() {
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStepIndex, setTimerStepIndex] = useState(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setTimerRunning(false);
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
            toast.success('Timer complete! This step is done.', {
              duration: 6000,
              style: { fontSize: '16px', fontWeight: 'bold' },
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  const startTimer = (minutes, stepIndex) => {
    if (minutes <= 0) return;
    if (timerRunning) {
      const confirmed = window.confirm('A timer is already running. Replace it?');
      if (!confirmed) return;
    }
    setTimerSeconds(minutes * 60);
    setTimerStepIndex(stepIndex);
    setTimerRunning(true);
    toast(`Timer started: ${minutes} minute${minutes !== 1 ? 's' : ''}`, { duration: 2000 });
  };

  const pauseResumeTimer = () => {
    setTimerRunning(prev => !prev);
  };

  const cancelTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerStepIndex(null);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Back currently resets state and lets effect cleanup clear the interval.
  // Keep this separate from the explicit timer Cancel action above.
  const resetTimerState = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerStepIndex(null);
  };

  const restorePausedTimer = (seconds, stepIndex) => {
    setTimerSeconds(seconds);
    setTimerStepIndex(stepIndex);
    setTimerRunning(false);
  };

  return {
    timerSeconds, timerRunning, timerStepIndex,
    startTimer, pauseResumeTimer, cancelTimer, resetTimerState, restorePausedTimer,
  };
}
