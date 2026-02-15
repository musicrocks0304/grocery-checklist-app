import React, { useState, useEffect } from "react";
import {
  Check,
  ShoppingCart,
  Plus,
  AlertCircle,
  Wifi,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
  Layers,
  ShoppingBag,
} from "lucide-react";
import toast from "react-hot-toast";
import { getWeekDateRange, getWeekDates } from "./utils/weekDates";


// Memoized grocery item component to prevent unnecessary re-renders
const GroceryItem = React.memo(({
  item,
  isSelected,
  quantity,
  onToggle,
  onQuantityChange,
  onRemove
}) => {
  const itemId = item.ItemID.toString();

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors group min-h-[52px] relative">
      <input
        type="checkbox"
        id={`item-${item.ItemID}`}
        checked={isSelected}
        onChange={() => onToggle(itemId)}
        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 flex-shrink-0"
      />
      <label
        htmlFor={`item-${item.ItemID}`}
        className={`flex-1 cursor-pointer ${isSelected ? "font-medium" : ""}`}
      >
        <span className="text-gray-700">{item.ItemName}</span>
      </label>

      {/* Always reserve space for quantity dropdown to prevent layout shifts */}
      <div className="flex items-center gap-2 w-20 flex-shrink-0">
        {isSelected ? (
          <>
            <label className="text-sm text-gray-600">Qty:</label>
            <select
              value={quantity || 1}
              onChange={(e) => onQuantityChange(itemId, e.target.value)}
              className="w-16 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {[...Array(10)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </>
        ) : (
          // Reserve space when not selected to prevent layout shifts
          <div className="w-16 h-8"></div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(item);
        }}
        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity w-6 h-6 flex items-center justify-center flex-shrink-0"
        title="Remove item from database"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
});

const GroceryChecklist = ({ onNavigate, onUnsavedChanges, onStartShopping, debugMode = false }) => {
  const [groceryData, setGroceryData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [activeTab, setActiveTab] = useState("");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [itemQuantities, setItemQuantities] = useState(new Map());
  const [showFinalList, setShowFinalList] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    itemName: "",
    category: "",
    type: "Basic",
    store: "",
    groceryStoreSection: "",
  });
  const [itemToRemove, setItemToRemove] = useState(null);
  const [isSavingList, setIsSavingList] = useState(false);
  const [listSaved, setListSaved] = useState(false);
  const [groupBy, setGroupBy] = useState("GroceryStoreSection"); // New state for grouping mode
  const [typeFilter, setTypeFilter] = useState("All"); // New state for type filtering
  const [dataSourceFilter, setDataSourceFilter] = useState("All"); // New state for data source filtering

  // Notify parent when user has unsaved changes (final list view)
  useEffect(() => {
    if (onUnsavedChanges) {
      onUnsavedChanges(showFinalList);
    }
  }, [showFinalList, onUnsavedChanges]);

  // Your n8n webhook URL - verified working in browser
  const WEBHOOK_URL =
    "https://n8n-grocery.needexcelexpert.com/webhook/5eb40df4-7053-4166-9b7b-6893789ff943/fetch_grocery_items";

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo((prev) => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || "");
  };

  // Fetch grocery data from your n8n webhook
  React.useEffect(() => {
    const fetchGroceryData = async () => {
      try {
        setError(null);
        setDebugInfo([]);

        addDebugLog("Fetching grocery data from n8n webhook...");
        addDebugLog("Webhook URL:", WEBHOOK_URL);

        const fetchConfigs = [
          {
            name: "Standard CORS",
            options: {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              mode: "cors",
            },
          },
          {
            name: "With Content-Type",
            options: {
              method: "GET",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              mode: "cors",
            },
          },
          {
            name: "Simple Request",
            options: {
              method: "GET",
              mode: "cors",
            },
          },
        ];

        let successfulResponse = null;

        // Get week date information
        const weekData = getWeekDates();

        // Add week parameters to the webhook URL
        const urlWithParams = new URL(WEBHOOK_URL);
        urlWithParams.searchParams.append("weekStartDate", weekData.startDate);
        urlWithParams.searchParams.append("weekEndDate", weekData.endDate);
        urlWithParams.searchParams.append(
          "weekDateRange",
          weekData.displayRange,
        );
        urlWithParams.searchParams.append(
          "timestamp",
          new Date().toISOString(),
        );

        for (const config of fetchConfigs) {
          try {
            addDebugLog(`Trying fetch with ${config.name}...`);
            const response = await fetch(
              urlWithParams.toString(),
              config.options,
            );

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
              addDebugLog(
                `⚠️ Non-OK status with ${config.name}: ${response.status}`,
              );
            }
          } catch (err) {
            addDebugLog(`❌ Failed with ${config.name}: ${err.message}`);
          }
        }

        if (!successfulResponse) {
          throw new Error(
            "All fetch attempts failed. Check debug logs for details.",
          );
        }

        const responseText = await successfulResponse.text();
        addDebugLog("Raw response:", responseText);

        let data;
        try {
          data = JSON.parse(responseText);
          addDebugLog("Parsed JSON data:", data);
        } catch (parseError) {
          addDebugLog("❌ JSON parse error:", parseError.message);
          throw new Error(
            `Invalid JSON response: ${responseText.substring(0, 100)}...`,
          );
        }

        setGroceryData(data);

        // Initialize selected items and quantities based on IsSelected field
        const preSelectedItems = new Set();
        const preSelectedQuantities = new Map();

        data.forEach((item) => {
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
        const groups = getGroups(data, groupBy);
        if (groups.length > 0) {
          setActiveTab(groups[0]);
        }

        addDebugLog("✅ Successfully loaded data");
      } catch (error) {
        addDebugLog("❌ Error in fetchGroceryData:", error.message);
        setError(error.message);
        // Fallback to sample data if webhook fails - now includes new fields
        const sampleData = [
          {
            ItemID: 1,
            ItemName: "Grapes",
            Category: "Lunches",
            Store: "Tom Thumb",
            GroceryStoreSection: "Produce",
          },
          {
            ItemID: 2,
            ItemName: "Pastry Pups",
            Category: "Lunches",
            Store: "Trader Joe's",
            GroceryStoreSection: "Frozen",
          },
          {
            ItemID: 3,
            ItemName: "Almond Milk",
            Category: "Breakfast",
            Store: "Whole Foods",
            GroceryStoreSection: "Refrigerated",
          },
          {
            ItemID: 4,
            ItemName: "BelVita Breakfast biscuits",
            Category: "Snacks",
            Store: "Kroger",
            GroceryStoreSection: "Snacks",
          },
          {
            ItemID: 5,
            ItemName: "Peanut Butter",
            Category: "General",
            Store: "Costco",
            GroceryStoreSection: "Pantry",
          },
        ];
        setGroceryData(sampleData);
        setActiveTab(getGroups(sampleData, groupBy)[0]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroceryData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get filtered data based on type and data source filters
  const getFilteredData = (data = groceryData) => {
    let filteredData = data;

    // Apply type filter
    if (typeFilter !== "All") {
      filteredData = filteredData.filter((item) => item.Type === typeFilter);
    }

    // Apply data source filter
    if (dataSourceFilter !== "All") {
      filteredData = filteredData.filter((item) => item.DataSource === dataSourceFilter);
    }

    return filteredData;
  };

  // Get unique groups based on the grouping mode and type filter
  const getGroups = (data = groceryData, groupingKey = groupBy) => {
    const filteredData = getFilteredData(data);
    return [...new Set(filteredData.map((item) => item[groupingKey]))]
      .filter(Boolean)
      .sort();
  };

  // Get items by group with type filter applied
  const getItemsByGroup = (group, groupingKey = groupBy) => {
    const filteredData = getFilteredData(groceryData);
    return filteredData
      .filter((item) => item[groupingKey] === group)
      .sort((a, b) => a.ItemName.localeCompare(b.ItemName));
  };

  // Handle grouping mode change
  const handleGroupByChange = (newGroupBy) => {
    setGroupBy(newGroupBy);
    const groups = getGroups(groceryData, newGroupBy);
    if (groups.length > 0) {
      setActiveTab(groups[0]);
    }
  };

  // Handle type filter change
  const handleTypeFilterChange = (newTypeFilter) => {
    setTypeFilter(newTypeFilter);
    const groups = getGroups(groceryData, groupBy);
    if (groups.length > 0) {
      setActiveTab(groups[0]);
    }
  };

  // Handle data source filter change
  const handleDataSourceFilterChange = (newDataSourceFilter) => {
    setDataSourceFilter(newDataSourceFilter);
    const groups = getGroups(groceryData, groupBy);
    if (groups.length > 0) {
      setActiveTab(groups[0]);
    }
  };

  const handleItemToggle = React.useCallback((itemId) => {
    setSelectedItems(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(itemId)) {
        newSelected.delete(itemId);
      } else {
        newSelected.add(itemId);
      }
      return newSelected;
    });
    setItemQuantities(prev => {
      const newQuantities = new Map(prev);
      if (newQuantities.has(itemId)) {
        newQuantities.delete(itemId);
      } else {
        newQuantities.set(itemId, 1); // Default quantity of 1
      }
      return newQuantities;
    });
  }, []);

  const handleQuantityChange = React.useCallback((itemId, quantity) => {
    setItemQuantities(prev => {
      const newQuantities = new Map(prev);
      newQuantities.set(itemId, parseInt(quantity));
      return newQuantities;
    });
  }, []);

  const handleRemoveItem = async (item) => {
    setShowAddPanel(false); // Close add panel to prevent overlapping modals
    setItemToRemove(item);
  };

  const confirmRemoveItem = async () => {
    if (!itemToRemove) return;

    try {
      addDebugLog("Removing item from database:", itemToRemove);

      const weekData = getWeekDates();

      // Call the deactivate webhook
      const webhookURL = `https://n8n-grocery.needexcelexpert.com/webhook/deactivate_grocery_item`;
      const payload = {
        itemId: itemToRemove.ItemID.toString(),
        itemName: itemToRemove.ItemName.trim(),
        category: itemToRemove.Category.trim(),
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString(),
      };
      addDebugLog("Deactivate webhook URL:", webhookURL, "Payload:", payload);

      const response = await fetch(webhookURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        mode: "cors",
      });

      addDebugLog("Deactivate webhook response:", {
        status: response.status,
        statusText: response.statusText,
      });

      let successMessage = "";
      if (response.ok) {
        addDebugLog("✅ Item successfully deactivated in database");
        successMessage = `✅ "${itemToRemove.ItemName.trim()}" has been successfully removed from your grocery database and won't appear in future lists.`;
      } else {
        addDebugLog("⚠️ Webhook returned non-OK status:", response.status);
        successMessage = `"${itemToRemove.ItemName.trim()}" has been removed from this week's list. Database update status: ${response.status}`;
      }

      // Remove from local state regardless of webhook success
      setGroceryData(
        groceryData.filter((item) => item.ItemID !== itemToRemove.ItemID),
      );

      // Remove from selected items if it was selected
      const newSelected = new Set(selectedItems);
      const newQuantities = new Map(itemQuantities);
      newSelected.delete(itemToRemove.ItemID.toString());
      newQuantities.delete(itemToRemove.ItemID.toString());
      setSelectedItems(newSelected);
      setItemQuantities(newQuantities);

      addDebugLog("✅ Item removed from local state");

      // Show success message to user
      toast.success(successMessage);
    } catch (error) {
      addDebugLog("❌ Error removing item:", error.message);

      // Still remove from local state even if webhook fails
      setGroceryData(
        groceryData.filter((item) => item.ItemID !== itemToRemove.ItemID),
      );
      const newSelected = new Set(selectedItems);
      const newQuantities = new Map(itemQuantities);
      newSelected.delete(itemToRemove.ItemID.toString());
      newQuantities.delete(itemToRemove.ItemID.toString());
      setSelectedItems(newSelected);
      setItemQuantities(newQuantities);

      toast(
        `"${itemToRemove.ItemName.trim()}" removed from this week's list, but there was a connection issue with the database.`,
        { icon: "⚠️" },
      );
    } finally {
      setItemToRemove(null);
    }
  };

  const handleSubmit = async () => {
    if (selectedItems.size === 0) {
      toast.error("Please select at least one item for your grocery list.");
      return;
    }

    // Simply show the final list
    setShowFinalList(true);
  };

  const handleAddItem = async () => {
    if (newItemForm.itemName.trim()) {
      const newItem = {
        ItemID: Math.floor(Math.random() * 2147483647),
        ItemName: newItemForm.itemName.trim(),
        Category: newItemForm.category || "General",
        Type: newItemForm.type,
        Store: newItemForm.store || "Tom Thumb",
        GroceryStoreSection: newItemForm.groceryStoreSection || "Pantry",
      };

      const weekData = getWeekDates();

      try {
        addDebugLog("Sending new item to n8n webhook:", newItem);

        // Call the n8n webhook to add the item
        const webhookURL = `https://n8n-grocery.needexcelexpert.com/webhook/add_grocery_items`;
        const payload = {
          itemName: newItem.ItemName,
          category: newItem.Category,
          type: newItem.Type,
          store: newItem.Store,
          groceryStoreSection: newItem.GroceryStoreSection,
          weekStartDate: weekData.startDate,
          weekEndDate: weekData.endDate,
          weekDateRange: weekData.displayRange,
          timestamp: new Date().toISOString(),
        };
        addDebugLog("Webhook URL:", webhookURL, "Payload:", payload);

        const response = await fetch(webhookURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          mode: "cors",
        });

        addDebugLog("Webhook response:", {
          status: response.status,
          statusText: response.statusText,
        });

        if (response.ok) {
          addDebugLog("✅ Item successfully added to database");

          // Add to local state for immediate UI update
          setGroceryData([...groceryData, newItem]);

          // Reset form and close panel
          setNewItemForm({
            itemName: "",
            category: "",
            type: "Basic",
            store: "",
            groceryStoreSection: "",
          });
          setShowAddPanel(false);

          toast.success("Item successfully added to your grocery database!");
        } else {
          throw new Error(`Webhook returned status: ${response.status}`);
        }
      } catch (error) {
        addDebugLog("❌ Error adding item to webhook:", error.message);

        // Still add locally as fallback
        setGroceryData([...groceryData, newItem]);
        setNewItemForm({
          itemName: "",
          category: "",
          type: "Basic",
          store: "",
          groceryStoreSection: "",
        });
        setShowAddPanel(false);

        toast(
          "Item added locally, but there was an issue saving to the database.",
          { icon: "⚠️" },
        );
      }
    }
  };

  const handleCancelAdd = () => {
    setNewItemForm({
      itemName: "",
      category: "",
      type: "Basic",
      store: "",
      groceryStoreSection: "",
    });
    setShowAddPanel(false);
  };

  const getFinalGroceryList = () => {
    const selectedItemIds = Array.from(selectedItems);
    const selectedGroceryItems = groceryData
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
            Loading grocery items from your database...
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Connecting to n8n webhook...
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
            Weekly Grocery List
          </h1>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <p className="text-lg font-semibold text-gray-700">
            {getWeekDateRange()}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Items selected: {selectedItems.size}
          </p>
        </div>

        {Object.entries(finalList)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([categoryName, items]) => (
            <div key={categoryName} className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3 border-b-2 border-blue-200 pb-1">
                {categoryName}
              </h2>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.ItemID}
                    className="flex items-center gap-2 text-gray-700"
                  >
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="flex-1">{item.ItemName}</span>
                    <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      Qty: {item.quantity}
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
            disabled={isSavingList}
            onClick={async () => {
              setIsSavingList(true);
              try {
                // Get full metadata of all selected items with quantities
                const selectedGroceryItems = groceryData
                  .filter((item) => selectedItems.has(item.ItemID.toString()))
                  .map((item) => ({
                    ...item,
                    quantity: itemQuantities.get(item.ItemID.toString()) || 1,
                  }));

                addDebugLog(
                  "Sending selected items to create_grocery_list webhook:",
                  selectedGroceryItems,
                );

                // Get week data for the webhook
                const weekData = getWeekDates();

                // Build POST payload with items array
                const webhookURL = `https://n8n-grocery.needexcelexpert.com/webhook/create_grocery_list`;
                const payload = {
                  action: "create_grocery_list",
                  selectedItemsCount: selectedGroceryItems.length,
                  weekStartDate: weekData.startDate,
                  weekEndDate: weekData.endDate,
                  weekDateRange: weekData.displayRange,
                  timestamp: new Date().toISOString(),
                  items: selectedGroceryItems.map((item) => ({
                    id: item.ItemID.toString(),
                    name: item.ItemName,
                    category: item.Category,
                    store: item.Store,
                    section: item.GroceryStoreSection,
                    type: item.Type || "Basic",
                    quantity: item.quantity.toString(),
                  })),
                };
                addDebugLog("Create grocery list webhook URL:", webhookURL, "Payload:", payload);

                const response = await fetch(webhookURL, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify(payload),
                  mode: "cors",
                });

                addDebugLog("Create grocery list webhook response:", {
                  status: response.status,
                  statusText: response.statusText,
                });

                if (response.ok) {
                  addDebugLog("✅ Grocery list successfully sent to webhook");
                  toast.success("Grocery list saved successfully!");
                  setListSaved(true);
                } else {
                  addDebugLog(
                    "⚠️ Webhook returned non-OK status:",
                    response.status,
                  );
                  toast(
                    "Grocery list saved locally, but there was an issue with the webhook.",
                    { icon: "⚠️" },
                  );
                }
              } catch (error) {
                addDebugLog(
                  "❌ Error submitting to create_grocery_list webhook:",
                  error.message,
                );
                toast(
                  "Grocery list saved locally, but there was a connection issue.",
                  { icon: "⚠️" },
                );
              } finally {
                setIsSavingList(false);
              }
            }}
            className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 ${
              isSavingList
                ? "bg-green-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {isSavingList ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Saving...
              </>
            ) : (
              "Save List"
            )}
          </button>
          {listSaved && onStartShopping && (
            <button
              onClick={() => {
                const selectedGroceryItems = groceryData
                  .filter((item) => selectedItems.has(item.ItemID.toString()))
                  .map((item) => ({
                    ...item,
                    quantity: itemQuantities.get(item.ItemID.toString()) || 1,
                  }));
                onStartShopping({
                  items: selectedGroceryItems,
                  savedAt: new Date().toISOString(),
                  weekDateRange: getWeekDateRange(),
                });
              }}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all flex items-center gap-2 font-medium shadow-md"
            >
              <ShoppingBag size={20} />
              Start Shopping
            </button>
          )}
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
                  onChange={(e) =>
                    setNewItemForm((prev) => ({
                      ...prev,
                      itemName: e.target.value,
                    }))
                  }
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
                  onChange={(e) =>
                    setNewItemForm((prev) => ({
                      ...prev,
                      category: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select category...</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Breakfast">Breakfast</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Pantry">Pantry</option>
                  <option value="Snacks">Snacks</option>
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
                      checked={newItemForm.type === "Basic"}
                      onChange={(e) =>
                        setNewItemForm((prev) => ({
                          ...prev,
                          type: e.target.value,
                        }))
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Basic</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="type"
                      value="Periodic"
                      checked={newItemForm.type === "Periodic"}
                      onChange={(e) =>
                        setNewItemForm((prev) => ({
                          ...prev,
                          type: e.target.value,
                        }))
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Periodic</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Basic: Items bought as needed | Periodic: Items bought
                  regularly
                </p>
              </div>

              {/* Store */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store *
                </label>
                <select
                  value={newItemForm.store}
                  onChange={(e) =>
                    setNewItemForm((prev) => ({
                      ...prev,
                      store: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select store...</option>
                  <option value="HEB">HEB</option>
                  <option value="Sprouts">Sprouts</option>
                  <option value="Target">Target</option>
                  <option value="Tom Thumb">Tom Thumb</option>
                  <option value="Trader Joe's">Trader Joe's</option>
                  <option value="Whole Foods">Whole Foods</option>
                </select>
              </div>

              {/* Grocery Store Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grocery Store Section *
                </label>
                <select
                  value={newItemForm.groceryStoreSection}
                  onChange={(e) =>
                    setNewItemForm((prev) => ({
                      ...prev,
                      groceryStoreSection: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select section...</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Frozen">Frozen</option>
                  <option value="Health">Health</option>
                  <option value="Household">Household</option>
                  <option value="Meat">Meat & Seafood</option>
                  <option value="Pantry">Pantry</option>
                  <option value="Produce">Produce</option>
                  <option value="Refrigerated">Refrigerated</option>
                  <option value="Snacks">Snacks</option>
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
                disabled={
                  !newItemForm.itemName.trim() ||
                  !newItemForm.category ||
                  !newItemForm.store ||
                  !newItemForm.groceryStoreSection
                }
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
              <AlertCircle
                className="text-red-600 flex-shrink-0 mt-1"
                size={24}
              />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Remove Item from Database?
                </h3>
                <p className="mt-2 text-gray-600">
                  Are you sure you want to permanently remove{" "}
                  <strong>"{itemToRemove.ItemName}"</strong> from the{" "}
                  {itemToRemove.Category} category?
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  This action will deactivate the item in your database and it
                  won't appear in future grocery lists.
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
            <h1 className="text-2xl font-bold text-gray-800">
              Grocery Staples
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Debug Toggle - only visible with ?debug=true */}
            {debugMode && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
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
                <p className="font-semibold text-red-800">Connection Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
                <p className="text-red-600 text-sm mt-1">
                  Using sample data instead.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-lg font-medium text-blue-900">
            {getWeekDateRange()}
          </p>
        </div>

        <p className="text-gray-600 mb-6">
          Please select items for this week's grocery list:
        </p>

        {/* Grouping and Filtering Controls */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
          {/* Item Type Filter Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <span className="font-medium text-gray-700 whitespace-nowrap">Item Type:</span>
            <div className="flex flex-wrap gap-2">
              {["All", "Basic", "Periodic"].map((type) => (
                <button
                  key={type}
                  onClick={() => handleTypeFilterChange(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === type
                      ? "bg-green-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Data Source Filter Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <span className="font-medium text-gray-700 whitespace-nowrap">Data Source:</span>
            <div className="flex flex-wrap gap-2">
              {["All", "Staples", "MealIngredients"].map((source) => (
                <button
                  key={source}
                  onClick={() => handleDataSourceFilterChange(source)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    dataSourceFilter === source
                      ? "bg-purple-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {source === "MealIngredients" ? "Meals" : source}
                </button>
              ))}
            </div>
          </div>

          {/* Group By Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Layers size={20} />
              <span className="font-medium whitespace-nowrap">Group by:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Category", "Store", "GroceryStoreSection"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleGroupByChange(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    groupBy === mode
                      ? "bg-blue-600 text-white"
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
            {groups.map((group) => {
              const groupItems = getItemsByGroup(group);
              const selectedCount = groupItems.filter(item => selectedItems.has(item.ItemID.toString())).length;
              return (
                <button
                  key={group}
                  onClick={() => setActiveTab(group)}
                  className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
                    activeTab === group
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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

        {/* Items for Active Group */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              {groupBy === "GroceryStoreSection" ? "Store Section" : groupBy}:{" "}
              {activeTab}
            </h2>
            <div className="flex items-center gap-3">
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
                        newMap.set(id, 1);
                      }
                    });
                    return newMap;
                  });
                }}
                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                {currentGroupItems.length > 0 && currentGroupItems.every(item => selectedItems.has(item.ItemID.toString()))
                  ? "Deselect All"
                  : "Select All"}
              </button>
              <button
                onClick={() => setShowAddPanel(true)}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                title="Add new item"
              >
                <Plus size={20} />
                Add Item
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg bg-white">
            <div className="space-y-1 p-2">
              {currentGroupItems.map((item) => (
                <GroceryItem
                  key={item.ItemID}
                  item={item}
                  isSelected={selectedItems.has(item.ItemID.toString())}
                  quantity={itemQuantities.get(item.ItemID.toString())}
                  onToggle={handleItemToggle}
                  onQuantityChange={handleQuantityChange}
                  onRemove={handleRemoveItem}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 text-sm text-gray-600 flex items-center">
            Selected: {selectedItems.size} item
            {selectedItems.size !== 1 ? "s" : ""}
          </div>
          <button
            onClick={handleSubmit}
            disabled={selectedItems.size === 0}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Review Selection
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroceryChecklist;
