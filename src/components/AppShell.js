import React from "react";
import { Home, MessageSquarePlus } from "lucide-react";
import Sidebar from "./Sidebar";
import BottomTabBar from "./BottomTabBar";
import { ThemeToggle } from "./ui";
import { useHeader } from "../contexts/HeaderContext";
import { useFeedback } from "../contexts/FeedbackContext";

/**
 * App layout shell — combines desktop sidebar + mobile bottom tab bar.
 *
 * Desktop (>= lg): Sidebar on left, main content fills remaining space.
 * Mobile (< lg): Header with home link + bottom tab bar, main content fills viewport.
 *
 * The mobile header supports a center slot via HeaderContext — child screens
 * (e.g. Meals) can inject content (like tab pills) to save vertical space.
 */
const AppShell = ({ currentScreen, onNavigate, navigation, children }) => {
  const { headerContent } = useHeader();
  const { openFeedback } = useFeedback();

  return (
    <div className="flex h-screen bg-background transition-colors duration-200">
      {/* Desktop sidebar */}
      <Sidebar
        currentScreen={currentScreen}
        setCurrentScreen={onNavigate}
        navigation={navigation}
      />

      {/* Main content area — lg:ml-64 offsets for the fixed sidebar */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Mobile header — supports injected center content via HeaderContext */}
        <header className="lg:hidden flex items-center justify-between h-12 px-3 bg-surface/95 backdrop-blur-md border-b border-default sticky top-0 z-30">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center shrink-0 min-h-[44px] text-heading hover:text-primary transition-colors duration-200"
          >
            <Home size={20} />
          </button>

          {headerContent ? (
            <div className="flex-1 min-w-0 overflow-hidden flex justify-center mx-2">{headerContent}</div>
          ) : (
            <span className="text-base font-bold font-display text-heading">Grocery Planner</span>
          )}

          <div className="shrink-0 flex items-center gap-0.5">
            <button
              onClick={openFeedback}
              aria-label="Send feedback"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-body hover:text-heading"
            >
              <MessageSquarePlus size={20} />
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-auto">
          {children}
        </main>

        {/* Mobile bottom tab bar — flex child, not fixed, takes natural height */}
        <BottomTabBar
          currentScreen={currentScreen}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
};

export default AppShell;
