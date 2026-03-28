import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Monitor, Download, Play, CheckCircle2, AlertTriangle, XCircle, Loader2, Key, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { ENDPOINTS, apiFetch } from '../config/api';

const HEB_LOGIN_URL = 'https://heb-login.needexcelexpert.com';

// Admin key stored in localStorage
const ADMIN_KEY_STORAGE = 'heb_admin_key';

function SessionManager({ onBack }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperLogs, setScraperLogs] = useState([]);
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const logsEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Fetch health status
  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiFetch(ENDPOINTS.clipServerHealth, { timeout: 10000 });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => {
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [fetchHealth]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scraperLogs]);

  const getAdminKey = () => {
    if (adminKey) return adminKey;
    setShowKeyInput(true);
    return null;
  };

  const saveAdminKey = (key) => {
    setAdminKey(key);
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
    setShowKeyInput(false);
  };

  // --- Actions ---

  const handleOpenLogin = () => {
    window.open(HEB_LOGIN_URL, '_blank');
  };

  const handleImportSession = async () => {
    const key = getAdminKey();
    if (!key) return;

    setImporting(true);
    try {
      const res = await apiFetch(ENDPOINTS.importSession, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': key,
        },
        timeout: 60000,
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Session imported! ${data.cookieCount} cookies. Valid for ~24h.`);
        await fetchHealth();
      } else {
        toast.error(data.error || 'Import failed');
        if (res.status === 401) {
          localStorage.removeItem(ADMIN_KEY_STORAGE);
          setAdminKey('');
          setShowKeyInput(true);
        }
      }
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleRunScraper = async (type = 'both') => {
    const key = getAdminKey();
    if (!key) return;

    setScraperRunning(true);
    setScraperLogs([]);

    try {
      const res = await apiFetch(ENDPOINTS.runScraper, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': key,
        },
        body: JSON.stringify({ type }),
        timeout: 15000,
      });

      if (res.status === 401) {
        localStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        setShowKeyInput(true);
        setScraperRunning(false);
        toast.error('Invalid admin key');
        return;
      }

      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        setScraperRunning(false);
        return;
      }

      // Connect SSE for progress
      const progressUrl = `${ENDPOINTS.scraperProgress}/${data.jobId}`;
      const eventSource = new EventSource(progressUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'log') {
          setScraperLogs(prev => [...prev, msg]);
        } else if (msg.type === 'script_start') {
          setScraperLogs(prev => [...prev, { type: 'info', line: `Starting ${msg.script} scraper...` }]);
        } else if (msg.type === 'script_end') {
          setScraperLogs(prev => [...prev, {
            type: 'info',
            line: `${msg.script} scraper finished (exit code ${msg.exitCode})`,
          }]);
        } else if (msg.type === 'complete') {
          toast.success('Scraper complete!');
          setScraperRunning(false);
          eventSource.close();
          fetchHealth();
        } else if (msg.type === 'error') {
          toast.error(msg.message || 'Scraper failed');
          setScraperRunning(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setScraperRunning(false);
        eventSource.close();
      };
    } catch (err) {
      toast.error(`Failed to start scraper: ${err.message}`);
      setScraperRunning(false);
    }
  };

  // --- Session status helpers ---

  const getSessionStatus = () => {
    if (!health) return 'unknown';
    if (!health.sessionValid) return 'expired';
    if (health.sessionAgeHours > 20) return 'expiring';
    return 'valid';
  };

  const sessionStatus = getSessionStatus();

  const statusConfig = {
    valid: { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, label: 'Session Active' },
    expiring: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, label: 'Expiring Soon' },
    expired: { color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: XCircle, label: 'Session Expired' },
    unknown: { color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', icon: AlertTriangle, label: 'Server Unreachable' },
  };

  const status = statusConfig[sessionStatus];
  const StatusIcon = status.icon;

  // --- Determine which step to highlight ---
  const activeStep = sessionStatus === 'expired' || sessionStatus === 'unknown' ? 1
    : health && !health.sessionValid ? 1
    : 2; // session valid → highlight "Run Scraper"

  // --- Render ---

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900">Session Manager</h1>
          <p className="text-sm text-slate-500">Remote HEB login & scraper control</p>
        </div>
      </div>

      {/* Admin Key Input Modal */}
      {showKeyInput && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold">Admin Key Required</h2>
            </div>
            <p className="text-sm text-slate-500">Enter the admin API key to access server controls. This is saved locally.</p>
            <input
              type="password"
              autoFocus
              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Enter admin key..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  saveAdminKey(e.target.value.trim());
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowKeyInput(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.querySelector('input[type="password"]');
                  if (input?.value.trim()) saveAdminKey(input.value.trim());
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Status Card */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className={`rounded-2xl border p-4 ${status.bg}`}>
          <div className="flex items-center gap-3 mb-3">
            <StatusIcon className={`w-6 h-6 ${status.color}`} />
            <div>
              <p className={`font-semibold ${status.color}`}>{status.label}</p>
              {health?.sessionExpiresIn && health.sessionValid && (
                <p className="text-xs text-slate-500">Expires in {health.sessionExpiresIn}</p>
              )}
            </div>
          </div>
          {health && (
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              {health.couponCount != null && (
                <div>Coupons: <span className="font-medium">{health.couponCount}</span></div>
              )}
              {health.lastScrapeAt && (
                <div>Last scrape: <span className="font-medium">{new Date(health.lastScrapeAt).toLocaleDateString()}</span></div>
              )}
              {health.sessionAgeHours != null && (
                <div>Session age: <span className="font-medium">{health.sessionAgeHours}h</span></div>
              )}
              {health.activeJobs != null && (
                <div>Active jobs: <span className="font-medium">{health.activeJobs}</span></div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Open HEB Login */}
      <div className={`rounded-2xl border p-4 transition-all ${activeStep === 1 ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${activeStep === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
            1
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Open HEB Login</h3>
            <p className="text-sm text-slate-500 mt-0.5">Opens remote Chrome browser. Complete hCaptcha and log in.</p>
            <button
              onClick={handleOpenLogin}
              className={`mt-3 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeStep === 1
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Monitor className="w-4 h-4" />
              Open HEB Login
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Step 2: Import Session */}
      <div className={`rounded-2xl border p-4 transition-all ${activeStep === 2 && !health?.sessionValid ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${activeStep >= 2 && !health?.sessionValid ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
            2
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Import Session</h3>
            <p className="text-sm text-slate-500 mt-0.5">Pull cookies from the remote browser into the scraper.</p>
            <button
              onClick={handleImportSession}
              disabled={importing}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {importing ? 'Importing...' : 'Import Session'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Run Scraper */}
      <div className={`rounded-2xl border p-4 transition-all ${activeStep === 2 && health?.sessionValid ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${activeStep === 2 && health?.sessionValid ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
            3
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Run Scraper</h3>
            <p className="text-sm text-slate-500 mt-0.5">Scrape this week's HEB coupons into the database.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleRunScraper('coupons')}
                disabled={scraperRunning || !health?.sessionValid}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  health?.sessionValid && !scraperRunning
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {scraperRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {scraperRunning ? 'Running...' : 'Coupons Only'}
              </button>
              <button
                onClick={() => handleRunScraper('both')}
                disabled={scraperRunning || !health?.sessionValid}
                className="inline-flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Run Both
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scraper Logs */}
      {scraperLogs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 max-h-64 overflow-y-auto">
          <p className="text-xs font-medium text-slate-400 mb-2">Scraper Output</p>
          <div className="font-mono text-xs space-y-0.5">
            {scraperLogs.map((log, i) => (
              <div key={i} className={log.level === 'error' ? 'text-red-400' : log.type === 'info' ? 'text-blue-400' : 'text-slate-300'}>
                {log.line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Quick links after everything is ready */}
      {health?.sessionValid && health?.couponCount > 0 && !scraperRunning && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-sm font-medium text-emerald-800">Ready to go!</p>
          <p className="text-xs text-emerald-600 mt-1">Session active, {health.couponCount} coupons available.</p>
          {onBack && (
            <button
              onClick={onBack}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              Go to Deals
            </button>
          )}
        </div>
      )}

      {/* Admin key management */}
      <div className="text-center">
        <button
          onClick={() => setShowKeyInput(true)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {adminKey ? 'Change admin key' : 'Set admin key'}
        </button>
      </div>
    </div>
  );
}

export default SessionManager;
