import React, { useState, useEffect, useCallback, useRef } from "react";
import { ClipboardList, Tag, Store, ShoppingBag, ChefHat } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getWeekDates } from "../utils/weekDates";
import { pageTransition } from "../utils/animations";
import { ENDPOINTS, apiFetch, normalizeDbMeals } from "../config/api";
import { ThemeProvider } from "../contexts/ThemeContext";
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

// New primary screen IDs + legacy IDs still routable during transition
const VALID_SCREENS = [
  // New flow screens
  "home", "plan", "deals", "cart", "shop", "cook",
  // Legacy IDs — still routable for internal navigation during phased migration
  "grocery", "chatbot", "meal-creator", "recipe-ingredients", "recipe-instructions",
  "in-store", "coupons", "heb-cart", "smart-deals",
];

// Map legacy hash IDs to new screen IDs for URL normalization
const LEGACY_REDIRECT = {
  grocery: "plan",
  "smart-deals": "deals",
  "heb-cart": "cart",
  "in-store": "shop",
  "recipe-instructions": "cook",
};

// Only show debug panels when ?debug=true is in the URL
const isDebugMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

// Navigation list for the desktop sidebar (new flow)
const navigation = [
  { id: "plan", name: "Plan Meals & List", icon: ClipboardList },
  { id: "deals", name: "Deals & Coupons", icon: Tag },
  { id: "cart", name: "HEB Cart Builder", icon: Store },
  { id: "shop", name: "Shop In-Store", icon: ShoppingBag },
  { id: "cook", name: "Cook Recipes", icon: ChefHat },
];

const App = () => {
  const [debugMode] = useState(isDebugMode);
  const [currentScreen, setCurrentScreen] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    // Redirect legacy hashes to new screen IDs
    const redirected = LEGACY_REDIRECT[hash];
    if (redirected) return redirected;
    return VALID_SCREENS.includes(hash) ? hash : "home";
  });
  const [selectedMeals, setSelectedMeals] = useState(() => {
    try {
      const weekKey = `selectedMeals_${getWeekDates().startDate}`;
      const stored = localStorage.getItem(weekKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [mealsLoading, setMealsLoading] = useState(true);
  const [groceryListData, setGroceryListData] = useState(null);
  const [inStoreData, setInStoreData] = useState(null);
  const hasUnsavedChangesRef = useRef(false);

  const setHasUnsavedChanges = useCallback((value) => {
    hasUnsavedChangesRef.current = value;
  }, []);

  // Shared helper: fetch meals from DB, normalize, and cache to localStorage
  const loadMealsFromDb = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setMealsLoading(true);
    try {
      const weekData = getWeekDates();
      const url = new URL(ENDPOINTS.fetchWeeklyMeals);
      url.searchParams.append("weekDateRange", weekData.displayRange);
      const response = await apiFetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        const normalized = normalizeDbMeals(data);
        setSelectedMeals(normalized);
        const weekKey = `selectedMeals_${weekData.startDate}`;
        if (normalized.length > 0) {
          localStorage.setItem(weekKey, JSON.stringify(normalized));
        } else {
          localStorage.removeItem(weekKey);
        }
      }
    } catch {
      // Keep stale localStorage data on network failure
    } finally {
      if (showLoading) setMealsLoading(false);
    }
  }, []);

  // Fetch selectedMeals from DB on mount (stale-while-revalidate)
  useEffect(() => { loadMealsFromDb({ showLoading: true }); }, [loadMealsFromDb]);

  // Callback for children to refresh meals from DB after mutations
  const refreshMeals = useCallback(() => loadMealsFromDb(), [loadMealsFromDb]);

  // Navigate with unsaved-changes confirmation and browser history push
  const navigateToScreen = useCallback((screen) => {
    // Redirect legacy IDs to new ones
    const target = LEGACY_REDIRECT[screen] || screen;

    if (hasUnsavedChangesRef.current) {
      const confirmed = window.confirm(
        "You have unsaved changes that will be lost. Are you sure you want to leave?"
      );
      if (!confirmed) return;
      hasUnsavedChangesRef.current = false;
    }
    setCurrentScreen(target);
    window.history.pushState({ screen: target }, "", `#${target}`);
    window.scrollTo(0, 0);
  }, []);

  const handleStartShopping = useCallback((data) => {
    setInStoreData(data);
    localStorage.setItem("inStoreShoppingList", JSON.stringify(data));
    navigateToScreen("shop");
  }, [navigateToScreen]);

  // Browser back/forward button support
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") || "home";
    const initialScreen = LEGACY_REDIRECT[hash] || (VALID_SCREENS.includes(hash) ? hash : "home");
    window.history.replaceState({ screen: initialScreen }, "", `#${initialScreen}`);

    const handlePopState = (event) => {
      const screen = event.state?.screen || "home";
      if (VALID_SCREENS.includes(screen)) {
        setCurrentScreen(LEGACY_REDIRECT[screen] || screen);
      } else {
        setCurrentScreen("home");
      }
      window.scrollTo(0, 0);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

      // --- Plan tab (unified Meals + Grocery List) ---
      case "plan":
        return (
          <Plan
            onNavigate={navigateToScreen}
            onUnsavedChanges={setHasUnsavedChanges}
            onStartShopping={handleStartShopping}
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
            onBack={() => navigateToScreen("plan")}
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
            onBack={() => navigateToScreen("plan")}
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
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

  // Shop screen (InStoreMode) renders fullscreen without navigation chrome
  if (currentScreen === "shop") {
    return (
      <ThemeProvider>
        {toaster}
        <InStoreMode
          inStoreData={inStoreData}
          onExit={() => navigateToScreen("plan")}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {toaster}
      <AppShell
        currentScreen={currentScreen}
        onNavigate={navigateToScreen}
        navigation={navigation}
      >
        <div className="lg:ml-64">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentScreen}
              initial={pageTransition.initial}
              animate={pageTransition.animate}
              exit={pageTransition.exit}
              transition={pageTransition.transition}
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </div>
      </AppShell>
    </ThemeProvider>
  );
};

export default App;
