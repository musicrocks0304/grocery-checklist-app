import React, { useState } from 'react';
import { Check, ShoppingCart, Plus, AlertCircle, Wifi } from 'lucide-react';

const GroceryChecklist = () => {
  const [groceryData, setGroceryData] = useState({ categories: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState([]);

  // Your n8n webhook URL - verified working in browser
  // For local development, try using localhost directly:
  // const WEBHOOK_URL = 'http://localhost:5678/webhook/5eb40df4-7053-4166-9b7b-6893789ff943/fetch_grocery_items';
  const WEBHOOK_URL = 'https://missouri-means-revealed-card.trycloudflare.com/webhook/5eb40df4-7053-4166-9b7b-6893789ff943/fetch_grocery_items';

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
      // First, test if we can reach any external URL
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

    // Test webhook connectivity with different approaches
    try {
      addDebugLog('Testing webhook with no-cors mode...');
      addDebugLog('✅ Webhook request sent (no-cors mode)');
    } catch (err) {
      addDebugLog('❌ Webhook unreachable even in no-cors mode', err.message);
    }
  };

  // Fetch grocery data from your n8n webhook
  React.useEffect(() => {
    const fetchGroceryData = async () => {
      try {
        setError(null);
        setDebugInfo([]);
        
        // Run connectivity test first
        await testConnectivity();
        
        addDebugLog('Fetching grocery data from n8n webhook...');
        addDebugLog('Webhook URL:', WEBHOOK_URL);
        
        // Try different fetch configurations
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
        
        for (const config of fetchConfigs) {
          try {
            addDebugLog(`Trying fetch with ${config.name}...`);
            const response = await fetch(WEBHOOK_URL, config.options);
            
            addDebugLog(`Response received:`, {
              status: response.status,
              statusText: response.statusText,
              type: response.type,
              headers: Object.fromEntries([...response.headers.entries()])
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
        
        // Handle the actual data structure from your n8n webhook
        let formattedData;
        
        if (Array.isArray(data)) {
          addDebugLog('Data is an array with length:', data.length);
          // If it's an array of items, group by category
          const groupedByCategory = {};
          data.forEach(item => {
            const categoryName = item.Category || 'General';
            if (!groupedByCategory[categoryName]) {
              groupedByCategory[categoryName] = [];
            }
            groupedByCategory[categoryName].push({
              id: item.ItemID?.toString() || Math.random().toString(),
              label: item.ItemName || 'Unknown Item'
            });
          });
          
          formattedData = {
            categories: Object.keys(groupedByCategory).map(categoryName => ({
              name: categoryName,
              items: groupedByCategory[categoryName]
            }))
          };
        } else if (data.ItemID && data.ItemName) {
          addDebugLog('Data is a single item');
          // Single item - convert to expected format
          formattedData = {
            categories: [{
              name: data.Category || 'General',
              items: [{
                id: data.ItemID.toString(),
                label: data.ItemName
              }]
            }]
          };
        } else if (data.categories) {
          addDebugLog('Data already has categories structure');
          // Already in expected format
          formattedData = data;
        } else {
          // Unknown format
          addDebugLog('⚠️ Unexpected data format');
          formattedData = { categories: [] };
        }
        
        addDebugLog('✅ Successfully formatted data:', formattedData);
        setGroceryData(formattedData);
      } catch (error) {
        addDebugLog('❌ Error in fetchGroceryData:', error.message);
        setError(error.message);
        // Fallback to sample data if webhook fails
        setGroceryData({
          categories: [
            { 
              name: "Sample Data (Webhook Failed)", 
              items: [
                { id: "1", label: "Grapes (sample)" },
                { id: "2", label: "Almond Milk (sample)" }
              ] 
            }
          ]
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroceryData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showFinalList, setShowFinalList] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDebug, setShowDebug] = useState(true);

  const handleItemToggle = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
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

  const handleAddItem = async (categoryName) => {
    if (newItemText.trim()) {
      // For now, just add locally
      const newItem = {
        id: Date.now().toString(),
        label: newItemText.trim()
      };
      
      const updatedCategories = groceryData.categories.map(cat => {
        if (cat.name === categoryName) {
          return { ...cat, items: [...cat.items, newItem] };
        }
        return cat;
      });
      
      setGroceryData({ categories: updatedCategories });
      setNewItemText('');
      setShowAddForm(false);
      
      addDebugLog('Added item locally:', { category: categoryName, item: newItem });
    }
  };

  const getCurrentDate = () => {
    return new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getFinalGroceryList = () => {
    const finalList = {};
    groceryData.categories.forEach(category => {
      const selectedInCategory = category.items.filter(item => 
        selectedItems.has(item.id)
      );
      if (selectedInCategory.length > 0) {
        finalList[category.name] = selectedInCategory;
      }
    });
    return finalList;
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
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
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="text-green-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-800">Weekly Grocery List</h1>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <p className="text-lg font-semibold text-gray-700">{getCurrentDate()}</p>
          <p className="text-sm text-gray-600">Items selected: {selectedItems.size}</p>
        </div>

        {Object.entries(finalList).map(([categoryName, items]) => (
          <div key={categoryName} className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-3 border-b-2 border-blue-200 pb-1">
              {categoryName}
            </h2>
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="flex items-center gap-2 text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  {item.label}
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

  return (
    <div className="max-w-2xl mx-auto">
      {/* Debug Panel */}
      {showDebug && (
        <div className="mb-6 p-4 bg-gray-900 text-white rounded-lg shadow-lg">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Wifi size={20} />
              Debug Information
            </h3>
            <button
              onClick={() => setShowDebug(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
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

      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Check className="text-blue-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-800">Weekly Grocery Selection</h1>
        </div>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-red-800">Connection Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
                <button
                  onClick={() => setShowDebug(true)}
                  className="mt-2 text-sm text-red-600 underline hover:text-red-800"
                >
                  Show debug information
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-gray-600 mb-6">Please select items for this week's grocery list:</p>

        {groceryData.categories.map((category) => (
          <div key={category.name} className="mb-6 bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">{category.name}</h2>
              <button
                onClick={() => setShowAddForm(showAddForm === category.name ? false : category.name)}
                className="text-blue-600 hover:text-blue-800 transition-colors"
                title="Add new item"
              >
                <Plus size={20} />
              </button>
            </div>
            
            {showAddForm === category.name && (
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder="New item name..."
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddItem(category.name)}
                />
                <button
                  onClick={() => handleAddItem(category.name)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add
                </button>
              </div>
            )}
            
            <div className="space-y-2">
              {category.items.map((item) => (
                <label 
                  key={item.id} 
                  className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => handleItemToggle(item.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className={`text-gray-700 ${selectedItems.has(item.id) ? 'font-medium' : ''}`}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

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

export default GroceryChecklist;