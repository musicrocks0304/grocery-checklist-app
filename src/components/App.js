import React, { useState, useEffect, useCallback, useRef } from "react";
import { ClipboardList, UtensilsCrossed, Tag, Store, ShoppingBag, ChefHat } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getWeekDates } from "../utils/weekDates";
import { pageTransition } from "../utils/animations";
import { ensureStorageVersion, gcWeekScopedKeys } from "../utils/storageVersion";
import useHashRoute from "../hooks/useHashRoute";
import useWeeklyMeals from "../hooks/useWeeklyMeals";
import { ThemeProvider } from "../contexts/ThemeContext";
import { HeaderProvider } from "../contexts/HeaderContext";
import { FeedbackProvider } from "../contexts/FeedbackContext";
import AppShell from "./AppShell";
import Home from "./Home";
import ChatBot from "./ChatBot";
import RecipeIngredients from "./RecipeIngredients";
import RecipeInstructions from "./RecipeInstructions";
import InStoreMode from "./InStoreMode";
import MealCreator from "./MealCreator";
import Coupons from "./Coupons";
import HebCart from "./HebCart";
import Deals from "./Deals";
import Plan from "./Plan";
import Meals from "./Meals";

// Screens that need fixed-height layout (flex column with internal scroll)
// — chat interfaces pin input at bottom, so they need a defined container height
const FULL_HEIGHT_SCREENS = new Set(["meals", "chatbot", "meal-creator"]);

// Only show debug panels when ?debug=true is in the URL
const isDebugMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

// Navigation list for the desktop sidebar (new flow)
const navigation = [
  { id: "plan", name: "Grocery List", icon: ClipboardList },
  { id: "meals", name: "Meal Planning", icon: UtensilsCrossed },
  { id: "deals", name: "Deals & Coupons", icon: Tag },
  { id: "cart", name: "HEB Cart Builder", icon: Store },
  { id: "shop", name: "Shop In-Store", icon: ShoppingBag },
  { id: "cook", name: "Cook Recipes", icon: ChefHat },
];

const App = () => {
  const [debugMode] = useState(isDebugMode);
  const hasUnsavedChangesRef = useRef(false);
  const {
    currentScreen, joinState, joinError, navigateToScreen, goHomeFromJoin,
    resolveJoin, listenForRoutes,
  } = useHashRoute({ hasUnsavedChangesRef });
  const { selectedMeals, setSelectedMeals, loadMealsFromDb, refreshMeals } = useWeeklyMeals();
  const [groceryListData, setGroceryListData] = useState(null);
  const [inStoreData, setInStoreData] = useState(null);

  const setHasUnsavedChanges = useCallback((value) => {
    hasUnsavedChangesRef.current = value;
  }, []);

  useEffect(() => {
    ensureStorageVersion();
    gcWeekScopedKeys();
  }, []);

  // Week boundary detection — the week flips at Thursday 00:00 local
  // (getWeekDates). This PWA routinely stays resident across that boundary;
  // without a reload every screen keeps showing last week's data while new
  // mutations write to the new week. Lives here (not just Home) so ALL
  // screens benefit. Defers while an edit is unsaved; the next tick catches it.
  const weekStartRef = useRef(getWeekDates().startDate);
  useEffect(() => {
    const checkWeekBoundary = setInterval(() => {
      const currentStart = getWeekDates().startDate;
      if (currentStart !== weekStartRef.current && !hasUnsavedChangesRef.current) {
        weekStartRef.current = currentStart;
        window.location.reload();
      }
    }, 60000);
    return () => clearInterval(checkWeekBoundary);
  }, []);

  // Fetch selectedMeals from DB on mount (stale-while-revalidate)
  useEffect(() => { loadMealsFromDb({ showLoading: true }); }, [loadMealsFromDb]);

  const handleStartShopping = useCallback((data) => {
    setInStoreData(data);
    localStorage.setItem("inStoreShoppingList", JSON.stringify(data));
    navigateToScreen("shop");
  }, [navigateToScreen]);

  // Partner invite: if URL hash is #join/CODE, validate the code via the
  // join_session webhook, stash the session in sessionStorage, and redirect
  // to #shop. Runs once on mount — the initial joinState='joining' means
  // App renders a blocking loading view until this resolves.
  useEffect(resolveJoin, [resolveJoin]);

  // Browser back/forward button support + hashes typed/pasted into an open tab
  useEffect(listenForRoutes, [listenForRoutes]);

  const toaster = (
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontWeight: 500,
          borderRadius: '1rem',
          background: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        },
        success: { duration: 3000 },
        error: { duration: 4000 },
      }}
    />
  );

  // Render the active screen content
  const renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return (
          <Home
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
          />
        );

      // --- Plan tab (Grocery List) ---
      case "plan":
        return (
          <Plan
            onNavigate={navigateToScreen}
            onUnsavedChanges={setHasUnsavedChanges}
            onStartShopping={handleStartShopping}
            debugMode={debugMode}
          />
        );

      // --- Meals tab (AI Meal Planner + Create Recipe) ---
      case "meals":
        return (
          <Meals
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        );

      // Legacy meal screens — still routable for internal navigation
      case "chatbot":
        return (
          <ChatBot
            onBack={() => navigateToScreen("meals")}
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        );
      case "meal-creator":
        return (
          <MealCreator
            onBack={() => navigateToScreen("meals")}
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        );
      case "recipe-ingredients":
        return (
          <RecipeIngredients
            selectedMeals={selectedMeals}
            onNavigate={navigateToScreen}
            groceryListData={groceryListData}
            debugMode={debugMode}
          />
        );

      // --- Deals tab (unified Smart Deals + All Coupons) ---
      case "deals":
        return (
          <Deals
            onNavigate={navigateToScreen}
          />
        );
      // Legacy coupons screen — still routable for internal navigation
      case "coupons":
        return (
          <Coupons
            onNavigate={navigateToScreen}
          />
        );

      // --- Cart tab ---
      case "cart":
        return (
          <HebCart
            onNavigate={navigateToScreen}
          />
        );

      // --- Cook tab (Phase 1: routes to RecipeInstructions) ---
      case "cook":
        return (
          <RecipeInstructions
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            debugMode={debugMode}
          />
        );

      default:
        return (
          <Home
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
          />
        );
    }
  };

  // Partner join: block the app while we resolve the invite code. A fresh
  // partner hitting #join/CODE sees this briefly before redirect to #shop.
  if (joinState === "joining") {
    return (
      <ThemeProvider>
        {toaster}
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full border-2 border-default border-t-primary animate-spin mx-auto mb-4" />
            <p className="text-body">Joining shopping session…</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (joinState === "error") {
    return (
      <ThemeProvider>
        {toaster}
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-sm bg-surface border border-default rounded-2xl p-6 text-center shadow-warm">
            <h2 className="text-lg font-bold text-heading mb-2">Can't join</h2>
            <p className="text-sm text-body mb-5">{joinError}</p>
            <button
              type="button"
              onClick={goHomeFromJoin}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-hover"
            >
              Go home
            </button>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Shop screen (InStoreMode) renders fullscreen without navigation chrome
  if (currentScreen === "shop") {
    return (
      <ThemeProvider>
        <FeedbackProvider currentScreen={currentScreen}>
          {toaster}
          <InStoreMode
            inStoreData={inStoreData}
            onExit={() => navigateToScreen("plan")}
          />
        </FeedbackProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <FeedbackProvider currentScreen={currentScreen}>
        <HeaderProvider>
          {toaster}
          <AppShell
            currentScreen={currentScreen}
            onNavigate={navigateToScreen}
            navigation={navigation}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentScreen}
                className={FULL_HEIGHT_SCREENS.has(currentScreen) ? "h-full" : ""}
                initial={pageTransition.initial}
                animate={pageTransition.animate}
                exit={pageTransition.exit}
                transition={pageTransition.transition}
              >
                {renderScreen()}
              </motion.div>
            </AnimatePresence>
          </AppShell>
        </HeaderProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
};

export default App;
