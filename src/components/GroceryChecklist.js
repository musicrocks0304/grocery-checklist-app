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
  Zap,
  SlidersHorizontal,
} from "lucide-react";
import toast from "react-hot-toast";
import { getWeekDateRange, getWeekDates } from "../utils/weekDates";
import CouponMatchPanel from "./CouponMatchPanel";
import { ENDPOINTS, apiFetch, showApiError } from "../config/api";
import { GROCERY_SAMPLE_DATA } from "../utils/fallbackData";


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
    <div className="flex items-center gap-3 p-3 hover:bg-background rounded-lg transition-colors group min-h-[52px] relative">
      <input
        type="checkbox"
        id={`item-${item.ItemID}`}
        checked={isSelected}
        onChange={() => onToggle(itemId)}
        className="w-5 h-5 text-primary rounded focus:ring-focus flex-shrink-0"
      />
      <label
        htmlFor={`item-${item.ItemID}`}
        className={`flex-1 cursor-pointer ${isSelected ? "font-medium" : ""}`}
      >
        <span className="text-body">{item.ItemName}</span>
      </label>

      {/* Always reserve space for quantity dropdown to prevent layout shifts */}
      <div className="flex items-center gap-2 w-20 flex-shrink-0">
        {isSelected ? (
          <>
            <label className="text-sm text-body">Qty:</label>
            <select
              value={quantity || 1}
              onChange={(e) => onQuantityChange(itemId, e.target.value)}
              className="w-16 px-2 py-1 border border-default rounded focus:outline-none focus:ring-2 focus:ring-focus text-sm"
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
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-danger hover:text-danger-hover transition-opacity w-6 h-6 flex items-center justify-center flex-shrink-0"
        title="Remove item from database"
        aria-label="Remove item from database"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
});

const WEBHOOK_URL = ENDPOINTS.fetchGroceryItems;

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
  const [couponMatches, setCouponMatches] = useState(null);
  const [isMatchingCoupons, setIsMatchingCoupons] = useState(false);
  const [groupBy, setGroupBy] = useState("GroceryStoreSection"); // New state for grouping mode
  const [typeFilter, setTypeFilter] = useState("All"); // New state for type filtering
  const [dataSourceFilter, setDataSourceFilter] = useState("All"); // New state for data source filtering
  const [quickAddText, setQuickAddText] = useState(""); // One-off quick-add input
  const [isAddingOneOff, setIsAddingOneOff] = useState(false); // Loading state for one-off add
  const [showFilters, setShowFilters] = useState(false); // Collapsed on mobile by default

  // Notify parent when user has unsaved changes (final list view)
  useEffect(() => {
    if (onUnsavedChanges) {
      onUnsavedChanges(showFinalList);
    }
  }, [showFinalList, onUnsavedChanges]);

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
            const response = await apiFetch(
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
        showApiError(error, () => fetchGroceryData());
        // Fallback to sample data if webhook fails
        setGroceryData(GROCERY_SAMPLE_DATA);
        setActiveTab(getGroups(GROCERY_SAMPLE_DATA, groupBy)[0]);
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
      const webhookURL = ENDPOINTS.deactivateGroceryItem;
      const payload = {
        itemId: itemToRemove.ItemID.toString(),
        itemName: itemToRemove.ItemName.trim(),
        category: itemToRemove.Category.trim(),
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString(),
      };
      addDebugLog("Deactivate webhook URL:", webhookURL, "Payload:", payload);

      const response = await apiFetch(webhookURL, {
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

      if (response.ok) {
        addDebugLog("✅ Item successfully deactivated in database");

        // Remove from local state only after server confirms
        setGroceryData(
          groceryData.filter((item) => item.ItemID !== itemToRemove.ItemID),
        );
        const newSelected = new Set(selectedItems);
        const newQuantities = new Map(itemQuantities);
        newSelected.delete(itemToRemove.ItemID.toString());
        newQuantities.delete(itemToRemove.ItemID.toString());
        setSelectedItems(newSelected);
        setItemQuantities(newQuantities);

        toast.success(`"${itemToRemove.ItemName.trim()}" removed from your grocery database.`);
      } else {
        addDebugLog("⚠️ Webhook returned non-OK status:", response.status);
        toast.error(`Failed to remove "${itemToRemove.ItemName.trim()}". Server returned ${response.status}.`);
      }
    } catch (error) {
      addDebugLog("❌ Error removing item:", error.message);
      toast.error(`Failed to remove "${itemToRemove.ItemName.trim()}". Check your connection.`);
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
        const webhookURL = ENDPOINTS.addGroceryItems;
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

        const response = await apiFetch(webhookURL, {
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
        toast.error("Failed to add item. Check your connection and try again.");
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

  // Parse quick-add text like "2 lbs chicken breast" into { quantity, unit, name }
  const parseQuickAdd = (text) => {
    const trimmed = text.trim();
    // Match: number + unit + item name (e.g. "2 lbs chicken breast", "1.5 oz cheese")
    const match = trimmed.match(/^(\d+\.?\d*)\s+(lbs?|oz|cups?|cans?|bags?|boxes?|bottles?|gallons?|bunche?s?|packs?|pkg|dozen|doz|heads?|bundles?|jars?|cartons?|tubs?|rolls?|loave?s?|slices?|stalks?|cloves?|sprigs?|pints?|quarts?|liters?|ml|kg|g)\s+(.+)$/i);
    if (match) return { quantity: Math.ceil(parseFloat(match[1])), unit: match[2], name: match[3] };
    // Match: number + item name (e.g. "3 bananas")
    const numMatch = trimmed.match(/^(\d+)\s+(.+)$/);
    if (numMatch) return { quantity: parseInt(numMatch[1]), unit: null, name: numMatch[2] };
    // Plain text — default qty 1, no unit
    return { quantity: 1, unit: null, name: trimmed };
  };

  // Quick-add a one-off item (skips GroceryItems catalog, only for this week)
  const handleQuickAddOneOff = async () => {
    const raw = quickAddText.trim();
    if (!raw) return;

    const parsed = parseQuickAdd(raw);
    setIsAddingOneOff(true);
    const weekData = getWeekDates();

    try {
      const response = await apiFetch(ENDPOINTS.addOneOffItem, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: parsed.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          weekDateRange: weekData.displayRange,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Add to local state for immediate UI update
        const oneOffItem = {
          ItemID: `oneoff_${Date.now()}`,
          ItemName: parsed.name,
          Category: "General",
          Store: "HEB",
          GroceryStoreSection: "Other",
          Type: "OneOff",
          DataSource: "OneOff",
          IsSelected: 1,
          QuantitySelected: parsed.quantity,
          Unit: parsed.unit,
        };
        setGroceryData(prev => [...prev, oneOffItem]);
        setSelectedItems(prev => new Set([...prev, oneOffItem.ItemID.toString()]));
        setItemQuantities(prev => new Map([...prev, [oneOffItem.ItemID.toString(), parsed.quantity]]));
        toast.success(data.message || `${parsed.name} added as one-off item`);
        setQuickAddText("");
      } else {
        throw new Error(data.message || "Failed to add item");
      }
    } catch (err) {
      console.error("One-off add error:", err);
      toast.error("Failed to add one-off item. Check your connection.");
    } finally {
      setIsAddingOneOff(false);
    }
  };

  const getFinalGroceryList = () => {
    const selectedItemIds = Array.from(selectedItems);
    const selectedGroceryItems = groceryData
      .filter((item) => selectedItemIds.includes(item.ItemID.toString()))
      .map((item) => ({
        ...item,
        quantity: itemQuantities.get(item.ItemID.toString()) || 1,
        Unit: item.Unit || null,
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
            Loading grocery items from your database...
          </p>
          <p className="mt-2 text-sm text-muted">
            Connecting to n8n webhook...
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
          <h1 className="text-2xl font-bold text-heading font-display">
            Weekly Grocery List
          </h1>
        </div>

        <div className="bg-background p-4 rounded-xl mb-6">
          <p className="text-lg font-semibold text-body">
            {getWeekDateRange()}
          </p>
          <p className="text-sm text-body mt-1">
            Items selected: {selectedItems.size}
          </p>
        </div>

        {Object.entries(finalList)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([categoryName, items]) => (
            <div key={categoryName} className="mb-6">
              <h2 className="text-xl font-semibold text-heading mb-3 border-b-2 border-primary-border pb-1">
                {categoryName}
              </h2>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.ItemID}
                    className="flex items-center gap-2 text-body"
                  >
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="flex-1">{item.ItemName}</span>
                    <span className="text-sm font-medium text-primary bg-primary-light px-2 py-1 rounded">
                      {item.Unit ? `${item.quantity} ${item.Unit}` : `Qty: ${item.quantity}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => setShowFinalList(false)}
            className="px-6 py-2 bg-secondary text-white rounded-xl hover:bg-secondary-hover transition-colors"
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
                const webhookURL = ENDPOINTS.createGroceryList;
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
                    unit: item.Unit || null,
                  })),
                };
                addDebugLog("Create grocery list webhook URL:", webhookURL, "Payload:", payload);

                const response = await apiFetch(webhookURL, {
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

                  // Trigger AI coupon matching in the background
                  console.log('[coupon-match] Starting coupon matching...');
                  setIsMatchingCoupons(true);
                  try {
                    const matchResponse = await apiFetch(
                      ENDPOINTS.matchCoupons,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Accept: "application/json",
                        },
                        body: JSON.stringify({
                          items: selectedGroceryItems.map((item) => ({
                            name: item.ItemName,
                            category: item.Category,
                            store: item.Store,
                            quantity: item.quantity,
                          })),
                        }),
                        mode: "cors",
                      }
                    );
                    console.log('[coupon-match] Response status:', matchResponse.status);
                    if (matchResponse.ok) {
                      const matchData = await matchResponse.json();
                      console.log('[coupon-match] Raw response:', JSON.stringify(matchData).substring(0, 500));
                      // n8n returns array with one item containing matches
                      let matches = [];
                      if (Array.isArray(matchData)) {
                        for (const item of matchData) {
                          const m = item.matches || [];
                          if (m.length > matches.length) matches = m;
                        }
                      } else {
                        matches = matchData.matches || [];
                      }
                      console.log('[coupon-match] Parsed matches count:', matches.length);
                      if (matches.length > 0) {
                        setCouponMatches(matches);

                        // Persist coupon matches to DB (fire-and-forget)
                        apiFetch(ENDPOINTS.saveCouponMatches, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            weekDateRange: weekData.displayRange,
                            matches: matches.map(m => ({
                              groceryItemName: m.grocery_item,
                              couponHashId: m.coupon_hash_id,
                              confidence: m.confidence,
                              matchReason: m.reason,
                            })),
                          }),
                        }).catch(err => console.warn('[coupon-persist]', err.message));

                        addDebugLog(`✅ Found ${matches.length} coupon matches`);
                        toast.success(`Found ${matches.length} coupon matches! Scroll down to view.`);
                        // Auto-scroll to coupon panel after a brief delay for render
                        setTimeout(() => {
                          const panel = document.querySelector('[data-coupon-panel]');
                          if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 300);
                      } else {
                        addDebugLog("No coupon matches found for this list");
                        toast("No coupon matches found for your items.", { icon: "ℹ️" });
                      }
                    } else {
                      console.log('[coupon-match] Non-OK response:', matchResponse.status);
                      toast.error(`Coupon matching failed (status ${matchResponse.status})`);
                    }
                  } catch (matchErr) {
                    console.error('[coupon-match] Error:', matchErr);
                    addDebugLog("⚠️ Coupon matching failed:", matchErr.message);
                    toast.error(`Coupon matching error: ${matchErr.message}`);
                  } finally {
                    setIsMatchingCoupons(false);
                  }
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
            className={`px-6 py-2 text-white rounded-xl transition-colors flex items-center gap-2 ${
              isSavingList
                ? "bg-muted cursor-not-allowed"
                : "bg-primary hover:bg-primary-hover"
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
              className="px-6 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover transition-all flex items-center gap-2 font-medium shadow-warm"
            >
              <ShoppingBag size={20} />
              Start Shopping
            </button>
          )}
        </div>

        {/* Coupon matching status */}
        {isMatchingCoupons && (
          <div className="mt-4 flex items-center gap-3 p-3 bg-primary-light border border-primary-border rounded-xl">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
            <p className="text-sm text-primary">Finding coupon matches for your grocery list...</p>
          </div>
        )}

        {/* Coupon match results */}
        {couponMatches && (
          <div data-coupon-panel>
            <CouponMatchPanel
              matches={couponMatches}
              onDismiss={() => setCouponMatches(null)}
            />
          </div>
        )}
      </div>
    );
  }

  const groups = getGroups();
  const currentGroupItems = getItemsByGroup(activeTab);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Add Item Side Panel */}
      {showAddPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50">
          <div className="bg-surface h-full w-full sm:w-96 shadow-warm-lg overflow-y-auto">
            <div className="bg-primary text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Plus size={24} />
                  <h2 className="text-xl font-bold">Add New Grocery Item</h2>
                </div>
                <button
                  onClick={handleCancelAdd}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
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
                <label className="block text-sm font-medium text-body mb-2">
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
                  className="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-body mb-2">
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
                  className="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
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
                <label className="block text-sm font-medium text-body mb-2">
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
                      className="w-4 h-4 text-primary border-default focus:ring-focus"
                    />
                    <span className="ml-2 text-sm text-body">Basic</span>
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
                      className="w-4 h-4 text-primary border-default focus:ring-focus"
                    />
                    <span className="ml-2 text-sm text-body">Periodic</span>
                  </label>
                </div>
                <p className="text-xs text-muted mt-1">
                  Basic: Items bought as needed | Periodic: Items bought
                  regularly
                </p>
              </div>

              {/* Store */}
              <div>
                <label className="block text-sm font-medium text-body mb-2">
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
                  className="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
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
                <label className="block text-sm font-medium text-body mb-2">
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
                  className="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
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
            <div className="border-t bg-background p-6 flex gap-3">
              <button
                onClick={handleCancelAdd}
                className="flex-1 px-4 py-2 text-body bg-default rounded-xl hover:bg-background transition-colors"
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
                className="flex-1 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:bg-muted disabled:cursor-not-allowed transition-colors"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {itemToRemove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle
                className="text-danger flex-shrink-0 mt-1"
                size={24}
              />
              <div>
                <h3 className="text-lg font-semibold text-heading">
                  Remove Item from Database?
                </h3>
                <p className="mt-2 text-body">
                  Are you sure you want to permanently remove{" "}
                  <strong>"{itemToRemove.ItemName}"</strong> from the{" "}
                  {itemToRemove.Category} category?
                </p>
                <p className="mt-2 text-sm text-muted">
                  This action will deactivate the item in your database and it
                  won't appear in future grocery lists.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setItemToRemove(null)}
                className="px-4 py-2 text-body bg-default rounded-xl hover:bg-background transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveItem}
                className="px-4 py-2 bg-danger text-white rounded-xl hover:bg-danger-hover transition-colors"
              >
                Remove Item
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Check className="text-primary" size={28} />
            <h1 className="text-2xl font-bold text-heading font-display">
              Grocery Staples
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
                <p className="font-semibold text-danger">Connection Error</p>
                <p className="text-danger text-sm mt-1">{error}</p>
                <p className="text-danger text-sm mt-1">
                  Using sample data instead.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-primary-light border border-primary-border rounded-xl p-2.5 sm:p-4 mb-3 sm:mb-6">
          <p className="text-sm sm:text-lg font-medium text-primary">
            {getWeekDateRange()}
          </p>
        </div>

        {/* Quick-add one-off item bar */}
        <div className="mb-3 sm:mb-6 flex gap-2">
          <div className="flex-1 relative">
            <Zap size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleQuickAddOneOff(); }}
              placeholder="Quick add one-off item..."
              className="w-full pl-9 pr-3 py-2 sm:py-2.5 border border-default rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-xs sm:text-sm transition-colors duration-200"
              disabled={isAddingOneOff}
            />
          </div>
          <button
            onClick={handleQuickAddOneOff}
            disabled={!quickAddText.trim() || isAddingOneOff}
            className="px-3 py-2 sm:px-4 sm:py-2.5 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:bg-muted disabled:cursor-not-allowed transition-colors text-xs sm:text-sm font-medium flex items-center gap-1.5"
          >
            <Plus size={16} />
            {isAddingOneOff ? "Adding..." : "Add"}
          </button>
        </div>

        <p className="hidden sm:block text-body mb-6">
          Please select items for this week's grocery list:
        </p>

        {/* Grouping and Filtering Controls — collapsible on mobile */}
        <div className="mb-3 sm:mb-6">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden flex items-center gap-2 px-3 py-2 mb-2 rounded-xl text-sm font-medium text-body bg-background border border-default w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal size={16} />
              Filters & Grouping
              {(typeFilter !== "All" || dataSourceFilter !== "All" || groupBy !== "GroceryStoreSection") && (
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
              )}
            </span>
            {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <div className={`${showFilters ? "block" : "hidden"} sm:block p-3 sm:p-4 bg-background rounded-xl space-y-3 sm:space-y-4`}>
            {/* Item Type Filter Section */}
            <div className="flex flex-row items-center gap-2 sm:gap-4">
              <span className="font-medium text-body whitespace-nowrap text-xs sm:text-sm">Type:</span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {["All", "Basic", "Periodic"].map((type) => (
                  <button
                    key={type}
                    onClick={() => handleTypeFilterChange(type)}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                      typeFilter === type
                        ? "bg-primary text-white"
                        : "bg-surface text-body border border-default hover:bg-background"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Data Source Filter Section */}
            <div className="flex flex-row items-center gap-2 sm:gap-4">
              <span className="font-medium text-body whitespace-nowrap text-xs sm:text-sm">Source:</span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {["All", "Staples", "MealIngredients"].map((source) => (
                  <button
                    key={source}
                    onClick={() => handleDataSourceFilterChange(source)}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                      dataSourceFilter === source
                        ? "bg-primary text-white"
                        : "bg-surface text-body border border-default hover:bg-background"
                    }`}
                  >
                    {source === "MealIngredients" ? "Meals" : source}
                  </button>
                ))}
              </div>
            </div>

            {/* Group By Section */}
            <div className="flex flex-row items-center gap-2 sm:gap-4">
              <span className="flex items-center gap-1 text-body">
                <Layers size={16} className="sm:w-5 sm:h-5" />
                <span className="font-medium whitespace-nowrap text-xs sm:text-sm">Group:</span>
              </span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {["Category", "Store", "GroceryStoreSection"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleGroupByChange(mode)}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                      groupBy === mode
                        ? "bg-primary text-white"
                        : "bg-surface text-body border border-default hover:bg-background"
                    }`}
                  >
                    {mode === "GroceryStoreSection" ? "Section" : mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Group Tabs — horizontal scroll on mobile, wrap on desktop */}
        <div className="mb-3 sm:mb-6 relative">
          <div
            className="flex gap-1.5 sm:gap-2 overflow-x-auto py-1 px-0.5 sm:flex-wrap"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {groups.map((group) => {
              const groupItems = getItemsByGroup(group);
              const selectedCount = groupItems.filter(item => selectedItems.has(item.ItemID.toString())).length;
              const hasSelected = selectedCount > 0;
              return (
                <button
                  key={group}
                  onClick={() => setActiveTab(group)}
                  className={`px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all whitespace-nowrap flex-shrink-0 border ${
                    activeTab === group
                      ? "bg-primary text-white border-primary shadow-sm"
                      : hasSelected
                        ? "bg-surface text-heading border-primary/40 hover:border-primary/60"
                        : "bg-surface text-muted border-default hover:border-primary/30 hover:text-body"
                  }`}
                >
                  {group}
                  <span className={`ml-1 sm:ml-1.5 text-[10px] sm:text-xs ${
                    activeTab === group ? "opacity-80" : hasSelected ? "text-primary" : "opacity-60"
                  }`}>
                    {selectedCount}/{groupItems.length}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Fade hint for scroll on mobile */}
          <div className="sm:hidden pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent" />
        </div>

        {/* Items for Active Group */}
        <div className="mb-3 sm:mb-6">
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <h2 className="text-sm sm:text-lg font-semibold text-heading">
              {groupBy === "GroceryStoreSection" ? "Section" : groupBy}:{" "}
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
                className="text-sm text-primary hover:text-primary-hover transition-colors"
              >
                {currentGroupItems.length > 0 && currentGroupItems.every(item => selectedItems.has(item.ItemID.toString()))
                  ? "Deselect All"
                  : "Select All"}
              </button>
              <button
                onClick={() => setShowAddPanel(true)}
                className="flex items-center gap-1 text-primary hover:text-primary-hover transition-colors"
                title="Add new item"
              >
                <Plus size={20} />
                Add Item
              </button>
            </div>
          </div>

          <div className="border border-default rounded-xl bg-surface">
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
          <div className="flex-1 text-sm text-body flex items-center">
            Selected: {selectedItems.size} item
            {selectedItems.size !== 1 ? "s" : ""}
          </div>
          <button
            onClick={handleSubmit}
            disabled={selectedItems.size === 0}
            className="px-8 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:bg-muted disabled:cursor-not-allowed transition-colors font-medium"
          >
            Review Selection
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroceryChecklist;
