import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Desktop-only sidebar navigation.
 * Hidden on mobile (< lg) — bottom tab bar handles mobile navigation.
 */
const Sidebar = ({
  currentScreen,
  setCurrentScreen,
  navigation,
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-sidebar-bg border-r border-sidebar-border transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center h-16 px-6 border-b border-sidebar-border">
        <h2 className="text-xl font-bold text-heading font-display">
          Grocery Planner
        </h2>
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl font-medium transition-all duration-200 min-h-[44px] ${
                isActive
                  ? "bg-sidebar-active text-primary font-semibold"
                  : "text-sidebar-text hover:bg-sidebar-hover"
              }`}
            >
              {isActive && (
                <div className="w-1 h-6 bg-primary rounded-full -ml-1 mr-1" />
              )}
              <div
                className={`p-1.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10"
                    : "bg-transparent"
                }`}
              >
                <Icon size={20} />
              </div>
              <span className="text-sm">
                {item.name}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Theme toggle + footer */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sidebar-text-muted hover:bg-sidebar-hover hover:text-sidebar-text transition-all duration-200 min-h-[44px]"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
          <span className="text-sm font-medium">
            {isDark ? "Light Mode" : "Dark Mode"}
          </span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
