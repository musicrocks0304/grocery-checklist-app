/**
 * Design Tokens — Grocery Checklist App
 *
 * Two visual themes:
 *   "green"  — shopping & planning screens (Grocery, ChatBot, Coupons, In-Store, RecipeIngredients, HebCart)
 *   "amber"  — cooking screens (RecipeInstructions, MealCreator)
 *
 * Colors resolve via CSS custom properties (see index.css) for automatic dark mode support.
 *
 * Usage:
 *   import { THEMES, TOKENS } from '../styles/tokens';
 *   const t = THEMES.green;       // or THEMES.amber
 *   <div className={t.headerGradient}>
 */

// ---------------------------------------------------------------------------
// Shared tokens (not theme-dependent)
// ---------------------------------------------------------------------------
export const TOKENS = {
  // Typography
  pageTitle: 'text-xl sm:text-2xl font-bold text-heading font-display',
  sectionHeader: 'text-lg font-semibold text-heading font-display',
  body: 'text-base text-body',
  label: 'text-sm font-medium text-body',
  caption: 'text-sm text-muted',
  finePrint: 'text-xs text-muted',

  // Layout
  pageBackground: 'bg-background',
  cardBase: 'bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200',
  cardFlat: 'bg-surface rounded-2xl border border-default transition-colors duration-200',
  containerPadding: 'p-4 sm:p-6',
  maxWidth: 'max-w-4xl mx-auto',
  maxWidthWide: 'max-w-6xl mx-auto',

  // Touch targets
  touchTarget: 'min-h-[44px] min-w-[44px]',

  // Buttons — base classes (combine with variant)
  btnBase: 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 active:scale-[0.97]',
  btnSm: 'px-3 py-1.5 text-sm rounded-xl',
  btnMd: 'px-4 py-2 text-sm rounded-xl min-h-[44px]',
  btnLg: 'px-6 py-3 text-base rounded-xl min-h-[44px]',

  // Button variants (theme-independent)
  btnSecondary: 'bg-surface text-body border border-default hover:bg-background',
  btnDanger: 'bg-danger text-white hover:bg-danger-hover',
  btnGhost: 'bg-transparent text-body hover:bg-background',
  btnOutline: 'bg-surface text-body border border-default hover:bg-background',
  btnDisabled: 'bg-muted text-white cursor-not-allowed',

  // Inputs
  input: 'w-full px-3 py-2 border border-default rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-sm transition-colors duration-200',
  select: 'px-3 py-2 border border-default rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-sm transition-colors duration-200',
  checkbox: 'w-5 h-5 text-primary rounded focus:ring-focus',

  // Feedback
  spinnerLg: 'animate-spin rounded-full h-12 w-12 border-4 border-t-transparent',
  spinnerSm: 'animate-spin rounded-full h-4 w-4 border-2 border-t-transparent',
  errorBanner: 'p-4 bg-danger-light border border-danger rounded-2xl transition-colors duration-200',
  successBanner: 'p-4 bg-primary-light border border-primary-border rounded-2xl transition-colors duration-200',

  // Modals
  overlay: 'fixed inset-0 bg-black/50 z-50',
  modalCard: 'bg-surface rounded-2xl shadow-warm-xl p-6 max-w-md w-full mx-4 transition-colors duration-200',

  // Badges / pills
  badge: 'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full',

  // Empty state
  emptyIcon: 'mx-auto text-muted mb-4',
  emptyTitle: 'text-xl font-semibold text-heading font-display mb-2',
  emptyBody: 'text-muted mb-6',
};

// ---------------------------------------------------------------------------
// Theme-specific tokens
// ---------------------------------------------------------------------------
export const THEMES = {
  green: {
    name: 'green',
    // Header
    headerGradient: 'bg-primary text-white',
    // Primary button
    btnPrimary: 'bg-primary text-white hover:bg-primary-hover',
    // Active filter / tab
    filterActive: 'bg-primary text-white',
    filterInactive: 'bg-surface text-body border border-default hover:bg-background',
    // Tab active
    tabActive: 'bg-primary text-white',
    tabInactive: 'bg-background text-body hover:bg-surface',
    // Week date banner
    dateBanner: 'bg-primary-light border border-primary-border rounded-2xl p-4 transition-colors duration-200',
    dateBannerText: 'text-lg font-medium text-heading font-display',
    // Spinner color
    spinnerColor: 'border-primary',
    // Chat bubble (user)
    chatBubbleUser: 'bg-primary text-white',
    // Focus ring
    focusRing: 'focus:ring-focus',
    // Info banner in header
    headerInfoBox: 'bg-white/20 rounded-xl p-3',
    // Progress bar
    progressBar: 'bg-primary',
  },

  amber: {
    name: 'amber',
    // Header
    headerGradient: 'bg-accent text-white',
    // Primary button
    btnPrimary: 'bg-accent text-white hover:bg-accent-hover',
    // Active filter / tab
    filterActive: 'bg-accent text-white',
    filterInactive: 'bg-surface text-body border border-default hover:bg-background',
    // Tab active
    tabActive: 'bg-accent text-white',
    tabInactive: 'bg-background text-body hover:bg-surface',
    // Week date banner
    dateBanner: 'bg-accent-light border border-accent rounded-2xl p-4 transition-colors duration-200',
    dateBannerText: 'text-lg font-medium text-heading font-display',
    // Spinner color
    spinnerColor: 'border-accent',
    // Chat bubble (user)
    chatBubbleUser: 'bg-accent text-white',
    // Focus ring
    focusRing: 'focus:ring-accent',
    // Info banner in header
    headerInfoBox: 'bg-white/20 rounded-xl p-3',
    // Progress bar
    progressBar: 'bg-accent',
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
  'smart-deals': THEMES.green,
};
