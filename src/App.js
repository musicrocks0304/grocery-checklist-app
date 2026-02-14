import React, { useState } from "react";
import { ShoppingCart, MessageCircle, ChefHat } from "lucide-react";
import { Toaster } from "react-hot-toast";
import ChatBot from "./ChatBot";
import RecipeIngredients from "./RecipeIngredients";
import RecipeInstructions from "./RecipeInstructions";
import Sidebar from "./Sidebar";
import GroceryChecklist from "./GroceryChecklist";

const App = () => {
  const [currentScreen, setCurrentScreen] = useState("grocery");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMeals, setSelectedMeals] = useState([]);
  const [groceryListData, setGroceryListData] = useState(null);

  const navigation = [
    { id: "grocery", name: "Weekly Grocery Selection", icon: ShoppingCart },
    { id: "chatbot", name: "AI Meal Planner", icon: MessageCircle },
    { id: "recipe-instructions", name: "Recipe Instructions", icon: ChefHat },
  ];

  if (currentScreen === "chatbot") {
    return (
      <>
        <Toaster position="top-center" />
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          currentScreen={currentScreen}
          setCurrentScreen={setCurrentScreen}
          navigation={navigation}
        >
          <ChatBot
            onBack={() => setCurrentScreen("grocery")}
            onNavigate={setCurrentScreen}
            onToggleSidebar={() => setSidebarOpen(true)}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
          />
        </Sidebar>
      </>
    );
  }

  if (currentScreen === "recipe-ingredients") {
    return (
      <>
        <Toaster position="top-center" />
        <div className="min-h-screen bg-gray-50">
          <RecipeIngredients
            selectedMeals={selectedMeals}
            onNavigate={setCurrentScreen}
            groceryListData={groceryListData}
          />
        </div>
      </>
    );
  }

  if (currentScreen === "recipe-instructions") {
    return (
      <>
        <Toaster position="top-center" />
        <RecipeInstructions
          onNavigate={setCurrentScreen}
          selectedMeals={selectedMeals}
        />
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
        setCurrentScreen={setCurrentScreen}
        navigation={navigation}
      >
        <GroceryChecklist onNavigate={setCurrentScreen} />
      </Sidebar>
    </>
  );
};

export default App;
