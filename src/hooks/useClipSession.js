import { useState, useCallback, useEffect } from 'react';
import { ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

export default function useClipSession({ onStepChange }) {
  const [sessionStatus, setSessionStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.hebSessionStatus);
      if (res.ok) {
        const data = await res.json();
        setSessionStatus(data);
        return data;
      }
      const offline = { active: false, loginSessionValid: false };
      setSessionStatus(offline);
      return offline;
    } catch {
      const offline = { active: false, loginSessionValid: false };
      setSessionStatus(offline);
      return offline;
    }
  }, []);

  useEffect(() => {
    checkSession();
    const interval = setInterval(checkSession, 30000);
    return () => clearInterval(interval);
  }, [checkSession]);

  const startSession = useCallback(async () => {
    const res = await fetch(ENDPOINTS.hebSessionStart, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Failed (${res.status})`);
    }
    const data = await res.json();
    // Deliberately no `loginSessionValid`: starting a browser session says
    // nothing about whether HEB still accepts our cookies, and asserting it
    // here is how a stale login used to masquerade as a healthy one.
    // `useHebSession` owns that fact now.
    setSessionStatus({ active: true, sessionId: data.sessionId, idleSeconds: 0 });
    return data;
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      await startSession();
      toast.success('Connected to HEB!');
      onStepChange('review');
    } catch (err) {
      toast.error(`Connection failed: ${err.message}`);
    } finally {
      setConnecting(false);
    }
  }, [startSession, onStepChange]);

  /**
   * Ensures an active browser session exists. If the session timed out
   * (10-min inactivity), it automatically reconnects.
   * Returns true if session is active (or was reconnected), false on failure.
   */
  const ensureSession = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.hebSessionStatus);
      if (res.ok) {
        const data = await res.json();
        if (data.active) return true;
      }
      // Session not active — try to reconnect
      toast.loading('Reconnecting to HEB...', { id: 'reconnect' });
      await startSession();
      toast.success('Reconnected to HEB!', { id: 'reconnect' });
      return true;
    } catch (err) {
      toast.error(`Could not reconnect: ${err.message}`, { id: 'reconnect' });
      return false;
    }
  }, [startSession]);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch(ENDPOINTS.hebSessionEnd, { method: 'POST' });
      setSessionStatus({ active: false, loginSessionValid: sessionStatus?.loginSessionValid });
      onStepChange('connect');
      toast.success('Disconnected from HEB');
    } catch {
      toast.error('Failed to disconnect');
    }
  }, [sessionStatus, onStepChange]);

  return { sessionStatus, connecting, checkSession, handleConnect, handleDisconnect, ensureSession };
}
