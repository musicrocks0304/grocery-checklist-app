import React, { useState, useEffect, useRef } from 'react';
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
  Layers,
  ArrowLeft
} from 'lucide-react';
import { ENDPOINTS, apiFetch } from '../config/api';
import toast from 'react-hot-toast';
import { getWeekDateRange, getWeekDates } from '../utils/weekDates';

const RecipeIngredients = ({ selectedMeals = [], onNavigate, groceryListData, debugMode = false }) => {
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
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // Cleanup abort controller on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo((prev) => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || "");
  };

  // Handle adding ingredients to main list
  const handleAddToMainList = async () => {
    setIsAddingToMainList(true);

    // Create an abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

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

      const weekData = getWeekDates();

      // Prepare JSON payload for POST request
      const payload = {
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
      };

      const webhookUrl = ENDPOINTS.mealIngredients;

      addDebugLog('🌐 Calling webhook with POST data...');
      addDebugLog('📋 Payload items:', selectedIngredients.length);

      const response = await apiFetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal
      });

      // Skip state updates if component unmounted during fetch
      if (!isMountedRef.current) return;

      addDebugLog('📡 Webhook response status:', response.status);

      if (response.ok) {
        addDebugLog('✅ Successfully added ingredients to main grocery list');
        toast.success("Recipe ingredients have been added to your main grocery list!");
        onNavigate('grocery');
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      // Silently ignore aborted requests (user navigated away)
      if (error.name === 'AbortError') return;
      if (!isMountedRef.current) return;

      console.error('❌ Error adding ingredients to main list:', error);
      addDebugLog('❌ Error adding ingredients to main list:', error.message);
      toast.error("There was an error adding ingredients to your main grocery list. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setIsAddingToMainList(false);
        setShowConfirmDialog(false);
      }
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

      // If no webhook data is available, show error instead of fake fallback data
      if (!webhookResponse) {
        addDebugLog('❌ No grocery list data available - webhook may have failed');
        setError('No ingredient data was received. Please go back and try generating the grocery list again.');
        setIsLoading(false);
        return;
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

      setIngredientsList(transformedIngredients);
      addDebugLog("✅ Successfully loaded and transformed recipe ingredients");
      addDebugLog("Transformed ingredients:", transformedIngredients);

      // Initialize selected items and quantities based on IsSelected field
      const preSelectedItems = new Set();
      const preSelectedQuantities = new Map();

      transformedIngredients.forEach((item) => {
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
      const groups = getGroups(transformedIngredients, groupBy);
      if (groups.length > 0) {
        setActiveTab(groups[0]);
      }

      addDebugLog(`✅ Processed ${transformedIngredients.length} ingredients from ${selectedMeals.length} meals`);

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
      <div className="max-w-4xl mx-auto p-6 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-body">
            Processing recipe ingredients from your selected meals...
          </p>
          <p className="mt-2 text-sm text-muted">
            Aggregating ingredients from n8n webhook...
          </p>
        </div>
      </div>
    );
  }

  if (showFinalList) {
    const finalList = getFinalGroceryList();
    return (
      <div className="max-w-4xl mx-auto p-6 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="text-primary" size={28} />
          <h1 className="text-2xl font-display font-bold text-heading">
            Recipe Grocery List
          </h1>
        </div>

        <div className="bg-background p-4 rounded-xl mb-6">
          <p className="text-lg font-semibold text-body">
            {getWeekDateRange()}
          </p>
          <p className="text-sm text-body mt-1">
            Items selected: {selectedItems.size} • From {selectedMeals.length} meals
          </p>
        </div>



        {Object.entries(finalList)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([categoryName, items]) => (
            <div key={categoryName} className="mb-6">
              <h2 className="text-xl font-semibold text-heading mb-4 border-b-2 border-primary-border pb-2">
                {categoryName}
              </h2>
              <div className="bg-surface border border-default rounded-xl overflow-hidden">
                {items.map((item, index) => (
                  <div
                    key={item.ItemID}
                    className={`p-4 flex items-center justify-between ${
                      index !== items.length - 1 ? 'border-b border-default' : ''
                    } hover:bg-background transition-colors`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-heading mb-1">
                        {item.ItemName}
                      </div>
                      {item.RecipeNeeds && (
                        <div className="text-sm text-body">
                          Recipe needs: {item.RecipeNeeds}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-primary bg-primary-light px-3 py-1 rounded-full">
                        {item.quantity > 1
                          ? `${item.quantity} \u00d7 ${item.QuantitySelected}`
                          : item.QuantitySelected}
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
            className="px-6 py-2 bg-secondary text-white rounded-xl hover:bg-secondary-hover transition-colors"
          >
            Back to Selection
          </button>
          <button
            onClick={() => {
              setShowConfirmDialog(true);
            }}
            className="px-6 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors"
          >
            Add to Main Grocery List
          </button>
        </div>

        {/* Confirmation Dialog */}
        {showConfirmDialog && !isAddingToMainList && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface rounded-2xl p-6 max-w-md mx-4 shadow-warm-lg">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="text-accent" size={24} />
                <h3 className="text-lg font-semibold text-heading">Confirm Action</h3>
              </div>
              <p className="text-body mb-6">
                Are you sure you want to add these {selectedItems.size} ingredients to your main grocery list?
                This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 text-body bg-background rounded-xl hover:bg-background transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddToMainList}
                  className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors"
                >
                  Add to Main List
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Dialog */}
        {isAddingToMainList && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface rounded-2xl p-8 max-w-md mx-4 shadow-warm-lg text-center">
              <div className="flex items-center justify-center space-x-1 mb-4">
                <div className="animate-bounce h-3 w-3 bg-primary rounded-full" style={{animationDelay: '0ms'}}></div>
                <div className="animate-bounce h-3 w-3 bg-primary rounded-full" style={{animationDelay: '150ms'}}></div>
                <div className="animate-bounce h-3 w-3 bg-primary rounded-full" style={{animationDelay: '300ms'}}></div>
              </div>
              <h3 className="text-lg font-semibold text-heading mb-2">Adding to Main Grocery List</h3>
              <p className="text-body mb-2">Processing your recipe ingredients...</p>
              <p className="text-sm text-muted">This usually takes 10-15 seconds</p>
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
      <div className="p-6 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('grocery')}
              className="p-2 text-body hover:text-heading hover:bg-background rounded-xl transition-colors"
              title="Back to Grocery List"
            >
              <ArrowLeft size={20} />
            </button>
            <ChefHat className="text-primary" size={28} />
            <h1 className="text-2xl font-display font-bold text-heading">
              Recipe Ingredients
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Debug Toggle - only visible with ?debug=true */}
            {debugMode && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-2 text-sm text-body hover:text-heading transition-colors"
              >
                <Wifi size={16} />
                Debug Info
                {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="mb-6 p-4 bg-gray-900 text-white rounded-xl shadow-warm">
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
          <div className="mb-6 p-4 bg-danger-light border border-danger rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-danger mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-danger">Processing Error</p>
                <p className="text-danger text-sm mt-1">{error}</p>
                <button
                  onClick={() => onNavigate('chatbot')}
                  className="mt-2 px-4 py-2 bg-primary text-white rounded-xl text-sm hover:bg-primary-hover transition-colors"
                >
                  Back to Meal Planner
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-primary-light border border-primary-border rounded-xl p-4 mb-6">
          <p className="text-lg font-medium text-primary">
            {getWeekDateRange()}
          </p>
          <p className="text-sm text-primary mt-1">
            Ingredients from {selectedMeals.length} selected meal{selectedMeals.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Selected Meals Summary */}
        {selectedMeals.length > 0 && (
          <div className="mb-6 bg-primary-light border border-primary-border rounded-xl p-4">
            <h2 className="text-lg font-semibold text-primary mb-3 flex items-center gap-2">
              <Utensils size={20} />
              Selected Meals ({selectedMeals.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedMeals.map((meal, index) => {
                const isExpanded = expandedMeals.has(index);
                return (
                  <div key={meal.id || index} className="bg-surface rounded-xl p-3 border border-primary-border">
                    <div className="flex items-start justify-between">
                      <h3 className="font-medium text-heading flex-1">{meal.name}</h3>
                      {meal.description && (
                        <button
                          onClick={() => toggleMealDescription(index)}
                          className="ml-2 p-1 text-muted hover:text-body transition-colors"
                          aria-label={isExpanded ? "Collapse description" : "Expand description"}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      )}
                    </div>

                    {meal.description && isExpanded && (
                      <p className="text-sm text-body mt-2 leading-relaxed">{meal.description}</p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted">
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

        <p className="text-body mb-6">
          Please select ingredients for this week's recipe-based grocery list:
        </p>

        {/* Grouping Controls */}
        <div className="mb-6 p-4 bg-background rounded-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <div className="flex items-center gap-2 text-body">
              <Layers size={20} />
              <span className="font-medium">Group by:</span>
            </div>
            <div className="flex gap-2">
              {["Category", "GroceryStoreSection"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleGroupByChange(mode)}
                  className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                    groupBy === mode
                      ? "bg-primary text-white"
                      : "bg-surface text-body border border-default hover:bg-background"
                  }`}
                >
                  {mode === "GroceryStoreSection" ? "Store Section" : mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Group Tabs */}
        <div className="mb-6 border-b border-default">
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const groupItems = getItemsByGroup(group);
              const selectedCount = groupItems.filter(item => selectedItems.has(item.ItemID.toString())).length;
              return (
                <button
                  key={group}
                  onClick={() => setActiveTab(group)}
                  className={`px-4 py-2 font-medium rounded-t-xl transition-colors ${
                    activeTab === group
                      ? "bg-primary text-white"
                      : "bg-background text-body hover:bg-background"
                  }`}
                >
                  {group}
                  <span className="ml-2 text-sm opacity-80">
                    ({selectedCount}/{groupItems.length})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ingredients List */}
        {ingredientsList.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat size={48} className="mx-auto text-muted mb-4" />
            <h3 className="text-lg font-medium text-heading mb-2">No ingredients to display</h3>
            <p className="text-body">This page shows ingredients from your selected meals. If you see this message, there may have been an issue loading the ingredient data.</p>
          </div>
        ) : currentGroupItems.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-muted mb-4" />
            <h3 className="text-lg font-medium text-heading mb-2">No items in this group</h3>
            <p className="text-body">Try selecting a different group or filter.</p>
          </div>
        ) : (
          <div className="bg-surface border border-default rounded-xl">
            <div className="p-4 border-b border-default bg-background flex items-center justify-between">
              <h3 className="font-medium text-heading">Category: {activeTab}</h3>
              <button
                onClick={() => {
                  const groupItemIds = currentGroupItems.map(item => item.ItemID.toString());
                  const allSelected = groupItemIds.every(id => selectedItems.has(id));
                  setSelectedItems(prev => {
                    const newSet = new Set(prev);
                    groupItemIds.forEach(id => {
                      if (allSelected) {
                        newSet.delete(id);
                      } else {
                        newSet.add(id);
                      }
                    });
                    return newSet;
                  });
                  setItemQuantities(prev => {
                    const newMap = new Map(prev);
                    groupItemIds.forEach(id => {
                      if (allSelected) {
                        newMap.delete(id);
                      } else if (!newMap.has(id)) {
                        const item = ingredientsList.find(i => i.ItemID.toString() === id);
                        newMap.set(id, item?.QuantitySelected || 1);
                      }
                    });
                    return newMap;
                  });
                }}
                className="text-sm text-primary hover:text-primary-hover transition-colors"
              >
                {currentGroupItems.length > 0 && currentGroupItems.every(item => selectedItems.has(item.ItemID.toString()))
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>
            <div className="divide-y divide-default">
              {currentGroupItems.map((item) => {
                const isSelected = selectedItems.has(item.ItemID.toString());
                const quantity = itemQuantities.get(item.ItemID.toString()) || item.QuantitySelected || 1;

                return (
                  <div key={item.ItemID} className="p-4 hover:bg-background transition-colors">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(item.ItemID)}
                        className="mt-1 w-5 h-5 text-primary rounded focus:ring-focus"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-heading">
                              {item.ItemName}
                            </h4>
                            <div className="mt-1 space-y-1">
                              <div className="text-sm text-primary font-medium">
                                Buy: <span className="text-primary">{item.QuantitySelected}</span>
                              </div>
                              {item.RecipeNeeds && (
                                <div className="text-xs text-body">
                                  Recipe needs: <span className="font-medium">{item.RecipeNeeds}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="ml-4 flex items-center gap-2">
                              <select
                                value={quantity}
                                onChange={(e) => updateQuantity(item.ItemID, e.target.value)}
                                className="w-16 px-2 py-1 border border-default rounded text-sm focus:ring-focus"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                  <option key={num} value={num}>&times;{num}</option>
                                ))}
                              </select>
                              <span className="text-xs text-muted">
                                {quantity > 1 ? `= ${quantity} \u00d7 ${item.QuantitySelected}` : ""}
                              </span>
                            </div>
                          )}
                        </div>

                        {item.FromMeals && item.FromMeals.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-muted mb-1">Used in:</p>
                            <div className="flex flex-wrap gap-1">
                              {item.FromMeals.map((mealName, idx) => (
                                <span
                                  key={idx}
                                  className="inline-block px-2 py-1 bg-primary-light text-primary text-xs rounded-full"
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
            <div className="text-center text-body mb-4 sm:mb-0 sm:self-center">
              Selected: {selectedItems.size} ingredient{selectedItems.size !== 1 ? 's' : ''} from {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''}
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setShowFinalList(true)}
                disabled={selectedItems.size === 0}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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
