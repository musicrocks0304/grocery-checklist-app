
import React, { useState, useEffect } from 'react';
import './index.css';
import ChatBot from './ChatBot';
import Coupons from './Coupons';

function App() {
  const [currentPage, setCurrentPage] = useState('grocery');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [groceryData, setGroceryData] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [groupBy, setGroupBy] = useState('Category');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);

  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  const fetchGroceryData = async () => {
    try {
      addDebugLog('Testing basic connectivity...');
      
      // Test basic connectivity first
      try {
        const testResponse = await fetch('https://httpbin.org/get');
        if (testResponse.ok) {
          addDebugLog('✅ External connectivity working');
        }
      } catch (testError) {
        addDebugLog('❌ No external connectivity', testError.message);
        throw new Error('No internet connection available');
      }

      addDebugLog('Fetching grocery data from n8n webhook...');
      const webhookUrl = 'https://n8n-grocery.needexcelexpert.com/webhook/5eb40df4-7053-4166-9b7b-6893789ff943/fetch_grocery_items';
      addDebugLog('Webhook URL:', webhookUrl);

      const fetchStrategies = [
        {
          name: 'Standard CORS',
          options: {
            method: 'GET',
            mode: 'cors',
            headers: {
              'Accept': 'application/json',
            }
          }
        },
        {
          name: 'With Content-Type',
          options: {
            method: 'GET',
            mode: 'cors',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            }
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

      for (const strategy of fetchStrategies) {
        try {
          addDebugLog(`Trying fetch with ${strategy.name}...`);
          const response = await fetch(webhookUrl, strategy.options);
          
          addDebugLog('Response received:', {
            status: response.status,
            statusText: response.statusText,
            type: response.type
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          addDebugLog(`✅ Success with ${strategy.name}`);
          const rawText = await response.text();
          addDebugLog('Raw response:', rawText);

          const data = JSON.parse(rawText);
          addDebugLog('Parsed JSON data:', data);

          if (!Array.isArray(data)) {
            throw new Error('Response is not an array');
          }

          addDebugLog('✅ Successfully loaded data');
          return data;
        } catch (strategyError) {
          addDebugLog(`❌ Failed with ${strategy.name}:`, strategyError.message);
          continue;
        }
      }

      throw new Error('All fetch attempts failed. Check debug logs for details.');

    } catch (error) {
      addDebugLog('❌ Error in fetchGroceryData:', error.message);
      throw error;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchGroceryData();
        setGroceryData(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch grocery data:', err);
        setError(err.message);
        // Use sample data as fallback
        setGroceryData([
          { ItemID: 1, ItemName: 'Grapes', Category: 'Lunches', Store: 'Tom Thumb', GroceryStoreSection: 'Produce' },
          { ItemID: 2, ItemName: 'Pastry Pups', Category: 'Lunches', Store: "Trader Joe's", GroceryStoreSection: 'Frozen' },
          { ItemID: 3, ItemName: 'Almond Milk', Category: 'Breakfast', Store: 'Whole Foods', GroceryStoreSection: 'Refrigerated' },
          { ItemID: 4, ItemName: 'BelVita Breakfast biscuits', Category: 'Snacks', Store: 'Kroger', GroceryStoreSection: 'Snacks' },
          { ItemID: 5, ItemName: 'Peanut Butter', Category: 'General', Store: 'Costco', GroceryStoreSection: 'Pantry' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleItemToggle = (itemId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const getUniqueCategories = () => {
    const categories = groceryData.map(item => item.Category);
    return [...new Set(categories)];
  };

  const getFilteredData = () => {
    if (selectedCategory === 'all') {
      return groceryData;
    }
    return groceryData.filter(item => item.Category === selectedCategory);
  };

  const getGroupedData = () => {
    const filteredData = getFilteredData();
    
    if (groupBy === 'Category') {
      const grouped = {};
      filteredData.forEach(item => {
        if (!grouped[item.Category]) {
          grouped[item.Category] = [];
        }
        grouped[item.Category].push(item);
      });
      return grouped;
    } else if (groupBy === 'Store') {
      const grouped = {};
      filteredData.forEach(item => {
        if (!grouped[item.Store]) {
          grouped[item.Store] = [];
        }
        grouped[item.Store].push(item);
      });
      return grouped;
    } else if (groupBy === 'Store Section') {
      const grouped = {};
      filteredData.forEach(item => {
        if (!grouped[item.GroceryStoreSection]) {
          grouped[item.GroceryStoreSection] = [];
        }
        grouped[item.GroceryStoreSection].push(item);
      });
      return grouped;
    }
    
    return { 'All Items': filteredData };
  };

  const addNewItem = (category) => {
    const newItemName = prompt(`Enter new item for ${category}:`);
    if (newItemName && newItemName.trim()) {
      const newItem = {
        ItemID: Math.max(...groceryData.map(item => item.ItemID)) + 1,
        ItemName: newItemName.trim(),
        Category: category,
        Store: 'User Added',
        GroceryStoreSection: 'Miscellaneous'
      };
      setGroceryData(prev => [...prev, newItem]);
    }
  };

  const clearAllSelections = () => {
    setSelectedItems(new Set());
  };

  const navigateToPage = (page) => {
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  const renderNavigation = () => (
    <nav className={`fixed inset-y-0 left-0 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 z-30 w-64 bg-blue-800 text-white flex flex-col`}>
      <div className="p-4 bg-blue-900">
        <h1 className="text-xl font-bold">Grocery App</h1>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden absolute top-4 right-4 text-white"
        >
          ✕
        </button>
      </div>
      
      <div className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          <li>
            <button
              onClick={() => navigateToPage('grocery')}
              className={`w-full text-left px-3 py-2 rounded transition-colors ${
                currentPage === 'grocery' ? 'bg-blue-700' : 'hover:bg-blue-700'
              }`}
            >
              📋 Weekly Grocery List
            </button>
          </li>
          <li>
            <button
              onClick={() => navigateToPage('chatbot')}
              className={`w-full text-left px-3 py-2 rounded transition-colors ${
                currentPage === 'chatbot' ? 'bg-blue-700' : 'hover:bg-blue-700'
              }`}
            >
              🤖 AI Assistant
            </button>
          </li>
          <li>
            <button
              onClick={() => navigateToPage('coupons')}
              className={`w-full text-left px-3 py-2 rounded transition-colors ${
                currentPage === 'coupons' ? 'bg-blue-700' : 'hover:bg-blue-700'
              }`}
            >
              🎫 Coupons & Deals
            </button>
          </li>
        </ul>
      </div>
      
      <div className="p-4 border-t border-blue-700">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-sm text-blue-200 hover:text-white"
        >
          🐛 Debug Info
        </button>
      </div>
    </nav>
  );

  const renderGroceryPage = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your grocery list...</p>
          </div>
        </div>
      );
    }

    const groupedData = getGroupedData();
    const categories = getUniqueCategories();

    return (
      <div className="space-y-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-red-600 mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold text-red-800">Connection Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
                <p className="text-red-600 text-sm mt-1">Using sample data instead.</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-lg font-medium text-blue-900">For the week of August 3rd to August 9th, 2025</p>
          <p className="text-sm text-blue-700 mt-1">Please select items for this week's grocery list:</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-gray-700 font-medium">🔽 Group by:</span>
          <div className="flex gap-2">
            {['Category', 'Store', 'Store Section'].map(option => (
              <button
                key={option}
                onClick={() => setGroupBy(option)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  groupBy === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All Categories
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {category} ({groceryData.filter(item => item.Category === category).length})
            </button>
          ))}
        </div>

        <div className="space-y-6">
          {Object.entries(groupedData).map(([groupName, items]) => (
            <div key={groupName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  {groupBy}: {groupName}
                </h3>
                <button
                  onClick={() => addNewItem(groupName)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  ➕ Add Item
                </button>
              </div>
              <div className="p-4">
                <div className="grid gap-3">
                  {items.map(item => (
                    <div
                      key={item.ItemID}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        selectedItems.has(item.ItemID)
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleItemToggle(item.ItemID)}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.ItemID)}
                          onChange={() => handleItemToggle(item.ItemID)}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{item.ItemName}</p>
                          <div className="flex gap-4 text-sm text-gray-600 mt-1">
                            <span>🏪 {item.Store}</span>
                            <span>📍 {item.GroceryStoreSection}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {selectedItems.size > 0 && (
          <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg">
            <p className="font-medium">{selectedItems.size} items selected</p>
            <button
              onClick={clearAllSelections}
              className="mt-2 text-sm bg-blue-700 hover:bg-blue-800 px-3 py-1 rounded"
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {renderNavigation()}

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 lg:ml-0">
        <div className="bg-white shadow-sm border-b">
          <div className="flex items-center justify-between px-4 h-16">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-gray-600 hover:text-gray-800"
            >
              ☰
            </button>
            <h2 className="text-xl font-semibold text-gray-800">
              {currentPage === 'grocery' && '📋 Weekly Grocery Selection'}
              {currentPage === 'chatbot' && '🤖 AI Assistant'}
              {currentPage === 'coupons' && '🎫 Coupons & Deals'}
            </h2>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              🐛 Debug Info
            </button>
          </div>
        </div>

        <div className="p-6">
          {showDebug && (
            <div className="mb-6 p-4 bg-gray-900 text-white rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                📡 Debug Information
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

          {currentPage === 'grocery' && renderGroceryPage()}
          {currentPage === 'chatbot' && <ChatBot />}
          {currentPage === 'coupons' && <Coupons />}
        </div>
      </div>
    </div>
  );
}

export default App;
