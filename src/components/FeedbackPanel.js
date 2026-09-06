import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Loader2 } from 'lucide-react';

const CATEGORIES = [
  { id: 'bug', emoji: '🐛', label: 'Bug' },
  { id: 'idea', emoji: '💡', label: 'Idea' },
  { id: 'confusing', emoji: '😕', label: 'Confusing' },
  { id: 'love', emoji: '❤️', label: 'Love it' },
];

/**
 * Feedback sheet (backdrop + panel). Purely presentational — all state lives
 * in FeedbackProvider, which owns the single instance of this panel and is
 * driven from the app chrome (header icon, sidebar link, Shop ⋯ menu).
 * There is deliberately no floating action button: it used to cover the Plan
 * "Review" bar, Deals Add buttons and Shop section chevrons (FB#42).
 */
const FeedbackPanel = ({
  isOpen,
  category,
  description,
  screenshots,
  isCapturing,
  isSubmitting,
  textareaRef,
  fileInputRef,
  onSelectCategory,
  onDescriptionChange,
  onAddImage,
  onRemoveImage,
  onClose,
  onSubmit,
}) => (
  <>
    {/* Backdrop */}
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        />
      )}
    </AnimatePresence>

    {/* Feedback Panel */}
    {/*
      The centering wrapper below is load-bearing: framer-motion writes its own
      inline `transform` for the y/opacity animation (settling to
      `transform: none` once open), which overrides — not composes with — any
      Tailwind `translate-x/y` utility on the SAME element. Putting
      `lg:-translate-x-1/2 lg:-translate-y-1/2` directly on the motion.div (as
      this used to) got silently clobbered, so the desktop panel rendered with
      its top-left corner (not its center) pinned to the viewport center —
      pushing the footer/Submit button off-screen with no way to scroll to it
      (a `position: fixed` element doesn't participate in document scroll).
      Centering via flexbox on a separate, non-animated wrapper avoids sharing
      `transform` with framer-motion entirely.
    */}
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none lg:flex lg:items-center lg:justify-center">
          <motion.div
            data-feedback-panel
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="pointer-events-auto fixed bottom-0 left-0 right-0 lg:static lg:max-w-lg lg:rounded-2xl bg-surface rounded-t-2xl shadow-warm-xl border border-default max-h-[85vh] flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-default bg-surface rounded-t-2xl shrink-0">
              <h2 className="text-lg font-bold font-display text-heading">Send Feedback</h2>
              <button
                onClick={onClose}
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
                      onClick={() => onSelectCategory(cat.id)}
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
                  onChange={(e) => onDescriptionChange(e.target.value)}
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
                        onClick={() => onRemoveImage(i)}
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
                    onChange={onAddImage}
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
                onClick={onSubmit}
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
        </div>
      )}
    </AnimatePresence>
  </>
);

export default FeedbackPanel;
