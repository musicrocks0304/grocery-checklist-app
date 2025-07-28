import React, { useState } from 'react';
import { Check, ShoppingCart, Plus, AlertCircle, Wifi, ChevronDown, ChevronUp, Trash2, X, Layers, ChefHat, Menu, Home } from 'lucide-react';
import ChatBot from './ChatBot';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState('grocery');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { id: 'grocery', name: 'Weekly Grocery Selection', icon: ShoppingCart },
    { id: 'chatbot', name: 'AI Meal Planner', icon: ChefHat },
  ];

  if (currentScreen === 'chatbot') {
    return (
      <div className="flex min-h-screen bg-gray-50">
        {/* Sidebar for ChatBot */}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
          <div className="flex items-center justify-between h-16 px-6 border-b border-slate-700/50 bg-gradient-to-r from-blue-600 to-purple-600">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Menu size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Navigation</h2>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
            >
              <X size={20} />
            </button>
          </div>
          <nav className="mt-6 px-3 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentScreen(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 text-left rounded-xl font-medium transition-all duration-200 group relative overflow-hidden ${
                    isActive 
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg transform scale-[1.02]' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50 hover:transform hover:scale-[1.01]'
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-xl blur-sm"></div>
                  )}
                  <div className={`relative z-10 p-2 rounded-lg transition-all duration-200 ${
                    isActive 
                      ? 'bg-white/20 backdrop-blur-sm' 
                      : 'bg-slate-700/30 group-hover:bg-slate-600/50'
                  }`}>
                    <Icon size={20} />
                  </div>
                  <span className="relative z-10 text-sm font-semibold">{item.name}</span>
                  {isActive && (
                    <div className="relative z-10 ml-auto w-2 h-2 bg-white rounded-full shadow-lg"></div>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Decorative gradient at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-900 via-transparent to-transparent pointer-events-none"></div>

          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3Ccircle cx='27' cy='7' r='1'/%3E%3Ccircle cx='47' cy='7' r='1'/%3E%3Ccircle cx='7' cy='27' r='1'/%3E%3Ccircle cx='27' cy='27' r='1'/%3E%3Ccircle cx='47' cy='27' r='1'/%3E%3Ccircle cx='7' cy='47' r='1'/%3E%3Ccircle cx='27' cy='47' r='1'/%3E%3Ccircle cx='47' cy='47' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}></div>
        </div>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <div className="flex-1 lg:ml-0">
          <div className="lg:hidden bg-white shadow-sm border-b">
            <div className="flex items-center justify-between px-4 h-16">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-lg font-semibold text-gray-800">AI Meal Planner</h1>
              <div></div>
            </div>
          </div>
          <ChatBot onBack={() => setCurrentScreen('grocery')} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Navigation</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="mt-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentScreen(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-100 transition-colors ${
                  currentScreen === item.id ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-700'
                }`}
              >
                <Icon size={20} />
                {item.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-0">
        <div className="lg:hidden bg-white shadow-sm border-b">
          <div className="flex items-center justify-between px-4 h-16">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-600"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-800">Weekly Grocery Selection</h1>
            <div></div>
          </div>
        </div>
        <GroceryChecklist onNavigate={setCurrentScreen} />
      </div>
    </div>
  );
};

const GroceryChecklist = ({ onNavigate }) => {
  const [groceryData, setGroceryData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [activeTab, setActiveTab] = useState('');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showFinalList, setShowFinalList] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    itemName: '',
    category: '',
    type: 'Basic',
    store: '',
    groceryStoreSection: ''
  });
  const [itemToRemove, setItemToRemove] = useState(null);
  const [groupBy, setGroupBy] = useState('Category'); // New state for grouping mode

  // Your n8n webhook URL - verified working in browser
  const WEBHOOK_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/5eb40df4-7053-4166-9b7b-6893789ff943/fetch_grocery_items';

  // Add this helper function to get the actual dates for database storage
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

    // Format dates for SQL (YYYY-MM-DD)
    const formatDateForSQL = (date) => {
      return date.toISOString().split('T')[0];
    };

    return {
      startDate: formatDateForSQL(targetSunday),
      endDate: formatDateForSQL(targetSaturday),
      displayRange: getWeekDateRange() // Uses the existing function
    };
  };

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  // Test basic connectivity
  const testConnectivity = async () => {
    addDebugLog('Testing basic connectivity...');

    try {
      const testResponse = await fetch('https://api.github.com/zen', {
        method: 'GET',
        mode: 'cors'
      });

      if (testResponse.ok) {
        addDebugLog('✅ External connectivity working');
      } else {
        addDebugLog('⚠️ External connectivity issue', testResponse.status);
      }
    } catch (err) {
      addDebugLog('❌ No external connectivity', err.message);
    }
  };

  // Fetch grocery data from your n8n webhook
  React.useEffect(() => {
    const fetchGroceryData = async () => {
      try {
        setError(null);
        setDebugInfo([]);

        await testConnectivity();

        addDebugLog('Fetching grocery data from n8n webhook...');
        addDebugLog('Webhook URL:', WEBHOOK_URL);

        const fetchConfigs = [
          {
            name: 'Standard CORS',
            options: {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
              mode: 'cors'
            }
          },
          {
            name: 'With Content-Type',
            options: {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              mode: 'cors'
            }
          },
          {
            name: 'Simple Request',
            options: {
              method: 'GET',
              mode: 'cors'
            }
          }
        ];

        let successfulResponse = null;

        // Get week date information
        const weekData = getWeekDates();

        // Add week parameters to the webhook URL
        const urlWithParams = new URL(WEBHOOK_URL);
        urlWithParams.searchParams.append('weekStartDate', weekData.startDate);
        urlWithParams.searchParams.append('weekEndDate', weekData.endDate);
        urlWithParams.searchParams.append('weekDateRange', weekData.displayRange);
        urlWithParams.searchParams.append('timestamp', new Date().toISOString());

        for (const config of fetchConfigs) {
          try {
            addDebugLog(`Trying fetch with ${config.name}...`);
            const response = await fetch(urlWithParams.toString(), config.options);

            addDebugLog(`Response received:`, {
              status: response.status,
              statusText: response.statusText,
              type: response.type,
            });

            if (response.ok) {
              successfulResponse = response;
              addDebugLog(`✅ Success with ${config.name}`);
              break;
            } else {
              addDebugLog(`⚠️ Non-OK status with ${config.name}: ${response.status}`);
            }
          } catch (err) {
            addDebugLog(`❌ Failed with ${config.name}: ${err.message}`);
          }
        }

        if (!successfulResponse) {
          throw new Error('All fetch attempts failed. Check debug logs for details.');
        }

        const responseText = await successfulResponse.text();
        addDebugLog('Raw response:', responseText);

        let data;
        try {
          data = JSON.parse(responseText);
          addDebugLog('Parsed JSON data:', data);
        } catch (parseError) {
          addDebugLog('❌ JSON parse error:', parseError.message);
          throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}...`);
        }

        setGroceryData(data);

        // Set the first group as active tab
        const groups = getGroups(data, groupBy);
        if (groups.length > 0) {
          setActiveTab(groups[0]);
        }

        addDebugLog('✅ Successfully loaded data');
      } catch (error) {
        addDebugLog('❌ Error in fetchGroceryData:', error.message);
        setError(error.message);
        // Fallback to sample data if webhook fails - now includes new fields
        const sampleData = [
          { ItemID: 1, ItemName: "Grapes", Category: "Lunches", Store: "Tom Thumb", GroceryStoreSection: "Produce" },
          { ItemID: 2, ItemName: "Pastry Pups", Category: "Lunches", Store: "Trader Joe's", GroceryStoreSection: "Frozen" },
          { ItemID: 3, ItemName: "Almond Milk", Category: "Breakfast", Store: "Whole Foods", GroceryStoreSection: "Refrigerated" },
          { ItemID: 4, ItemName: "BelVita Breakfast biscuits", Category: "Snacks", Store: "Kroger", GroceryStoreSection: "Snacks" },
          { ItemID: 5, ItemName: "Peanut Butter", Category: "General", Store: "Costco", GroceryStoreSection: "Pantry" }
        ];
        setGroceryData(sampleData);
        setActiveTab(getGroups(sampleData, groupBy)[0]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroceryData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get unique groups based on the grouping mode
  const getGroups = (data = groceryData, groupingKey = groupBy) => {
    return [...new Set(data.map(item => item[groupingKey]))].filter(Boolean);
  };

  // Get items by group
  const getItemsByGroup = (group, groupingKey = groupBy) => {
    return groceryData.filter(item => item[groupingKey] === group);
  };

  // Handle grouping mode change
  const handleGroupByChange = (newGroupBy) => {
    setGroupBy(newGroupBy);
    const groups = getGroups(groceryData, newGroupBy);
    if (groups.length > 0) {
      setActiveTab(groups[0]);
    }
  };

  const handleItemToggle = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleRemoveItem = async (item) => {
    setItemToRemove(item);
  };

  const confirmRemoveItem = async () => {
    if (!itemToRemove) return;

    try {
      // This would send a request to your n8n webhook to deactivate the item
      const removalData = {
        action: "deactivate_item",
        itemId: itemToRemove.ItemID
      };

      addDebugLog('Removing item from database:', removalData);

      // For now, remove it from local state
      setGroceryData(groceryData.filter(item => item.ItemID !== itemToRemove.ItemID));

      // Remove from selected items if it was selected
      const newSelected = new Set(selectedItems);
      newSelected.delete(itemToRemove.ItemID.toString());
      setSelectedItems(newSelected);

      addDebugLog('✅ Item removed successfully');
    } catch (error) {
      addDebugLog('❌ Error removing item:', error.message);
      alert('Failed to remove item. Please try again.');
    } finally {
      setItemToRemove(null);
    }
  };

  const handleSubmit = async () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one item for your grocery list.');
      return;
    }

    try {
      const submissionData = {
        action: "submit_grocery_selections",
        selectedItems: Array.from(selectedItems)
      };

      console.log('Selected items to submit:', submissionData);
      setShowFinalList(true);
    } catch (error) {
      console.error('Error submitting to n8n:', error);
      setShowFinalList(true);
    }
  };

  const handleAddItem = async () => {
    if (newItemForm.itemName.trim()) {
      const newItem = {
        ItemID: Date.now(),
        ItemName: newItemForm.itemName.trim(),
        Category: newItemForm.category || 'General',
        Type: newItemForm.type,
        Store: newItemForm.store || 'Tom Thumb',
        GroceryStoreSection: newItemForm.groceryStoreSection || 'Pantry'
      };

      // Here you would normally send this to your n8n webhook to save to database
      const weekData = getWeekDates();

      try {
        addDebugLog('Would send new item to database:', newItem);

        // TODO: Implement actual webhook call to save item
        // const response = await fetch('your-add-item-webhook-url', {
        //   method: 'POST',
        //   body: JSON.stringify({ ...newItem, ...weekData })
        // });

        setGroceryData([...groceryData, newItem]);

        // Reset form and close panel
        setNewItemForm({
          itemName: '',
          category: '',
          type: 'Basic',
          store: '',
          groceryStoreSection: ''
        });
        setShowAddPanel(false);

        addDebugLog('Added item locally:', newItem);

      } catch (error) {
        addDebugLog('❌ Error adding item:', error.message);
        alert('Failed to add item. Please try again.');
      }
    }
  };

  const handleCancelAdd = () => {
    setNewItemForm({
      itemName: '',
      category: '',
      type: 'Basic',
      store: '',
      groceryStoreSection: ''
    });
    setShowAddPanel(false);
  };

  const getWeekDateRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

    // If Thursday (4), Friday (5), or Saturday (6), show next week
    // Otherwise show current week
    const showNextWeek = dayOfWeek >= 4;

    // Find the Sunday of the current week
    const daysToSunday = dayOfWeek;
    const currentWeekSunday = new Date(today);
    currentWeekSunday.setDate(today.getDate() - daysToSunday);

    // Determine which Sunday to use as the start
    const targetSunday = new Date(currentWeekSunday);
    if (showNextWeek) {
      targetSunday.setDate(targetSunday.getDate() + 7);
    }

    // Get the Saturday (6 days after Sunday)
    const targetSaturday = new Date(targetSunday);
    targetSaturday.setDate(targetSunday.getDate() + 6);

    // Format the dates
    const formatDate = (date) => {
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'long' });
      return `${month} ${day}${getOrdinalSuffix(day)}`;
    };

    const getOrdinalSuffix = (day) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    const year = targetSunday.getFullYear();
    return `For the week of ${formatDate(targetSunday)} to ${formatDate(targetSaturday)}, ${year}`;
  };

  const getFinalGroceryList = () => {
    const selectedItemIds = Array.from(selectedItems);
    const selectedGroceryItems = groceryData.filter(item => 
      selectedItemIds.includes(item.ItemID.toString())
    );

    const groupedByCategory = {};
    selectedGroceryItems.forEach(item => {
      if (!groupedByCategory[item.Category]) {
        groupedByCategory[item.Category] = [];
      }
      groupedByCategory[item.Category].push(item);
    });

    return groupedByCategory;
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading grocery items from your database...</p>
          <p className="mt-2 text-sm text-gray-500">Connecting to n8n webhook...</p>
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
          <h1 className="text-2xl font-bold text-gray-800">Weekly Grocery List</h1>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <p className="text-lg font-semibold text-gray-700">{getWeekDateRange()}</p>
          <p className="text-sm text-gray-600 mt-1">Items selected: {selectedItems.size}</p>
        </div>

        {Object.entries(finalList).map(([categoryName, items]) => (
          <div key={categoryName} className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-3 border-b-2 border-blue-200 pb-1">
              {categoryName}
            </h2>
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.ItemID} className="flex items-center gap-2 text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>{item.ItemName}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({item.Store} - {item.GroceryStoreSection})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-8 flex gap-3">
          <button 
            onClick={() => setShowFinalList(false)}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Modify Selection
          </button>
          <button 
            onClick={() => {
              console.log('Saving list and sending to n8n for storage/email');
              alert('Grocery list saved! (This would integrate with your n8n workflow)');
            }}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Save & Email List
          </button>
        </div>
      </div>
    );
  }

  const groups = getGroups();
  const currentGroupItems = getItemsByGroup(activeTab);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Add Item Side Panel */}
      {showAddPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-end z-50">
          <div className="bg-white h-full w-96 shadow-xl overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Plus size={24} />
                  <h2 className="text-xl font-bold">Add New Grocery Item</h2>
                </div>
                <button
                  onClick={handleCancelAdd}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm opacity-90 mt-2">
                Fill in all the details for your new grocery item
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Item Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Name *
                </label>
                <input
                  type="text"
                  value={newItemForm.itemName}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, itemName: e.target.value }))}
                  placeholder="Enter item name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <select
                  value={newItemForm.category}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select category...</option>
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snacks">Snacks</option>
                  <option value="General">General</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Pantry">Pantry</option>
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="type"
                      value="Basic"
                      checked={newItemForm.type === 'Basic'}
                      onChange={(e) => setNewItemForm(prev => ({ ...prev, type: e.target.value }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Basic</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="type"
                      value="Periodic"
                      checked={newItemForm.type === 'Periodic'}
                      onChange={(e) => setNewItemForm(prev => ({ ...prev, type: e.target.value }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Periodic</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Basic: Items bought as needed | Periodic: Items bought regularly
                </p>
              </div>

              {/* Store */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store *
                </label>
                <select
                  value={newItemForm.store}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, store: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select store...</option>
                  <option value="Tom Thumb">Tom Thumb</option>
                  <option value="Trader Joe's">Trader Joe's</option>
                  <option value="Whole Foods">Whole Foods</option>
                  <option value="Kroger">Kroger</option>
                  <option value="Costco">Costco</option>
                  <option value="Target">Target</option>
                  <option value="Walmart">Walmart</option>
                </select>
              </div>

              {/* Grocery Store Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grocery Store Section *
                </label>
                <select
                  value={newItemForm.groceryStoreSection}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, groceryStoreSection: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select section...</option>
                  <option value="Produce">Produce</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Meat">Meat & Seafood</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Frozen">Frozen</option>
                  <option value="Pantry">Pantry</option>
                  <option value="Snacks">Snacks</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Health & Beauty">Health & Beauty</option>
                  <option value="Household">Household</option>
                  <option value="Refrigerated">Refrigerated</option>
                </select>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t bg-gray-50 p-6 flex gap-3">
              <button
                onClick={handleCancelAdd}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                disabled={!newItemForm.itemName.trim() || !newItemForm.category || !newItemForm.store || !newItemForm.groceryStoreSection}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {itemToRemove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Remove Item from Database?</h3>
                <p className="mt-2 text-gray-600">
                  Are you sure you want to permanently remove <strong>"{itemToRemove.ItemName}"</strong> from the {itemToRemove.Category} category?
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  This action will deactivate the item in your database and it won't appear in future grocery lists.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setItemToRemove(null)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveItem}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Remove Item
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Check className="text-blue-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-800">Weekly Grocery Selection</h1>
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
                  <span className={
                    log.message.includes('✅') ? 'text-green-400' :
                    log.message.includes('❌') ? 'text-red-400' :
                    log.message.includes('⚠️') ? 'text-yellow-400' :
                    'text-gray-200'
                  }>
                    {log.message}
                  </span>
                  {log.data && (
                    <span className="text-gray-500">
                      {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
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
                <p className="font-semibold text-red-800">Connection Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
                <p className="text-red-600 text-sm mt-1">Using sample data instead.</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-lg font-medium text-blue-900">{getWeekDateRange()}</p>
        </div>

        <p className="text-gray-600 mb-6">Please select items for this week's grocery list:</p>

        {/* Grouping Mode Selector */}
        <div className="mb-6 flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-700">
            <Layers size={20} />
            <span className="font-medium">Group by:</span>
          </div>
          <div className="flex gap-2">
            {['Category', 'Store', 'GroceryStoreSection'].map((mode) => (
              <button
                key={mode}
                onClick={() => handleGroupByChange(mode)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  groupBy === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                {mode === 'GroceryStoreSection' ? 'Store Section' : mode}
              </button>
            ))}
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
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {group}
                <span className="ml-2 text-sm opacity-80">
                  ({getItemsByGroup(group).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Items for Active Group */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              {groupBy === 'GroceryStoreSection' ? 'Store Section' : groupBy}: {activeTab}
            </h2>
            <button
              onClick={() => setShowAddPanel(true)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
              title="Add new item"
            >
              <Plus size={20} />
              Add Item
            </button>
          </div>



          <div className="space-y-2">
            {currentGroupItems.map((item) => (
              <div
                key={item.ItemID}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <input
                  type="checkbox"
                  id={`item-${item.ItemID}`}
                  checked={selectedItems.has(item.ItemID.toString())}
                  onChange={() => handleItemToggle(item.ItemID.toString())}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label
                  htmlFor={`item-${item.ItemID}`}
                  className={`flex-1 cursor-pointer ${
                    selectedItems.has(item.ItemID.toString()) ? 'font-medium' : ''
                  }`}
                >
                  <span className="text-gray-700">{item.ItemName}</span>
                  <div className="text-sm text-gray-500 mt-1">
                    {groupBy !== 'Category' && (
                      <span className="mr-3">Category: {item.Category}</span>
                    )}
                    {groupBy !== 'Store' && (
                      <span className="mr-3">Store: {item.Store}</span>
                    )}
                    {groupBy !== 'GroceryStoreSection' && (
                      <span>Section: {item.GroceryStoreSection}</span>
                    )}
                  </div>
                </label>
                <button
                  onClick={() => handleRemoveItem(item)}
                  className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-all"
                  title="Remove item from database"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 text-sm text-gray-600 flex items-center">
            Selected: {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}
          </div>
          <button 
            onClick={handleSubmit}
            disabled={selectedItems.size === 0}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Generate Grocery List
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;