import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  ShoppingCart,
  Clock,
  Users,
  Utensils,
  Check,
  ChevronDown,
  ChevronUp,
  Wifi,
  AlertCircle,
  Layers
} from 'lucide-react';

const RecipeIngredients = ({ selectedMeals = [], onNavigate, groceryListData }) => {
  const [ingredientsList, setIngredientsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [activeTab, setActiveTab] = useState("");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [itemQuantities, setItemQuantities] = useState(new Map());
  const [showFinalList, setShowFinalList] = useState(false);
  const [groupBy, setGroupBy] = useState("Category");
  const [expandedMeals, setExpandedMeals] = useState(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isAddingToMainList, setIsAddingToMainList] = useState(false);

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo((prev) => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || "");
  };

  // Clear any cached data on component mount
  useEffect(() => {
    // Remove any cached webhook responses to ensure fresh data
    localStorage.removeItem('n8n_recipe_ingredients');
    localStorage.removeItem('n8n_recipe_ingredients_raw');
    addDebugLog('🧹 Cleared cached webhook data to ensure fresh responses');
  }, []);

  // Handle adding ingredients to main list
  const handleAddToMainList = async () => {
    setIsAddingToMainList(true);
    try {
      addDebugLog('🚀 Starting to add ingredients to main grocery list...');

      // Prepare the selected ingredients data
      const selectedIngredients = ingredientsList
        .filter(item => selectedItems.has(item.ItemID.toString()))
        .map(item => ({
          ...item,
          quantity: itemQuantities.get(item.ItemID.toString()) || 1
        }));

      addDebugLog('📦 Selected ingredients to add:', selectedIngredients);
      addDebugLog(`📊 Total items: ${selectedIngredients.length}`);

      // Get week date information (matching other webhooks)
      const getWeekDates = () => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const showNextWeek = dayOfWeek >= 4;

        const daysToSunday = dayOfWeek;
        const currentWeekSunday = new Date(today);
        currentWeekSunday.setDate(today.getDate() - daysToSunday);

        const targetSunday = new Date(currentWeekSunday);
        if (showNextWeek) {
          targetSunday.setDate(targetSunday.getDate() + 7);
        }

        const targetSaturday = new Date(targetSunday);
        targetSaturday.setDate(targetSunday.getDate() + 6);

        const formatDate = (date) => {
          return date.toISOString().split('T')[0];
        };

        const formatDisplayDate = (date) => {
          const month = date.toLocaleDateString("en-US", { month: "long" });
          const day = date.getDate();
          const getOrdinalSuffix = (day) => {
            if (day > 3 && day < 21) return "th";
            switch (day % 10) {
              case 1: return "st";
              case 2: return "nd";
              case 3: return "rd";
              default: return "th";
            }
          };
          return `${month} ${day}${getOrdinalSuffix(day)}`;
        };

        const year = targetSunday.getFullYear();
        return {
          startDate: formatDate(targetSunday),
          endDate: formatDate(targetSaturday),
          displayRange: `For the week of ${formatDisplayDate(targetSunday)} to ${formatDisplayDate(targetSaturday)}, ${year}`
        };
      };

      const weekData = getWeekDates();

      // Prepare query parameters with all the selected ingredient data
      const queryParams = new URLSearchParams({
        ingredients: JSON.stringify(selectedIngredients),
        totalItems: selectedIngredients.length.toString(),
        selectedMeals: JSON.stringify(selectedMeals.map(meal => ({
          id: meal.id || meal.recipeId,
          name: meal.name,
          description: meal.description
        }))),
        weekStartDate: weekData.startDate,
        weekEndDate: weekData.endDate,
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString(),
        source: 'recipe_ingredients_page'
      });

      const webhookUrl = `https://n8n-grocery.needexcelexpert.com/webhook/meal_ingredients?${queryParams.toString()}`;

      addDebugLog('🌐 Calling webhook with data...');
      addDebugLog('📋 Webhook URL (truncated):', webhookUrl.substring(0, 200) + '...');

      const response = await fetch(webhookUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors'
      });

      addDebugLog('📡 Webhook response status:', response.status);

      if (response.ok) {
        addDebugLog('✅ Successfully added ingredients to main grocery list');
        alert("✅ Recipe ingredients have been added to your main grocery list!");
        onNavigate('grocery');
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error adding ingredients to main list:', error);
      addDebugLog('❌ Error adding ingredients to main list:', error.message);
      alert("❌ There was an error adding ingredients to your main grocery list. Please try again.");
    } finally {
      setIsAddingToMainList(false);
      setShowConfirmDialog(false);
    }
  };

  // Process meals and aggregate ingredients
  useEffect(() => {
    if (selectedMeals.length > 0) {
      processRecipeIngredients();
    } else {
      // If no meals selected, show empty state
      setIsLoading(false);
      setIngredientsList([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeals]);

  const processRecipeIngredients = async () => {
    setIsLoading(true);
    setError(null);
    addDebugLog("🚀 Starting recipe ingredient processing...");

    try {
      // The webhook was already called when "Generate Grocery List" was clicked
      // We need to fetch the results from the n8n webhook response
      addDebugLog('Processing ingredients for meals:', selectedMeals.map(m => m.name));
      addDebugLog('Received grocery list data:', groceryListData);

      // Use the actual grocery list data from the webhook if available
      let webhookResponse = groceryListData;

      // If no webhook data is available, use fallback data
      if (!webhookResponse) {
        addDebugLog('No grocery list data available, using fallback data structure');
        webhookResponse = [
          {
            output: {
              responseType: "shopping_list",
              ingredients: [
                {
                  name: "ground beef",
                  category: "protein",
                  purchaseQuantity: "1 lb",
                  purchaseUnit: "1 lb package",
                  recipeNeeds: "10 oz",
                  usedInRecipes: selectedMeals.map(m => m.name)
                },
                {
                  name: "pasta",
                  category: "grains",
                  purchaseQuantity: "1 lb",
                  purchaseUnit: "1 lb package",
                  recipeNeeds: "6 oz",
                  usedInRecipes: selectedMeals.map(m => m.name)
                },
                {
                  name: "vegetables",
                  category: "produce",
                  purchaseQuantity: "1 bag",
                  purchaseUnit: "1 bag",
                  recipeNeeds: "4 oz",
                  usedInRecipes: selectedMeals.map(m => m.name)
                }
              ],
              summary: {
                totalItems: 3,
                recipesIncluded: selectedMeals.map(m => m.name),
                estimatedCost: "$15"
              },
              message: "Here's your consolidated shopping list for the recipes!"
            }
          }
        ];
      } else {
        addDebugLog('✅ Using actual grocery list data from webhook');
        addDebugLog('Grocery list data:', webhookResponse);
      }

      // Transform n8n webhook response to our expected format
      const transformedIngredients = [];
      let itemId = 1;

      if (webhookResponse[0]?.output?.ingredients && Array.isArray(webhookResponse[0].output.ingredients)) {
        webhookResponse[0].output.ingredients.forEach(ingredient => {
          transformedIngredients.push({
            ItemID: itemId++,
            ItemName: ingredient.name,
            Category: capitalizeCategory(ingredient.category),
            Store: 'HEB', // Default store
            GroceryStoreSection: getCategorySection(capitalizeCategory(ingredient.category)),
            Type: 'Basic',
            IsActive: 1,
            IsSelected: 1, // Pre-select all items from recipes
            // Use purchase quantity for shopping
            QuantitySelected: ingredient.purchaseQuantity || '1',
            Unit: ingredient.purchaseUnit || 'item',
            // Store recipe needs for reference
            RecipeNeeds: ingredient.recipeNeeds || '',
            FromMeals: ingredient.usedInRecipes || selectedMeals.map(m => m.name),
            Notes: ingredient.recipeNeeds ? `Recipe needs: ${ingredient.recipeNeeds}` : ''
          });
        });
      }

      // Clean up the data by removing any tab characters from item names and categories
      const cleanedData = transformedIngredients.map((item) => ({
        ...item,
        ItemName: item.ItemName
          ? item.ItemName.replace(/\t/g, "").trim()
          : item.ItemName,
        Category: item.Category
          ? item.Category.replace(/\t/g, "").trim()
          : item.Category,
      }));

      setIngredientsList(cleanedData);
      addDebugLog("✅ Successfully loaded and transformed recipe ingredients");
      addDebugLog("Transformed ingredients:", cleanedData);

      // Initialize selected items and quantities based on IsSelected field
      const preSelectedItems = new Set();
      const preSelectedQuantities = new Map();

      cleanedData.forEach((item) => {
        if (item.IsSelected === 1) {
          preSelectedItems.add(item.ItemID.toString());
          // Use QuantitySelected from payload, fallback to 1 if not present
          const quantity = item.QuantitySelected || 1;
          preSelectedQuantities.set(item.ItemID.toString(), quantity);
        }
      });

      setSelectedItems(preSelectedItems);
      setItemQuantities(preSelectedQuantities);

      // Set the first group as active tab
      const groups = getGroups(cleanedData, groupBy);
      if (groups.length > 0) {
        setActiveTab(groups[0]);
      }

      addDebugLog(`✅ Processed ${cleanedData.length} ingredients from ${selectedMeals.length} meals`);

    } catch (err) {
      console.error('Error processing recipe ingredients:', err);
      addDebugLog('❌ Error processing recipe ingredients:', err.message);
      setError('Failed to process recipe ingredients. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to capitalize category names
  const capitalizeCategory = (category) => {
    if (!category) return 'General';
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  };



  // Helper function to map categories to store sections
  const getCategorySection = (category) => {
    const sectionMap = {
      'Protein': 'Meat & Seafood',
      'Proteins': 'Meat & Seafood',
      'Produce': 'Produce',
      'Vegetables': 'Produce',
      'Fruits': 'Produce',
      'Dairy': 'Dairy',
      'Pantry': 'Pantry',
      'Grains': 'Pantry',
      'Spices': 'Spices & Seasonings',
      'Seasoning': 'Spices & Seasonings',
      'Condiments': 'Condiments',
      'Oils': 'Condiments',
      'Beverages': 'Beverages'
    };
    return sectionMap[category] || 'General';
  };

  // Helper functions matching main screen pattern
  const getGroups = (data = ingredientsList, groupByField = groupBy) => {
    const groups = new Set();
    data.forEach((item) => {
      groups.add(item[groupByField] || "Other");
    });
    return Array.from(groups).sort();
  };

  const getItemsByGroup = (group) => {
    return ingredientsList.filter((item) => {
      const matchesGroup = (item[groupBy] || "Other") === group;
      return matchesGroup;
    });
  };

  const handleGroupByChange = (newGroupBy) => {
    setGroupBy(newGroupBy);
    const groups = getGroups(ingredientsList, newGroupBy);
    if (groups.length > 0) {
      setActiveTab(groups[0]);
    }
  };

  const toggleItemSelection = (itemId) => {
    const itemIdStr = itemId.toString();
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemIdStr)) {
        newSet.delete(itemIdStr);
        // Remove quantity when deselecting
        setItemQuantities(prevQuantities => {
          const newQuantities = new Map(prevQuantities);
          newQuantities.delete(itemIdStr);
          return newQuantities;
        });
      } else {
        newSet.add(itemIdStr);
        // Set default quantity when selecting
        const item = ingredientsList.find(i => i.ItemID.toString() === itemIdStr);
        if (item) {
          setItemQuantities(prevQuantities => {
            const newQuantities = new Map(prevQuantities);
            newQuantities.set(itemIdStr, item.QuantitySelected || 1);
            return newQuantities;
          });
        }
      }
      return newSet;
    });
  };

  const updateQuantity = (itemId, quantity) => {
    const itemIdStr = itemId.toString();
    const numQuantity = Math.max(1, parseInt(quantity) || 1);
    setItemQuantities(prev => {
      const newQuantities = new Map(prev);
      newQuantities.set(itemIdStr, numQuantity);
      return newQuantities;
    });
  };

  const toggleMealDescription = (mealIndex) => {
    setExpandedMeals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mealIndex)) {
        newSet.delete(mealIndex);
      } else {
        newSet.add(mealIndex);
      }
      return newSet;
    });
  };

  const getWeekDateRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const showNextWeek = dayOfWeek >= 4;

    const daysToSunday = dayOfWeek;
    const currentWeekSunday = new Date(today);
    currentWeekSunday.setDate(today.getDate() - daysToSunday);

    const targetSunday = new Date(currentWeekSunday);
    if (showNextWeek) {
      targetSunday.setDate(targetSunday.getDate() + 7);
    }

    const targetSaturday = new Date(targetSunday);
    targetSaturday.setDate(targetSunday.getDate() + 6);

    const formatDate = (date) => {
      const month = date.toLocaleDateString("en-US", { month: "long" });
      const day = date.getDate();
      return `${month} ${day}${getOrdinalSuffix(day)}`;
    };

    const getOrdinalSuffix = (day) => {
      if (day > 3 && day < 21) return "th";
      switch (day % 10) {
        case 1:
          return "st";
        case 2:
          return "nd";
        case 3:
          return "rd";
        default:
          return "th";
      }
    };

    const year = targetSunday.getFullYear();
    return `For the week of ${formatDate(targetSunday)} to ${formatDate(targetSaturday)}, ${year}`;
  };

  const getFinalGroceryList = () => {
    const selectedItemIds = Array.from(selectedItems);
    const selectedGroceryItems = ingredientsList
      .filter((item) => selectedItemIds.includes(item.ItemID.toString()))
      .map((item) => ({
        ...item,
        quantity: itemQuantities.get(item.ItemID.toString()) || 1,
      }));

    const groupedByCategory = {};
    selectedGroceryItems.forEach((item) => {
      if (!groupedByCategory[item.Category]) {
        groupedByCategory[item.Category] = [];
      }
      groupedByCategory[item.Category].push(item);
    });

    // Sort items within each category alphabetically
    Object.keys(groupedByCategory).forEach((category) => {
      groupedByCategory[category].sort((a, b) =>
        a.ItemName.localeCompare(b.ItemName),
      );
    });

    return groupedByCategory;
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            Processing recipe ingredients from your selected meals...
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Aggregating ingredients from n8n webhook...
          </p>
        </div>
      </div>
    );
  }

  if (showFinalList) {
    const finalList = getFinalGroceryList();
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="text-green-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-800">
            Recipe Grocery List
          </h1>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <p className="text-lg font-semibold text-gray-700">
            {getWeekDateRange()}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Items selected: {selectedItems.size} • From {selectedMeals.length} meals
          </p>
        </div>



        {Object.entries(finalList)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([categoryName, items]) => (
            <div key={categoryName} className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b-2 border-purple-200 pb-2">
                {categoryName}
              </h2>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {items.map((item, index) => (
                  <div
                    key={item.ItemID}
                    className={`p-4 flex items-center justify-between ${
                      index !== items.length - 1 ? 'border-b border-gray-100' : ''
                    } hover:bg-gray-50 transition-colors`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 mb-1">
                        {item.ItemName}
                      </div>
                      {item.RecipeNeeds && (
                        <div className="text-sm text-gray-600">
                          Recipe needs: {item.RecipeNeeds}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
                        Buy: {item.quantity} × {item.QuantitySelected}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        <div className="flex gap-4 pt-6 border-t">
          <button
            onClick={() => setShowFinalList(false)}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Selection
          </button>
          <button
            onClick={() => {
              setShowConfirmDialog(true);
            }}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Add to Main Grocery List
          </button>
        </div>

        {/* Confirmation Dialog */}
        {showConfirmDialog && !isAddingToMainList && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="text-orange-500" size={24} />
                <h3 className="text-lg font-semibold text-gray-900">Confirm Action</h3>
              </div>
              <p className="text-gray-700 mb-6">
                Are you sure you want to add these {selectedItems.size} ingredients to your main grocery list?
                This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddToMainList}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Add to Main List
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Dialog */}
        {isAddingToMainList && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md mx-4 shadow-xl text-center">
              <div className="flex items-center justify-center space-x-1 mb-4">
                <div className="animate-bounce h-3 w-3 bg-purple-600 rounded-full" style={{animationDelay: '0ms'}}></div>
                <div className="animate-bounce h-3 w-3 bg-purple-600 rounded-full" style={{animationDelay: '150ms'}}></div>
                <div className="animate-bounce h-3 w-3 bg-purple-600 rounded-full" style={{animationDelay: '300ms'}}></div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Adding to Main Grocery List</h3>
              <p className="text-gray-600 mb-2">Processing your recipe ingredients...</p>
              <p className="text-sm text-gray-500">This usually takes 10-15 seconds</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const groups = getGroups();
  const currentGroupItems = getItemsByGroup(activeTab);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ChefHat className="text-purple-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-800">
              Recipe Ingredients
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Debug Toggle */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <Wifi size={16} />
              Debug Info
              {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="mb-6 p-4 bg-gray-900 text-white rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Wifi size={20} />
              Debug Information
            </h3>
            <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
              {debugInfo.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-gray-400">[{log.timestamp}]</span>
                  <span
                    className={
                      log.message.includes("✅")
                        ? "text-green-400"
                        : log.message.includes("❌")
                          ? "text-red-400"
                          : log.message.includes("⚠️")
                            ? "text-yellow-400"
                            : "text-gray-200"
                    }
                  >
                    {log.message}
                  </span>
                  {log.data && (
                    <span className="text-gray-500">
                      {typeof log.data === "object"
                        ? JSON.stringify(log.data, null, 2)
                        : log.data}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-red-800">Processing Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
                <p className="text-red-600 text-sm mt-1">
                  Using sample data instead.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <p className="text-lg font-medium text-purple-900">
            {getWeekDateRange()}
          </p>
          <p className="text-sm text-purple-700 mt-1">
            Ingredients from {selectedMeals.length} selected meal{selectedMeals.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Selected Meals Summary */}
        {selectedMeals.length > 0 && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Utensils size={20} />
              Selected Meals ({selectedMeals.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedMeals.map((meal, index) => {
                const isExpanded = expandedMeals.has(index);
                return (
                  <div key={meal.id || index} className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="flex items-start justify-between">
                      <h3 className="font-medium text-gray-900 flex-1">{meal.name}</h3>
                      {meal.description && (
                        <button
                          onClick={() => toggleMealDescription(index)}
                          className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label={isExpanded ? "Collapse description" : "Expand description"}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      )}
                    </div>

                    {meal.description && isExpanded && (
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed">{meal.description}</p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {meal.servings && (
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {meal.servings} servings
                        </span>
                      )}
                      {meal.prepTime && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {meal.prepTime} min
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-gray-600 mb-6">
          Please select ingredients for this week's recipe-based grocery list:
        </p>

        {/* Grouping Controls */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Layers size={20} />
              <span className="font-medium">Group by:</span>
            </div>
            <div className="flex gap-2">
              {["Category", "GroceryStoreSection"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleGroupByChange(mode)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    groupBy === mode
                      ? "bg-purple-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {mode === "GroceryStoreSection" ? "Store Section" : mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Group Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <button
                key={group}
                onClick={() => setActiveTab(group)}
                className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
                  activeTab === group
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {group}
              </button>
            ))}
          </div>
        </div>

        {/* Ingredients List */}
        {ingredientsList.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No ingredients to display</h3>
            <p className="text-gray-600">This page shows ingredients from your selected meals. If you see this message, there may have been an issue loading the ingredient data.</p>
          </div>
        ) : currentGroupItems.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No items in this group</h3>
            <p className="text-gray-600">Try selecting a different group or filter.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-medium text-gray-900">Category: {activeTab}</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {currentGroupItems.map((item) => {
                const isSelected = selectedItems.has(item.ItemID.toString());
                const quantity = itemQuantities.get(item.ItemID.toString()) || item.QuantitySelected || 1;

                return (
                  <div key={item.ItemID} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(item.ItemID)}
                        className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">
                              {item.ItemName}
                            </h4>
                            <div className="mt-1 space-y-1">
                              <div className="text-sm text-green-700 font-medium">
                                Buy: <span className="text-green-800">{item.QuantitySelected}</span>
                              </div>
                              {item.RecipeNeeds && (
                                <div className="text-xs text-gray-600">
                                  Recipe needs: <span className="font-medium">{item.RecipeNeeds}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="ml-4 flex items-center gap-2">
                              <label className="text-sm text-gray-600 font-medium">Qty:</label>
                              <select
                                value={quantity}
                                onChange={(e) => updateQuantity(item.ItemID, e.target.value)}
                                className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-purple-500 focus:border-purple-500"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                  <option key={num} value={num}>{num}</option>
                                ))}
                              </select>
                              <span className="text-xs text-gray-500">units</span>
                            </div>
                          )}
                        </div>

                        {item.FromMeals && item.FromMeals.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500 mb-1">Used in:</p>
                            <div className="flex flex-wrap gap-1">
                              {item.FromMeals.map((mealName, idx) => (
                                <span
                                  key={idx}
                                  className="inline-block px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full"
                                >
                                  {mealName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {ingredientsList.length > 0 && (
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <div className="text-center text-gray-600 mb-4 sm:mb-0 sm:self-center">
              Selected: {selectedItems.size} ingredient{selectedItems.size !== 1 ? 's' : ''} from {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''}
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setShowFinalList(true)}
                disabled={selectedItems.size === 0}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={20} />
                Review List ({selectedItems.size})
              </button>
            </div>
          </div>
        )}
      </div>


    </div>
  );
};

export default RecipeIngredients;
