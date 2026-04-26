import React, { useState, useEffect, useCallback, useRef } from "react";
import { ClipboardList, UtensilsCrossed, Tag, Store, ShoppingBag, ChefHat } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getWeekDates } from "../utils/weekDates";
import { pageTransition } from "../utils/animations";
import { ENDPOINTS, apiFetch, normalizeDbMeals } from "../config/api";
import { ensureStorageVersion } from "../utils/storageVersion";
import { ThemeProvider } from "../contexts/ThemeContext";
import { HeaderProvider } from "../contexts/HeaderContext";
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
import FeedbackFAB from "./FeedbackFAB";

// Screens that need fixed-height layout (flex column with internal scroll)
// — chat interfaces pin input at bottom, so they need a defined container height
const FULL_HEIGHT_SCREENS = new Set(["meals", "chatbot", "meal-creator"]);

// New primary screen IDs + legacy IDs still routable during transition
const VALID_SCREENS = [
  // New flow screens
  "home", "plan", "meals", "deals", "cart", "shop", "cook",
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
  { id: "plan", name: "Grocery List", icon: ClipboardList },
  { id: "meals", name: "Meal Planning", icon: UtensilsCrossed },
  { id: "deals", name: "Deals & Coupons", icon: Tag },
  { id: "cart", name: "HEB Cart Builder", icon: Store },
  { id: "shop", name: "Shop In-Store", icon: ShoppingBag },
  { id: "cook", name: "Cook Recipes", icon: ChefHat },
];

// Partner invite: when a URL is opened with hash `#join/CODE`, extract the
// code so App can call the join webhook before any regular screen renders.
const extractJoinCode = () => {
  const hash = window.location.hash.replace("#", "");
  if (hash.startsWith("join/")) return hash.slice(5).trim().toUpperCase() || null;
  return null;
};

const JOINED_SESSION_STORAGE_KEY = "joinedShoppingSession";

const App = () => {
  const [debugMode] = useState(isDebugMode);
  const [joinState, setJoinState] = useState(() => (extractJoinCode() ? "joining" : "idle"));
  const [joinError, setJoinError] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash.startsWith("join/")) return "home"; // placeholder; join effect redirects to #shop
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
  const [mealsLoading, setMealsLoading] = useState(true); // eslint-disable-line no-unused-vars
  const [groceryListData, setGroceryListData] = useState(null);
  const [inStoreData, setInStoreData] = useState(null);
  const hasUnsavedChangesRef = useRef(false);

  const setHasUnsavedChanges = useCallback((value) => {
    hasUnsavedChangesRef.current = value;
  }, []);

  useEffect(() => {
    ensureStorageVersion();
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
    document.querySelector('main')?.scrollTo(0, 0);
  }, []);

  const handleStartShopping = useCallback((data) => {
    setInStoreData(data);
    localStorage.setItem("inStoreShoppingList", JSON.stringify(data));
    navigateToScreen("shop");
  }, [navigateToScreen]);

  // Partner invite: if URL hash is #join/CODE, validate the code via the
  // join_session webhook, stash the session in sessionStorage, and redirect
  // to #shop. Runs once on mount — the initial joinState='joining' means
  // App renders a blocking loading view until this resolves.
  useEffect(() => {
    const code = extractJoinCode();
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(ENDPOINTS.joinSession);
        url.searchParams.append("code", code);
        const res = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          timeout: 8000,
          retries: 1,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.found && data.week_start_date) {
          sessionStorage.setItem(
            JOINED_SESSION_STORAGE_KEY,
            JSON.stringify({
              code: data.code,
              week_start_date: data.week_start_date,
              expires_at: data.expires_at,
            })
          );
          setJoinState("idle");
          setCurrentScreen("shop");
          window.history.replaceState({ screen: "shop" }, "", "#shop");
        } else {
          setJoinError("That invite is invalid or expired.");
          setJoinState("error");
        }
      } catch (err) {
        if (cancelled) return;
        setJoinError("Couldn't reach the server — check your connection and try again.");
        setJoinState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Browser back/forward button support
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") || "home";
    // Skip the URL normalization when arriving via `#join/CODE` — the
    // partner-invite effect above reads the code then rewrites the URL to
    // `#shop` itself. Still wire up popstate so back/forward work afterward.
    if (!hash.startsWith("join/")) {
      const initialScreen = LEGACY_REDIRECT[hash] || (VALID_SCREENS.includes(hash) ? hash : "home");
      window.history.replaceState({ screen: initialScreen }, "", `#${initialScreen}`);
    }

    const handlePopState = (event) => {
      const screen = event.state?.screen || "home";
      if (VALID_SCREENS.includes(screen)) {
        setCurrentScreen(LEGACY_REDIRECT[screen] || screen);
      } else {
        setCurrentScreen("home");
      }
      document.querySelector('main')?.scrollTo(0, 0);
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
              onClick={() => {
                setJoinState("idle");
                setJoinError(null);
                window.history.replaceState({ screen: "home" }, "", "#home");
                setCurrentScreen("home");
              }}
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
        {toaster}
        <InStoreMode
          inStoreData={inStoreData}
          onExit={() => navigateToScreen("plan")}
        />
        <FeedbackFAB currentScreen={currentScreen} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
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
        <FeedbackFAB currentScreen={currentScreen} />
      </HeaderProvider>
    </ThemeProvider>
  );
};

export default App;
