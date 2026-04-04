import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, X, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ENDPOINTS, apiFetch } from '../config/api';
import { captureScreen, compressImage } from '../utils/screenshot';
import { useTheme } from '../contexts/ThemeContext';
import { getWeekDates } from '../utils/weekDates';

const CATEGORIES = [
  { id: 'bug', emoji: '\uD83D\uDC1B', label: 'Bug' },
  { id: 'idea', emoji: '\uD83D\uDCA1', label: 'Idea' },
  { id: 'confusing', emoji: '\uD83D\uDE15', label: 'Confusing' },
  { id: 'love', emoji: '\u2764\uFE0F', label: 'Love it' },
];

const FeedbackFAB = ({ currentScreen }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const { isDark } = useTheme();

  const reset = useCallback(() => {
    setCategory(null);
    setDescription('');
    setScreenshots([]);
    setIsCapturing(false);
    setIsSubmitting(false);
  }, []);

  const handleOpen = useCallback(async () => {
    setIsCapturing(true);
    setIsOpen(true);
    // Auto-capture screenshot of current screen
    const img = await captureScreen();
    if (img) {
      setScreenshots([img]);
    }
    setIsCapturing(false);
    // Focus textarea after panel opens
    setTimeout(() => textareaRef.current?.focus(), 300);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Delay reset so exit animation plays
    setTimeout(reset, 300);
  }, [reset]);

  const handleAddImage = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const compressed = await compressImage(file);
      setScreenshots((prev) => [...prev, compressed]);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRemoveImage = useCallback((index) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Clipboard paste support
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const compressed = await compressImage(blob);
            setScreenshots((prev) => [...prev, compressed]);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) {
      toast.error('Please describe your feedback');
      return;
    }
    if (!category) {
      toast.error('Please pick a category');
      return;
    }

    setIsSubmitting(true);
    try {
      const weekData = getWeekDates();
      const metadata = {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        theme: isDark ? 'dark' : 'light',
        week_date_range: weekData.displayRange,
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };

      const response = await apiFetch(ENDPOINTS.submitFeedback, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          screen: currentScreen || 'unknown',
          metadata,
          screenshots: JSON.stringify(screenshots),
        }),
      });

      if (response.ok) {
        toast.success('Feedback sent! Thanks!');
        handleClose();
      } else {
        toast.error('Failed to send feedback. Try again?');
      }
    } catch {
      toast.error('Network error. Try again?');
    } finally {
      setIsSubmitting(false);
    }
  }, [description, category, screenshots, currentScreen, isDark, handleClose]);

  return (
    <>
      {/* FAB Button */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleOpen}
          className={`fixed lg:right-8 z-50 rounded-full bg-primary text-white shadow-warm-lg flex items-center justify-center hover:bg-primary-hover transition-colors duration-200 ${
            ['meals', 'chatbot', 'meal-creator'].includes(currentScreen)
              ? 'w-10 h-10 right-3 opacity-60'
              : 'w-14 h-14 right-4'
          }`}
          style={{ bottom: ['meals', 'chatbot', 'meal-creator'].includes(currentScreen) ? 'calc(var(--tab-bar-height) + 4.5rem)' : 'calc(var(--tab-bar-height) + 1rem)' }}
          aria-label="Send feedback"
        >
          <MessageSquarePlus size={24} />
        </motion.button>
      )}

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
        )}
      </AnimatePresence>

      {/* Feedback Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-feedback-panel
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:max-w-lg lg:rounded-2xl z-50 bg-surface rounded-t-2xl shadow-warm-xl border border-default max-h-[85vh] flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-default bg-surface rounded-t-2xl shrink-0">
              <h2 className="text-lg font-bold font-display text-heading">Send Feedback</h2>
              <button
                onClick={handleClose}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-background transition-colors"
                aria-label="Close feedback"
              >
                <X size={20} className="text-secondary" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="p-4 space-y-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
              {/* Category picker */}
              <div>
                <p className="text-sm font-medium text-secondary mb-2">How's it going?</p>
                <div className="flex gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all duration-200 min-h-[44px] ${
                        category === cat.id
                          ? 'border-primary bg-primary-light shadow-warm'
                          : 'border-default hover:border-primary/30 hover:bg-background'
                      }`}
                    >
                      <span className="text-2xl" role="img" aria-label={cat.label}>{cat.emoji}</span>
                      <span className="text-xs font-medium text-secondary">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? What would make it better?"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-default bg-background text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 resize-none text-sm"
                />
              </div>

              {/* Screenshots */}
              <div>
                <p className="text-sm font-medium text-secondary mb-2">Screenshots</p>
                <div className="flex flex-wrap gap-2">
                  {isCapturing && (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-default flex items-center justify-center bg-background">
                      <Loader2 size={20} className="animate-spin text-secondary" />
                    </div>
                  )}
                  {screenshots.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-default group">
                      <img src={img} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleRemoveImage(i)}
                        className="absolute top-0 right-0 w-6 h-6 bg-danger text-white rounded-bl-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove screenshot ${i + 1}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-default flex flex-col items-center justify-center gap-1 hover:border-primary/40 hover:bg-background transition-all text-secondary hover:text-primary"
                  >
                    <Plus size={20} />
                    <span className="text-[10px] font-medium">Add</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleAddImage}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-tertiary mt-1.5">
                  Auto-captured current screen. Paste (Ctrl+V) or add more.
                </p>
              </div>
            </div>

            {/* Sticky Submit */}
            <div className="p-4 pt-3 border-t border-default bg-surface shrink-0">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-3 px-6 rounded-xl bg-primary text-white font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 min-h-[44px] flex items-center justify-center gap-2 shadow-warm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FeedbackFAB;
