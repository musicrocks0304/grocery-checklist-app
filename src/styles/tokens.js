/**
 * Design Tokens — Grocery Checklist App
 *
 * Two visual themes:
 *   "green"  — shopping & planning screens (Grocery, ChatBot, Coupons, In-Store, RecipeIngredients)
 *   "amber"  — cooking screens (RecipeInstructions, MealCreator)
 *
 * Usage:
 *   import { THEMES, TOKENS } from '../styles/tokens';
 *   const t = THEMES.green;       // or THEMES.amber
 *   <div className={t.headerGradient}>
 *
 * Tailwind custom classes (defined in tailwind.config.js extend.colors):
 *   bg-primary, text-primary, border-primary          → green-600
 *   bg-primary-light, border-primary-border            → green-50 / green-200
 *   bg-secondary, text-secondary                      → gray-600
 *   bg-accent, text-accent                             → amber-500
 *   bg-danger, text-danger                             → red-600
 *   bg-surface                                         → white
 *   bg-background                                      → gray-50
 *   text-heading                                       → gray-800
 *   text-body                                          → gray-600
 *   text-muted                                         → gray-500
 *   border-default                                     → gray-200
 *   ring-focus                                         → green-500
 */

// ---------------------------------------------------------------------------
// Shared tokens (not theme-dependent)
// ---------------------------------------------------------------------------
export const TOKENS = {
  // Typography
  pageTitle: 'text-xl sm:text-2xl font-bold text-heading',
  sectionHeader: 'text-lg font-semibold text-heading',
  body: 'text-base text-body',
  label: 'text-sm font-medium text-body',
  caption: 'text-sm text-muted',
  finePrint: 'text-xs text-muted',

  // Layout
  pageBackground: 'bg-background',
  cardBase: 'bg-surface rounded-xl shadow-lg border border-default',
  cardFlat: 'bg-surface rounded-xl border border-default',
  containerPadding: 'p-4 sm:p-6',
  maxWidth: 'max-w-4xl mx-auto',
  maxWidthWide: 'max-w-6xl mx-auto',

  // Buttons — base classes (combine with variant)
  btnBase: 'inline-flex items-center justify-center gap-2 font-medium transition-colors',
  btnSm: 'px-3 py-1.5 text-sm rounded-lg',
  btnMd: 'px-4 py-2 text-sm rounded-lg',
  btnLg: 'px-6 py-3 text-base rounded-lg',

  // Button variants (theme-independent)
  btnSecondary: 'bg-secondary text-white hover:bg-secondary-hover',
  btnDanger: 'bg-danger text-white hover:bg-danger-hover',
  btnGhost: 'bg-transparent text-body hover:bg-gray-100',
  btnOutline: 'bg-white text-body border border-default hover:bg-gray-50',
  btnDisabled: 'bg-gray-400 text-white cursor-not-allowed',

  // Inputs
  input: 'w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-sm',
  select: 'px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-sm',
  checkbox: 'w-4 h-4 text-primary rounded focus:ring-focus',

  // Feedback
  spinnerLg: 'animate-spin rounded-full h-12 w-12 border-4 border-t-transparent',
  spinnerSm: 'animate-spin rounded-full h-4 w-4 border-2 border-t-transparent',
  errorBanner: 'p-4 bg-danger-light border border-red-200 rounded-xl',
  successBanner: 'p-4 bg-primary-light border border-primary-border rounded-xl',

  // Modals
  overlay: 'fixed inset-0 bg-black/50 z-50',
  modalCard: 'bg-surface rounded-xl shadow-2xl p-6 max-w-md w-full mx-4',

  // Badges / pills
  badge: 'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',

  // Empty state
  emptyIcon: 'mx-auto text-gray-300 mb-4',
  emptyTitle: 'text-xl font-semibold text-body mb-2',
  emptyBody: 'text-muted mb-6',
};

// ---------------------------------------------------------------------------
// Theme-specific tokens
// ---------------------------------------------------------------------------
export const THEMES = {
  green: {
    name: 'green',
    // Header
    headerGradient: 'bg-gradient-to-r from-green-700 to-green-600 text-white',
    // Primary button
    btnPrimary: 'bg-primary text-white hover:bg-primary-hover',
    // Active filter / tab
    filterActive: 'bg-primary text-white',
    filterInactive: 'bg-white text-body border border-default hover:bg-gray-100',
    // Tab active
    tabActive: 'bg-primary text-white',
    tabInactive: 'bg-gray-100 text-body hover:bg-gray-200',
    // Week date banner
    dateBanner: 'bg-primary-light border border-primary-border rounded-xl p-4',
    dateBannerText: 'text-lg font-medium text-green-900',
    // Spinner color
    spinnerColor: 'border-primary',
    // Chat bubble (user)
    chatBubbleUser: 'bg-primary text-white',
    // Focus ring (already in Tailwind as ring-focus)
    focusRing: 'focus:ring-focus',
    // Info banner in header
    headerInfoBox: 'bg-white/20 rounded-lg p-3',
    // Progress bar
    progressBar: 'bg-primary',
  },

  amber: {
    name: 'amber',
    // Header
    headerGradient: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white',
    // Primary button
    btnPrimary: 'bg-accent-dark text-white hover:bg-amber-700',
    // Active filter / tab
    filterActive: 'bg-accent-dark text-white',
    filterInactive: 'bg-white text-body border border-default hover:bg-gray-100',
    // Tab active
    tabActive: 'bg-accent-dark text-white',
    tabInactive: 'bg-gray-100 text-body hover:bg-gray-200',
    // Week date banner
    dateBanner: 'bg-amber-50 border border-amber-200 rounded-xl p-4',
    dateBannerText: 'text-lg font-medium text-amber-900',
    // Spinner color
    spinnerColor: 'border-accent-dark',
    // Chat bubble (user)
    chatBubbleUser: 'bg-accent-dark text-white',
    // Focus ring
    focusRing: 'focus:ring-amber-500',
    // Info banner in header
    headerInfoBox: 'bg-white/20 rounded-lg p-3',
    // Progress bar
    progressBar: 'bg-accent-dark',
  },
};

// Convenience: map screen names to themes
export const SCREEN_THEME = {
  grocery: THEMES.green,
  chatbot: THEMES.green,
  coupons: THEMES.green,
  'in-store': THEMES.green,
  'recipe-ingredients': THEMES.green,
  'recipe-instructions': THEMES.amber,
  'meal-creator': THEMES.amber,
  'heb-cart': THEMES.green,
};
