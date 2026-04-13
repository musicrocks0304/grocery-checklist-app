import { useState, useRef, useEffect, useCallback } from 'react';
import { CLIP_SERVER_URL } from '../config/api';

/**
 * Shared hook for SSE-based coupon clipping.
 * Replaces duplicated logic in Deals.js, SmartDeals.js, CouponMatchPanel.js.
 * Handles EventSource lifecycle and cleanup on unmount.
 */
export function useClipCoupons() {
  const [isClipping, setIsClipping] = useState(false);
  const [clipProgress, setClipProgress] = useState(new Map());
  const [clipResults, setClipResults] = useState(null);
  const [clipError, setClipError] = useState(null);
  const eventSourceRef = useRef(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const resetClipState = useCallback(() => {
    setClipResults(null);
    setClipError(null);
    setClipProgress(new Map());
  }, []);

  const clipSelected = useCallback(async (couponIds) => {
    if (!couponIds || couponIds.length === 0) return;

    // Close any existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsClipping(true);
    setClipError(null);
    setClipResults(null);

    const initialProgress = new Map();
    couponIds.forEach(id => initialProgress.set(id, 'pending'));
    setClipProgress(initialProgress);

    try {
      const startResponse = await fetch(`${CLIP_SERVER_URL}/api/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponIds }),
      });

      if (!startResponse.ok) {
        const errData = await startResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${startResponse.status}`);
      }

      const { jobId } = await startResponse.json();
      const eventSource = new EventSource(`${CLIP_SERVER_URL}/api/clip-progress/${jobId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            setClipProgress(prev => {
              const next = new Map(prev);
              next.set(data.couponId, data.status);
              return next;
            });
            // Detect session expiration and surface it immediately
            if (data.message && data.message.includes('SESSION_EXPIRED')) {
              setClipError('HEB session expired during clipping. Log in at heb-login.needexcelexpert.com and import the session, then retry.');
            }
          } else if (data.type === 'complete') {
            setClipResults(data.summary);
            setIsClipping(false);
            eventSource.close();
            eventSourceRef.current = null;
          } else if (data.type === 'error') {
            setClipError(data.message);
            setIsClipping(false);
            eventSource.close();
            eventSourceRef.current = null;
          }
        } catch {
          // Ignore malformed SSE data
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsClipping(false);
        setClipError('Connection to clip server lost.');
      };
    } catch (err) {
      setClipError(err.message);
      setIsClipping(false);
    }
  }, []);

  return {
    clipSelected,
    clipProgress,
    clipResults,
    clipError,
    isClipping,
    resetClipState,
  };
}
