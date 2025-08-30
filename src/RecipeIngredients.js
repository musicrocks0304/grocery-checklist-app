import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChefHat, ShoppingCart, Clock, Users, Utensils } from 'lucide-react';

const RecipeIngredients = ({ selectedMeals = [], onBack, onNavigate }) => {
  const [ingredientsList, setIngredientsList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [itemQuantities, setItemQuantities] = useState(new Map());

  // Process meals and aggregate ingredients
  useEffect(() => {
    if (selectedMeals.length > 0) {
      processRecipeIngredients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeals]);

  const processRecipeIngredients = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Here you would call your n8n webhook to get consolidated ingredients
      // For now, we'll simulate the processing
      console.log('Processing ingredients for meals:', selectedMeals);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock consolidated ingredients (this would come from your n8n webhook)
      const mockIngredients = [
        {
          ItemID: 1,
          ItemName: 'Salmon Fillet',
          Category: 'Protein',
          Store: 'HEB',
          GroceryStoreSection: 'Seafood',
          Quantity: 2,
          Unit: 'lbs',
          FromMeals: ['Herb-Crusted Salmon', 'Grilled Salmon']
        },
        {
          ItemID: 2,
          ItemName: 'Fresh Herbs',
          Category: 'Produce',
          Store: 'HEB',
          GroceryStoreSection: 'Produce',
          Quantity: 1,
          Unit: 'bunch',
          FromMeals: ['Herb-Crusted Salmon']
        },
        {
          ItemID: 3,
          ItemName: 'Olive Oil',
          Category: 'Pantry',
          Store: 'HEB',
          GroceryStoreSection: 'Oils & Vinegars',
          Quantity: 1,
          Unit: 'bottle',
          FromMeals: ['Herb-Crusted Salmon', 'Mediterranean Chicken']
        }
      ];

      setIngredientsList(mockIngredients);

      // Pre-select all items and set default quantities
      const preSelectedItems = new Set();
      const preSelectedQuantities = new Map();

      mockIngredients.forEach((item) => {
        preSelectedItems.add(item.ItemID.toString());
        preSelectedQuantities.set(item.ItemID.toString(), item.Quantity);
      });

      setSelectedItems(preSelectedItems);
      setItemQuantities(preSelectedQuantities);

    } catch (err) {
      console.error('Error processing recipe ingredients:', err);
      setError('Failed to process recipe ingredients. Please try again.');
    } finally {
      setIsLoading(false);
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
            newQuantities.set(itemIdStr, item.Quantity || 1);
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

  const getSelectedItemsCount = () => selectedItems.size;

  const getTotalMealsCount = () => selectedMeals.length;

  // Group ingredients by category
  const groupedIngredients = ingredientsList.reduce((groups, item) => {
    const category = item.Category || 'Other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(item);
    return groups;
  }, {});

  const categories = Object.keys(groupedIngredients).sort();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Processing recipe ingredients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={20} />
                <span>Back to Meal Planner</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div className="flex items-center gap-2">
                <ChefHat className="text-purple-600" size={24} />
                <h1 className="text-xl font-semibold text-gray-900">Recipe Ingredients</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {getTotalMealsCount()} meals • {getSelectedItemsCount()} ingredients selected
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Meal Summary */}
        <div className="mb-6 bg-white rounded-lg shadow-sm border p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Utensils size={20} className="text-purple-600" />
            Selected Meals ({getTotalMealsCount()})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedMeals.map((meal, index) => (
              <div key={meal.id || index} className="bg-gray-50 rounded-lg p-3">
                <h3 className="font-medium text-gray-900">{meal.name}</h3>
                {meal.description && (
                  <p className="text-sm text-gray-600 mt-1">{meal.description}</p>
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
            ))}
          </div>
        </div>

        {/* Ingredients List */}
        {ingredientsList.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No ingredients to display</h3>
            <p className="text-gray-600">Select some meals in the meal planner to see ingredients here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map(category => (
              <div key={category} className="bg-white rounded-lg shadow-sm border">
                <div className="bg-gray-50 px-4 py-3 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">{category}</h3>
                  <p className="text-sm text-gray-600">
                    {groupedIngredients[category].length} items
                  </p>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedIngredients[category].map(item => {
                      const isSelected = selectedItems.has(item.ItemID.toString());
                      const quantity = itemQuantities.get(item.ItemID.toString()) || item.Quantity || 1;

                      return (
                        <div
                          key={item.ItemID}
                          className={`border rounded-lg p-3 transition-all ${
                            isSelected 
                              ? 'border-purple-300 bg-purple-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItemSelection(item.ItemID)}
                              className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 truncate">
                                {item.ItemName}
                              </h4>
                              <p className="text-sm text-gray-600">{item.Store}</p>
                              {item.GroceryStoreSection && (
                                <p className="text-xs text-gray-500">{item.GroceryStoreSection}</p>
                              )}
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
                              {isSelected && (
                                <div className="mt-2 flex items-center gap-2">
                                  <label className="text-sm text-gray-600">Qty:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={quantity}
                                    onChange={(e) => updateQuantity(item.ItemID, e.target.value)}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-purple-500 focus:border-purple-500"
                                  />
                                  {item.Unit && (
                                    <span className="text-sm text-gray-500">{item.Unit}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        {ingredientsList.length > 0 && (
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={() => {
                // Here you would implement the logic to create the grocery list
                console.log('Creating grocery list with selected items:', {
                  selectedItems: Array.from(selectedItems),
                  quantities: Object.fromEntries(itemQuantities),
                  meals: selectedMeals
                });
                // For now, navigate back to main grocery list
                onNavigate('grocery');
              }}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <ShoppingCart size={20} />
              Add to Grocery List ({getSelectedItemsCount()} items)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeIngredients;
