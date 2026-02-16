import React, { useState, useEffect, useCallback, useRef } from "react";
import { ShoppingCart, MessageCircle, ChefHat, ShoppingBag, Sparkles, Ticket } from "lucide-react";
import { Toaster } from "react-hot-toast";
import ChatBot from "./ChatBot";
import RecipeIngredients from "./RecipeIngredients";
import RecipeInstructions from "./RecipeInstructions";
import Sidebar from "./Sidebar";
import GroceryChecklist from "./GroceryChecklist";
import InStoreMode from "./InStoreMode";
import MealCreator from "./MealCreator";
import Coupons from "./Coupons";

const VALID_SCREENS = ["grocery", "chatbot", "meal-creator", "recipe-ingredients", "recipe-instructions", "in-store", "coupons"];

// Only show debug panels when ?debug=true is in the URL
const isDebugMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

const App = () => {
  const [debugMode] = useState(isDebugMode);
  const [currentScreen, setCurrentScreen] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return VALID_SCREENS.includes(hash) ? hash : "grocery";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMeals, setSelectedMeals] = useState([]);
  const [groceryListData, setGroceryListData] = useState(null);
  const [inStoreData, setInStoreData] = useState(null);
  const hasUnsavedChangesRef = useRef(false);

  const setHasUnsavedChanges = useCallback((value) => {
    hasUnsavedChangesRef.current = value;
  }, []);

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
    setSidebarOpen(false);
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
      setSidebarOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigation = [
    { id: "grocery", name: "Weekly Grocery Selection", icon: ShoppingCart },
    { id: "in-store", name: "In Store Mode", icon: ShoppingBag },
    { id: "chatbot", name: "AI Meal Planner", icon: MessageCircle },
    { id: "meal-creator", name: "AI Meal Creator", icon: Sparkles },
    { id: "recipe-instructions", name: "Recipe Instructions", icon: ChefHat },
    { id: "coupons", name: "HEB Coupons", icon: Ticket },
  ];

  if (currentScreen === "in-store") {
    return (
      <>
        <Toaster position="top-center" />
        <InStoreMode
          inStoreData={inStoreData}
          onExit={() => navigateToScreen("grocery")}
        />
      </>
    );
  }

  if (currentScreen === "chatbot") {
    return (
      <>
        <Toaster position="top-center" />
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          currentScreen={currentScreen}
          setCurrentScreen={navigateToScreen}
          navigation={navigation}
        >
          <ChatBot
            onBack={() => navigateToScreen("grocery")}
            onNavigate={navigateToScreen}
            onToggleSidebar={() => setSidebarOpen(true)}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        </Sidebar>
      </>
    );
  }

  if (currentScreen === "meal-creator") {
    return (
      <>
        <Toaster position="top-center" />
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          currentScreen={currentScreen}
          setCurrentScreen={navigateToScreen}
          navigation={navigation}
        >
          <MealCreator
            onBack={() => navigateToScreen("grocery")}
            onNavigate={navigateToScreen}
            onToggleSidebar={() => setSidebarOpen(true)}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            debugMode={debugMode}
          />
        </Sidebar>
      </>
    );
  }

  if (currentScreen === "recipe-ingredients") {
    return (
      <>
        <Toaster position="top-center" />
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          currentScreen={currentScreen}
          setCurrentScreen={navigateToScreen}
          navigation={navigation}
        >
          <RecipeIngredients
            selectedMeals={selectedMeals}
            onNavigate={navigateToScreen}
            groceryListData={groceryListData}
            debugMode={debugMode}
          />
        </Sidebar>
      </>
    );
  }

  if (currentScreen === "recipe-instructions") {
    return (
      <>
        <Toaster position="top-center" />
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          currentScreen={currentScreen}
          setCurrentScreen={navigateToScreen}
          navigation={navigation}
        >
          <RecipeInstructions
            onNavigate={navigateToScreen}
            selectedMeals={selectedMeals}
            debugMode={debugMode}
          />
        </Sidebar>
      </>
    );
  }

  if (currentScreen === "coupons") {
    return (
      <>
        <Toaster position="top-center" />
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          currentScreen={currentScreen}
          setCurrentScreen={navigateToScreen}
          navigation={navigation}
        >
          <Coupons
            onNavigate={navigateToScreen}
            onToggleSidebar={() => setSidebarOpen(true)}
          />
        </Sidebar>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-center" />
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentScreen={currentScreen}
        setCurrentScreen={navigateToScreen}
        navigation={navigation}
      >
        <GroceryChecklist
          onNavigate={navigateToScreen}
          onUnsavedChanges={setHasUnsavedChanges}
          onStartShopping={handleStartShopping}
          debugMode={debugMode}
        />
      </Sidebar>
    </>
  );
};

export default App;
