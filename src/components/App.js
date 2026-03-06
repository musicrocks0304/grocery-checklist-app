import React, { useState, useEffect, useCallback, useRef } from "react";
import { ShoppingCart, MessageCircle, ChefHat, ShoppingBag, Sparkles, Store, Tag, BookOpen, Receipt } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getWeekDates } from "../utils/weekDates";
import { pageTransition } from "../utils/animations";
import { ThemeProvider } from "../contexts/ThemeContext";
import AppShell from "./AppShell";
import ChatBot from "./ChatBot";
import RecipeIngredients from "./RecipeIngredients";
import RecipeInstructions from "./RecipeInstructions";
import GroceryChecklist from "./GroceryChecklist";
import InStoreMode from "./InStoreMode";
import MealCreator from "./MealCreator";
import Coupons from "./Coupons";
import HebCart from "./HebCart";
import SmartDeals from "./SmartDeals";

const VALID_SCREENS = ["grocery", "chatbot", "meal-creator", "recipe-ingredients", "recipe-instructions", "in-store", "coupons", "heb-cart", "smart-deals"];

// Only show debug panels when ?debug=true is in the URL
const isDebugMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

// Full navigation list for the desktop sidebar
const navigation = [
  { id: "grocery", name: "Weekly Grocery Selection", icon: ShoppingCart },
  { id: "in-store", name: "In Store Mode", icon: ShoppingBag },
  { id: "chatbot", name: "AI Meal Planner", icon: MessageCircle },
  { id: "meal-creator", name: "AI Meal Creator", icon: Sparkles },
  { id: "recipe-instructions", name: "Recipe Instructions", icon: ChefHat },
  { id: "recipe-ingredients", name: "Ingredients", icon: BookOpen },
  { id: "heb-cart", name: "HEB Cart Builder", icon: Store },
  { id: "smart-deals", name: "Smart Deals", icon: Tag },
  { id: "coupons", name: "Coupons", icon: Receipt },
];

const App = () => {
  const [debugMode] = useState(isDebugMode);
  const [currentScreen, setCurrentScreen] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return VALID_SCREENS.includes(hash) ? hash : "grocery";
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
  const [groceryListData, setGroceryListData] = useState(null);
  const [inStoreData, setInStoreData] = useState(null);
  const hasUnsavedChangesRef = useRef(false);

  const setHasUnsavedChanges = useCallback((value) => {
    hasUnsavedChangesRef.current = value;
  }, []);

  // Persist selectedMeals to localStorage (keyed by week so it auto-resets)
  useEffect(() => {
    try {
      const weekKey = `selectedMeals_${getWeekDates().startDate}`;
      if (selectedMeals.length > 0) {
        localStorage.setItem(weekKey, JSON.stringify(selectedMeals));
      } else {
        localStorage.removeItem(weekKey);
      }
    } catch { /* ignore storage errors */ }
  }, [selectedMeals]);

  // Navigate with unsaved-changes confirmation and browser history push
  const navigateToScreen = useCallback((screen) => {
    if (hasUnsavedChangesRef.current) {
      const confirmed = window.confirm(
        "You have unsaved changes that will be lost. Are you sure you want to leave?"
      );
      if (!confirmed) return;
      hasUnsavedChangesRef.current = false;
    }
    setCurrentScreen(screen);
    window.history.pushState({ screen }, "", `#${screen}`);
    window.scrollTo(0, 0);
  }, []);

  const handleStartShopping = useCallback((data) => {
    setInStoreData(data);
    localStorage.setItem("inStoreShoppingList", JSON.stringify(data));
    navigateToScreen("in-store");
  }, [navigateToScreen]);

  // Browser back/forward button support
  useEffect(() => {
    const initialScreen = window.location.hash.replace("#", "") || "grocery";
    window.history.replaceState({ screen: initialScreen }, "", `#${initialScreen}`);

    const handlePopState = (event) => {
      const screen = event.state?.screen || "grocery";
      if (VALID_SCREENS.includes(screen)) {
        setCurrentScreen(screen);
      } else {
        setCurrentScreen("grocery");
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
      case "chatbot":
        return (
          <ChatBot
            onBack={() => navigateToScreen("grocery")}
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        );
      case "meal-creator":
        return (
          <MealCreator
            onBack={() => navigateToScreen("grocery")}
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
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
      case "recipe-instructions":
        return (
          <RecipeInstructions
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            debugMode={debugMode}
          />
        );
      case "coupons":
        return (
          <Coupons
            onNavigate={navigateToScreen}
          />
        );
      case "smart-deals":
        return (
          <SmartDeals
            onNavigate={navigateToScreen}
          />
        );
      case "heb-cart":
        return (
          <HebCart
            onNavigate={navigateToScreen}
          />
        );
      default:
        return (
          <GroceryChecklist
            onNavigate={navigateToScreen}
            onUnsavedChanges={setHasUnsavedChanges}
            onStartShopping={handleStartShopping}
            debugMode={debugMode}
          />
        );
    }
  };

  // InStoreMode renders fullscreen without navigation chrome
  if (currentScreen === "in-store") {
    return (
      <ThemeProvider>
        {toaster}
        <InStoreMode
          inStoreData={inStoreData}
          onExit={() => navigateToScreen("grocery")}
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
