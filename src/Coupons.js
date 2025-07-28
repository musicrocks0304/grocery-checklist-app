import React, { useState } from 'react';
import { Ticket, AlertCircle, Wifi, ChevronDown, ChevronUp, Menu } from 'lucide-react';

const Coupons = ({ onNavigate, onToggleSidebar }) => {
  const [couponsData, setCouponsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedCoupons, setSelectedCoupons] = useState(new Set());
  const [filterStore, setFilterStore] = useState('all');

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  // Fetch coupons data (placeholder for future web scraping API)
  React.useEffect(() => {
    const fetchCouponsData = async () => {
      try {
        setError(null);
        setDebugInfo([]);

        addDebugLog('Fetching coupons data from web scraping API...');

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Sample data for wireframe - replace with actual API call
        const sampleCoupons = [
          {
            id: 1,
            title: "$2 OFF Organic Grapes",
            description: "Save $2 on any organic grapes 2lbs or more",
            store: "Tom Thumb",
            category: "Produce",
            discount: "$2.00",
            expiryDate: "2025-02-15",
            code: "GRAPES2024",
            minPurchase: "$5.00"
          },
          {
            id: 2,
            title: "Buy 2 Get 1 Free - Frozen Items",
            description: "Mix and match on select frozen meals and appetizers",
            store: "Trader Joe's",
            category: "Frozen",
            discount: "33% OFF",
            expiryDate: "2025-02-10",
            code: "B2G1FREE",
            minPurchase: null
          },
          {
            id: 3,
            title: "$1.50 OFF Almond Milk",
            description: "Any variety, any size almond milk",
            store: "Whole Foods",
            category: "Dairy",
            discount: "$1.50",
            expiryDate: "2025-02-20",
            code: "ALMONDMILK",
            minPurchase: null
          },
          {
            id: 4,
            title: "20% OFF Breakfast Items",
            description: "Save on breakfast bars, cereals, and pastries",
            store: "Kroger",
            category: "Breakfast",
            discount: "20%",
            expiryDate: "2025-02-12",
            code: "BREAKFAST20",
            minPurchase: "$10.00"
          },
          {
            id: 5,
            title: "$3 OFF $15 Purchase",
            description: "Save $3 when you spend $15 or more on pantry items",
            store: "Costco",
            category: "Pantry",
            discount: "$3.00",
            expiryDate: "2025-02-25",
            code: "PANTRY3OFF",
            minPurchase: "$15.00"
          }
        ];

        setCouponsData(sampleCoupons);
        addDebugLog('✅ Successfully loaded coupons data');

      } catch (error) {
        addDebugLog('❌ Error fetching coupons:', error.message);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCouponsData();
  }, []);

  const handleCouponToggle = (couponId) => {
    const newSelected = new Set(selectedCoupons);
    if (newSelected.has(couponId)) {
      newSelected.delete(couponId);
    } else {
      newSelected.add(couponId);
    }
    setSelectedCoupons(newSelected);
  };

  const getFilteredCoupons = () => {
    if (filterStore === 'all') {
      return couponsData;
    }
    return couponsData.filter(coupon => coupon.store === filterStore);
  };

  const getUniqueStores = () => {
    return [...new Set(couponsData.map(coupon => coupon.store))];
  };

  const getDaysUntilExpiry = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading available coupons and deals...</p>
          <p className="mt-2 text-sm text-gray-500">Scraping web for the best offers...</p>
        </div>
      </div>
    );
  }

  const filteredCoupons = getFilteredCoupons();

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-md text-gray-400 hover:text-gray-600"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-800">Coupons & Deals</h1>
          <div></div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Ticket className="text-purple-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-800">Coupons & Deals</h1>
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
            Coupons Debug Information
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

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <p className="text-lg font-medium text-purple-900">Available Deals for This Week</p>
        <p className="text-sm text-purple-700 mt-1">
          {filteredCoupons.length} coupon{filteredCoupons.length !== 1 ? 's' : ''} found
          {filterStore !== 'all' && ` at ${filterStore}`}
        </p>
      </div>

      {/* Store Filter */}
      <div className="mb-6 flex items-center gap-4">
        <span className="text-gray-700 font-medium">Filter by store:</span>
        <select
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">All Stores</option>
          {getUniqueStores().map(store => (
            <option key={store} value={store}>{store}</option>
          ))}
        </select>
      </div>

      {/* Coupons Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCoupons.map((coupon) => {
          const daysLeft = getDaysUntilExpiry(coupon.expiryDate);
          const isSelected = selectedCoupons.has(coupon.id);
          const isExpiringSoon = daysLeft <= 3;

          return (
            <div
              key={coupon.id}
              className={`border rounded-lg p-4 transition-all cursor-pointer ${
                isSelected 
                  ? 'border-purple-500 bg-purple-50 shadow-lg' 
                  : 'border-gray-200 hover:border-purple-300 hover:shadow-md'
              }`}
              onClick={() => handleCouponToggle(coupon.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleCouponToggle(coupon.id)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                    {coupon.store}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-purple-600">{coupon.discount}</div>
                  {isExpiringSoon && (
                    <div className="text-xs text-red-600 font-medium">
                      {daysLeft === 0 ? 'Expires Today' : `${daysLeft} days left`}
                    </div>
                  )}
                </div>
              </div>

              <h3 className="font-semibold text-gray-800 mb-2">{coupon.title}</h3>
              <p className="text-sm text-gray-600 mb-3">{coupon.description}</p>

              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Category:</span>
                  <span className="font-medium">{coupon.category}</span>
                </div>
                <div className="flex justify-between">
                  <span>Code:</span>
                  <span className="font-mono bg-gray-100 px-1 rounded">{coupon.code}</span>
                </div>
                {coupon.minPurchase && (
                  <div className="flex justify-between">
                    <span>Min Purchase:</span>
                    <span className="font-medium">{coupon.minPurchase}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Expires:</span>
                  <span className={isExpiringSoon ? 'text-red-600 font-medium' : ''}>
                    {new Date(coupon.expiryDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCoupons.length === 0 && (
        <div className="text-center py-12">
          <Ticket size={64} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-600">No coupons available</h3>
          <p className="text-gray-500 mt-2">
            {filterStore !== 'all' 
              ? `No coupons found for ${filterStore}. Try selecting "All Stores".`
              : 'Check back later for new deals and offers.'
            }
          </p>
        </div>
      )}

      {/* Selected Coupons Summary */}
      {selectedCoupons.size > 0 && (
        <div className="mt-8 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h3 className="font-semibold text-purple-800 mb-2">
            Selected Coupons ({selectedCoupons.size})
          </h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {Array.from(selectedCoupons).map(couponId => {
              const coupon = couponsData.find(c => c.id === couponId);
              return coupon ? (
                <span key={couponId} className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                  {coupon.title}
                </span>
              ) : null;
            })}
          </div>
          <button
            onClick={() => {
              const selectedCouponsList = Array.from(selectedCoupons).map(id => 
                couponsData.find(c => c.id === id)
              ).filter(Boolean);

              addDebugLog('Selected coupons ready for use:', selectedCouponsList);
              console.log('Selected coupons:', selectedCouponsList);

              alert(`${selectedCoupons.size} coupon${selectedCoupons.size !== 1 ? 's' : ''} ready to use!\n\nCheck the debug panel for details.`);
            }}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Add to Shopping List ({selectedCoupons.size})
          </button>
        </div>
      )}
    </div>
  );
};

export default Coupons;