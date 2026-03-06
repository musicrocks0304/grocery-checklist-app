import React from 'react';
import { ChevronDown, ChevronUp, Wifi } from 'lucide-react';

const DebugPanel = ({ showDebug, setShowDebug, debugInfo }) => {
  if (!debugInfo || debugInfo.length === 0) return null;

  return (
    <div className="mt-4 border border-default rounded-2xl overflow-hidden transition-colors duration-200">
      <button
        onClick={() => setShowDebug(!showDebug)}
        className="w-full flex items-center justify-between p-3 bg-background hover:bg-background transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wifi size={16} className="text-muted" />
          <span className="text-sm font-medium text-heading">
            Debug Info ({debugInfo.length} entries)
          </span>
        </div>
        {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {showDebug && (
        <div className="p-3 bg-gray-900 text-green-400 font-mono text-xs max-h-64 overflow-y-auto">
          {debugInfo.map((entry, i) => (
            <div key={i} className="mb-1">
              <span className="text-gray-500">[{entry.timestamp}]</span>{' '}
              {entry.message}
              {entry.data && (
                <pre className="text-yellow-300 ml-4 whitespace-pre-wrap">
                  {typeof entry.data === 'string'
                    ? entry.data
                    : JSON.stringify(entry.data, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
