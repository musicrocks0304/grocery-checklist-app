import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Animated dark mode toggle button.
 * Uses the ThemeContext to toggle between light and dark mode.
 */
const ThemeToggle = ({ className = '' }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-xl transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center ${
        isDark
          ? 'bg-surface-elevated text-accent hover:bg-sidebar-hover'
          : 'bg-background text-body hover:bg-surface'
      } ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
};

export default ThemeToggle;
