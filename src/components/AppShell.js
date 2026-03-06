import React from "react";
import Sidebar from "./Sidebar";
import BottomTabBar from "./BottomTabBar";

/**
 * App layout shell — combines desktop sidebar + mobile bottom tab bar.
 *
 * Desktop (>= lg): Sidebar on left, main content fills remaining space.
 * Mobile (< lg): Bottom tab bar, main content fills viewport with bottom padding.
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

      {/* Main content */}
      <main className="flex-1 pb-24 lg:pb-0 min-w-0">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <BottomTabBar
        currentScreen={currentScreen}
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default AppShell;
