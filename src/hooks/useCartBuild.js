import { useState, useRef, useCallback, useEffect } from 'react';
import { ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

export default function useCartBuild({ groceryItems, matches, ensureSession, onStepChange }) {
  const [buildProgress, setBuildProgress] = useState([]);
  const [buildSummary, setBuildSummary] = useState(null);
  const eventSourceRef = useRef(null);

  const handleBuildCart = useCallback(async () => {
    const itemsToAdd = groceryItems
      .map(item => {
        const match = matches[item.ItemID];
        if (!match || !match.hebProductUrl || !match.userConfirmed) return null;
        return {
          groceryItemId: item.ItemID,
          groceryItemName: item.ItemName,
          productUrl: match.hebProductUrl,
          hebProductId: match.hebProductId,
          hebSkuId: match.hebSkuId || null,
          quantity: item.Quantity || 1,
        };
      })
      .filter(Boolean);

    if (itemsToAdd.length === 0) {
      toast.error('No confirmed items to add. Accept at least one match first.');
      return;
    }

    // Ensure browser session is still active (may have timed out during review)
    const sessionOk = await ensureSession();
    if (!sessionOk) {
      toast.error('Cannot build cart without an active HEB session. Please reconnect.');
      onStepChange('connect');
      return;
    }

    onStepChange('build');
    setBuildProgress([]);
    setBuildSummary(null);

    try {
      const res = await fetch(ENDPOINTS.hebBuildCart, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToAdd }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed (${res.status})`);
      }

      const { jobId } = await res.json();

      // Connect to SSE for progress
      const evtSource = new EventSource(`${ENDPOINTS.hebBuildProgress}/${jobId}`);
      eventSourceRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'progress') {
            setBuildProgress(prev => {
              const updated = [...prev];
              // Update or add progress entry
              const existingIdx = updated.findIndex(p => p.index === data.index);
              if (existingIdx >= 0) {
                updated[existingIdx] = data;
              } else {
                updated.push(data);
              }
              return updated;
            });
          }

          if (data.type === 'complete') {
            setBuildSummary(data.summary);
            evtSource.close();
            toast.success(`Cart built! ${data.summary.added} items added.`);
          }

          if (data.type === 'error') {
            evtSource.close();
            toast.error(`Build error: ${data.message}`);
          }
        } catch (err) {
          console.error('[heb-cart] SSE parse error:', err);
        }
      };

      // Transient SSE drops are survivable — EventSource auto-reconnects and
      // the server replays all progress. Only bail after repeated failures;
      // the old silent close froze the build screen forever.
      let sseErrors = 0;
      evtSource.onopen = () => { sseErrors = 0; };
      evtSource.onerror = () => {
        sseErrors += 1;
        if (sseErrors >= 5) {
          evtSource.close();
          toast.error('Lost connection to the build stream — the job may still be running on the server. Re-open Build Cart to check.');
          onStepChange('review');
        }
      };
    } catch (err) {
      toast.error(`Failed to start build: ${err.message}`);
      onStepChange('review');
    }
  }, [groceryItems, matches, ensureSession, onStepChange]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { buildProgress, buildSummary, handleBuildCart };
}
