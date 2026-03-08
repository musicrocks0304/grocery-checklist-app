import React from "react";
import { Home } from "lucide-react";
import Sidebar from "./Sidebar";
import BottomTabBar from "./BottomTabBar";
import { ThemeToggle } from "./ui";

/**
 * App layout shell — combines desktop sidebar + mobile bottom tab bar.
 *
 * Desktop (>= lg): Sidebar on left, main content fills remaining space.
 * Mobile (< lg): Header with home link + bottom tab bar, main content fills viewport.
 */
const AppShell = ({ currentScreen, onNavigate, navigation, children }) => {
  return (
    <div className="flex min-h-screen bg-background transition-colors duration-200">
      {/* Desktop sidebar */}
      <Sidebar
        currentScreen={currentScreen}
        setCurrentScreen={onNavigate}
        navigation={navigation}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with home link */}
        <header className="lg:hidden flex items-center justify-between h-12 px-4 bg-surface/95 backdrop-blur-md border-b border-default sticky top-0 z-30">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-2 min-h-[44px] text-heading hover:text-primary transition-colors duration-200"
          >
            <Home size={20} />
            <span className="text-base font-bold font-display">Grocery Planner</span>
          </button>
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main className="flex-1 pb-24 lg:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar
        currentScreen={currentScreen}
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default AppShell;
