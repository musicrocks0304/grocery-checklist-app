import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ENDPOINTS, apiJson, ApiError } from '../config/api';
import { captureScreen, compressImage } from '../utils/screenshot';
import { useTheme } from './ThemeContext';
import { getWeekDates } from '../utils/weekDates';
import { randomUUID } from '../utils/uuid';
import FeedbackPanel from '../components/FeedbackPanel';

const FeedbackContext = createContext();

/**
 * Owns the feedback sheet: state, screenshot capture, submit — and renders the
 * single panel instance. Feedback is reached from the app chrome (mobile
 * header icon, desktop sidebar link, Shop ⋯ menu) via `useFeedback()`;
 * there is no floating button, which used to cover page controls (FB#42).
 */
export const FeedbackProvider = ({ currentScreen, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const clientIdRef = useRef(null);
  const submittingRef = useRef(false);
  const { isDark } = useTheme();

  const reset = useCallback(() => {
    setCategory(null);
    setDescription('');
    setScreenshots([]);
    setIsCapturing(false);
    setIsSubmitting(false);
    clientIdRef.current = null;
  }, []);

  const openFeedback = useCallback(async () => {
    clientIdRef.current = randomUUID();
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
    if (submittingRef.current) return;

    submittingRef.current = true;
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

      if (!clientIdRef.current) clientIdRef.current = randomUUID();
      const data = await apiJson(ENDPOINTS.submitFeedback, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        retries: 0,
        body: JSON.stringify({
          client_id: clientIdRef.current,
          category,
          description: description.trim(),
          screen: currentScreen || 'unknown',
          metadata,
          screenshots: JSON.stringify(screenshots),
        }),
      });

      if (data && data.success === false) {
        toast.error('Failed to send feedback. Try again?');
      } else {
        toast.success('Feedback sent! Thanks!');
        handleClose();
      }
    } catch (err) {
      const message = err instanceof ApiError && ['forbidden', 'timeout', 'network'].includes(err.code)
        ? err.message
        : 'Failed to send feedback. Try again?';
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [description, category, screenshots, currentScreen, isDark, handleClose]);

  const value = useMemo(() => ({ openFeedback }), [openFeedback]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackPanel
        isOpen={isOpen}
        category={category}
        description={description}
        screenshots={screenshots}
        isCapturing={isCapturing}
        isSubmitting={isSubmitting}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onSelectCategory={setCategory}
        onDescriptionChange={setDescription}
        onAddImage={handleAddImage}
        onRemoveImage={handleRemoveImage}
        onClose={handleClose}
        onSubmit={handleSubmit}
      />
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within a FeedbackProvider');
  return ctx;
};
