// Shared primitives for Grocery Staples explorations.
// Matches the real app's dark theme (see screenshot).

const ST = {
  // Dark theme tokens pulled from the screenshot
  bg:          '#14171C',   // app background (near-black)
  surface:     '#1B1F26',   // card background
  surfaceAlt:  '#232830',   // nested card / filter block
  border:      '#2B313B',
  borderSoft:  '#252A33',
  primary:     '#5BA788',   // sage green (same as green theme)
  primaryDim:  '#3F7A63',
  primaryLight:'#1E3A2E',   // filled dark-sage pill
  accent:      '#D97757',   // terracotta (coupons / meals accent)
  accentLight: '#2E1F18',
  meal:        '#8B9EE8',   // periwinkle — meals source badge
  mealLight:   '#1F2438',
  danger:      '#D65555',
  heading:     '#F2F3F5',
  body:        '#B8BEC7',
  muted:       '#7E8590',
  mutedDim:    '#5A616C',
  weekHeader:  '#13251E',   // the dark-green week banner
  weekText:    '#6FAE8C',
  font:        "'DM Sans', system-ui, sans-serif",
};

// Item shape mirrors real data: ItemName / Category / Store / Type / DataSource
const S_ITEMS = [
  // Bakery & bread
  { ItemID: 1,  ItemName: 'Bread',              Category: 'Bakery & bread',       Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 2,  ItemName: 'Sandwich wraps',     Category: 'Bakery & bread',       Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },

  // Beverages
  { ItemID: 10, ItemName: 'Sparkling water',    Category: 'Beverages',            Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 11, ItemName: 'Cold brew coffee',   Category: 'Beverages',            Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 12, ItemName: 'Almond milk',        Category: 'Beverages',            Store: 'Whole Foods',Type: 'Basic',    DataSource: 'Staples' },

  // Cereal & breakfast
  { ItemID: 20, ItemName: 'Oatmeal',            Category: 'Cereal & breakfast',   Store: 'Costco',     Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 21, ItemName: 'Granola',            Category: 'Cereal & breakfast',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 22, ItemName: 'Honey',              Category: 'Cereal & breakfast',   Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 23, ItemName: 'Maple syrup',        Category: 'Cereal & breakfast',   Store: 'Costco',     Type: 'Periodic', DataSource: 'Staples' },

  // Condiments & sauces
  { ItemID: 30, ItemName: 'Olive oil',          Category: 'Condiments & sauces',  Store: 'Costco',     Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 31, ItemName: 'Soy sauce',          Category: 'Condiments & sauces',  Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 32, ItemName: 'Sriracha',           Category: 'Condiments & sauces',  Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 33, ItemName: 'Mayo',               Category: 'Condiments & sauces',  Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },

  // Dairy & eggs
  { ItemID: 40, ItemName: 'Whole milk',         Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 41, ItemName: 'Large eggs',         Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 42, ItemName: 'Greek yogurt',       Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 43, ItemName: 'Unsalted butter',    Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 44, ItemName: 'Sharp cheddar',      Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 45, ItemName: 'Mozzarella',         Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Caprese salad' },
  { ItemID: 46, ItemName: 'Sour cream',         Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Chicken tacos' },
  { ItemID: 47, ItemName: 'Heavy cream',        Category: 'Dairy & eggs',         Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Pasta alfredo' },

  // Deli & prepared food
  { ItemID: 50, ItemName: 'Turkey breast',      Category: 'Deli & prepared food', Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 51, ItemName: 'Hummus',             Category: 'Deli & prepared food', Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 52, ItemName: 'Rotisserie chicken', Category: 'Deli & prepared food', Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 53, ItemName: 'Olives',             Category: 'Deli & prepared food', Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 54, ItemName: 'Prosciutto',         Category: 'Deli & prepared food', Store: 'Whole Foods',Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Caprese salad' },

  // Frozen food
  { ItemID: 60, ItemName: 'Frozen berries',     Category: 'Frozen food',          Store: 'Costco',     Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 61, ItemName: 'Vanilla ice cream',  Category: 'Frozen food',          Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },

  // Fruit & vegetables (12)
  { ItemID: 70, ItemName: 'Avocados',           Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 71, ItemName: 'Baby spinach',       Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 72, ItemName: 'Roma tomatoes',      Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Caprese salad' },
  { ItemID: 73, ItemName: 'Yellow onions',      Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 74, ItemName: 'Lemons',             Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 75, ItemName: 'Bananas',            Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 76, ItemName: 'Strawberries',       Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 77, ItemName: 'Carrots',            Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID: 78, ItemName: 'Bell peppers',       Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Chicken tacos' },
  { ItemID: 79, ItemName: 'Cilantro',           Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Chicken tacos' },
  { ItemID: 80, ItemName: 'Garlic',             Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 81, ItemName: 'Basil',              Category: 'Fruit & vegetables',   Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Caprese salad' },

  // Household & other
  { ItemID: 90, ItemName: 'Paper towels',       Category: 'Household & other',    Store: 'Costco',     Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 91, ItemName: 'Dish soap',          Category: 'Household & other',    Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 92, ItemName: 'Trash bags',         Category: 'Household & other',    Store: 'Costco',     Type: 'Periodic', DataSource: 'Staples' },
  { ItemID: 93, ItemName: 'Laundry detergent',  Category: 'Household & other',    Store: 'Costco',     Type: 'Periodic', DataSource: 'Staples' },

  // Meat & seafood
  { ItemID:100, ItemName: 'Chicken thighs',     Category: 'Meat & seafood',       Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Chicken tacos' },
  { ItemID:101, ItemName: 'Ground beef',        Category: 'Meat & seafood',       Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID:102, ItemName: 'Wild salmon',        Category: 'Meat & seafood',       Store: 'Whole Foods',Type: 'Basic',    DataSource: 'Staples' },

  // Pantry staples
  { ItemID:110, ItemName: 'Black beans',        Category: 'Pantry staples',       Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },
  { ItemID:111, ItemName: 'Jasmine rice',       Category: 'Pantry staples',       Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID:112, ItemName: 'Pasta',              Category: 'Pantry staples',       Store: 'HEB',        Type: 'Basic',    DataSource: 'MealIngredients', MealName: 'Pasta alfredo' },
  { ItemID:113, ItemName: 'Tortilla chips',     Category: 'Pantry staples',       Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },

  // Pasta, rice & grains
  { ItemID:120, ItemName: 'Quinoa',             Category: 'Pasta, rice & grains', Store: 'HEB',        Type: 'Basic',    DataSource: 'Staples' },

  // Snacks (18) — intentionally many
  ...Array.from({length: 18}, (_, i) => ({
    ItemID: 130 + i,
    ItemName: ['Almonds','Cashews','Pretzels','Popcorn','Dark chocolate','Granola bars','Rice cakes','Hummus chips','Seaweed snacks','Trail mix','Peanut butter crackers','Fruit leathers','Cheese crackers','Veggie chips','Dried mango','Sunflower seeds','Pistachios','Protein bars'][i],
    Category: 'Snacks',
    Store: 'HEB',
    Type: 'Basic',
    DataSource: 'Staples',
  })),

  // Spices & seasonings
  { ItemID:160, ItemName: 'Salt',               Category: 'Spices & seasonings',  Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
  { ItemID:161, ItemName: 'Black pepper',       Category: 'Spices & seasonings',  Store: 'HEB',        Type: 'Periodic', DataSource: 'Staples' },
];

// Week's meals that have pushed ingredients into the list (shown in V2 meal-first view)
const S_MEALS = [
  { name: 'Chicken tacos',   itemIds: [46, 78, 79, 100] },
  { name: 'Caprese salad',   itemIds: [45, 54, 72, 81] },
  { name: 'Pasta alfredo',   itemIds: [47, 112] },
];

// List of category names (derived) — keep a canonical order that matches the screenshot
const S_CATEGORIES = [
  'Bakery & bread', 'Beverages', 'Cereal & breakfast', 'Condiments & sauces',
  'Dairy & eggs', 'Deli & prepared food', 'Frozen food', 'Fruit & vegetables',
  'Household & other', 'Meat & seafood', 'Pantry staples', 'Pasta, rice & grains',
  'Snacks', 'Spices & seasonings',
];

// Shortened labels for tight pills
const S_CAT_SHORT = {
  'Bakery & bread':       'Bakery',
  'Beverages':            'Bevs',
  'Cereal & breakfast':   'Breakfast',
  'Condiments & sauces':  'Sauces',
  'Dairy & eggs':         'Dairy',
  'Deli & prepared food': 'Deli',
  'Frozen food':          'Frozen',
  'Fruit & vegetables':   'Produce',
  'Household & other':    'Household',
  'Meat & seafood':       'Meat',
  'Pantry staples':       'Pantry',
  'Pasta, rice & grains': 'Grains',
  'Snacks':               'Snacks',
  'Spices & seasonings':  'Spices',
};

function byCategory(items, categories = S_CATEGORIES) {
  const groups = {};
  items.forEach(it => {
    if (!groups[it.Category]) groups[it.Category] = [];
    groups[it.Category].push(it);
  });
  return categories
    .filter(c => groups[c])
    .map(c => ({ name: c, items: groups[c].sort((a,b) => a.ItemName.localeCompare(b.ItemName)) }));
}

function byStore(items) {
  const groups = {};
  items.forEach(it => {
    if (!groups[it.Store]) groups[it.Store] = [];
    groups[it.Store].push(it);
  });
  return Object.entries(groups).map(([name, items]) => ({
    name,
    items: items.sort((a,b) => a.ItemName.localeCompare(b.ItemName)),
  })).sort((a,b) => b.items.length - a.items.length);
}

// ─────────────────────────────────────────────────────────────
// Icons — minimal SVG, same vocabulary as lucide-react
// ─────────────────────────────────────────────────────────────
const SIcon = ({ name, size = 18, color = 'currentColor', strokeWidth = 2 }) => {
  const s = { width: size, height: size, display: 'inline-block', flexShrink: 0 };
  const P = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    check:     <polyline {...P} points="20 6 9 17 4 12"/>,
    checkBold: <polyline fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" points="20 6 9 17 4 12"/>,
    x:         <g {...P}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></g>,
    plus:      <g {...P}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></g>,
    minus:     <line {...P} x1="5" y1="12" x2="19" y2="12"/>,
    search:    <g {...P}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></g>,
    filter:    <polygon {...P} points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>,
    sliders:   <g {...P}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></g>,
    chef:      <g {...P}><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></g>,
    zap:       <polygon {...P} points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    chevronD:  <polyline {...P} points="6 9 12 15 18 9"/>,
    chevronU:  <polyline {...P} points="18 15 12 9 6 15"/>,
    chevronR:  <polyline {...P} points="9 18 15 12 9 6"/>,
    trash:     <g {...P}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></g>,
    bag:       <g {...P}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></g>,
    store:     <g {...P}><path d="M3 9l1-5h16l1 5"/><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></g>,
    grid:      <g {...P}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></g>,
    list:      <g {...P}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill={color}/><circle cx="4" cy="12" r="1" fill={color}/><circle cx="4" cy="18" r="1" fill={color}/></g>,
    sparkles:  <g {...P}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></g>,
    layers:    <g {...P}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></g>,
    cart:      <g {...P}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></g>,
    dot:       <circle cx="12" cy="12" r="4" fill={color}/>,
    arrow:     <g {...P}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></g>,
    arrowL:    <g {...P}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></g>,
    clock:     <g {...P}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></g>,
  };
  return <svg style={s} viewBox="0 0 24 24">{paths[name]}</svg>;
};

// ─────────────────────────────────────────────────────────────
// Dark checkbox matching the screenshot (sage fill when checked)
// ─────────────────────────────────────────────────────────────
function SCheck({ checked, size = 22, color = ST.primary, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: size, height: size, borderRadius: 6,
      border: `2px solid ${checked ? color : ST.muted}`,
      background: checked ? color : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, cursor: onClick ? 'pointer' : 'default',
      transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease',
      transform: checked ? 'scale(1.03)' : 'scale(1)',
    }}>
      <svg width={size*0.65} height={size*0.65} viewBox="0 0 24 24" style={{
        opacity: checked ? 1 : 0, transition: 'opacity 120ms ease 60ms',
      }}>
        <polyline fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points="20 6 9 17 4 12"/>
      </svg>
    </div>
  );
}

// Meal origin badge — shows the meal this item came from
function MealBadge({ name, compact = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: compact ? '1px 6px' : '2px 8px',
      borderRadius: 999,
      background: ST.mealLight,
      border: `1px solid ${ST.meal}44`,
      color: ST.meal,
      fontSize: compact ? 10 : 11, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <SIcon name="chef" size={compact ? 9 : 10} color={ST.meal}/>
      {name}
    </span>
  );
}

// Week header (dark green banner from the screenshot)
function WeekBanner({ label = 'For the week of April 19th to April 25th, 2026', compact = false }) {
  return (
    <div style={{
      background: ST.weekHeader,
      border: `1px solid ${ST.primaryDim}44`,
      borderRadius: 10,
      padding: compact ? '8px 12px' : '12px 14px',
      color: ST.weekText,
      fontSize: compact ? 12 : 13,
      fontWeight: 600,
    }}>
      {label}
    </div>
  );
}

// Screen title + check glyph from the screenshot
function StapleTitle({ title = 'Grocery Staples', size = 22 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', border: `2px solid ${ST.primary}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <SIcon name="checkBold" size={14} color={ST.primary}/>
      </div>
      <div style={{ fontSize: size, fontWeight: 800, color: ST.heading, letterSpacing: -0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
        {title}
      </div>
    </div>
  );
}

// Progress bar — thin linear
function ProgressBar({ pct, height = 4, color = ST.primary }) {
  return (
    <div style={{ width: '100%', height, borderRadius: 999, background: ST.border, overflow: 'hidden' }}>
      <div style={{
        width: `${pct}%`, height: '100%', background: color,
        transition: 'width 260ms ease-out',
      }}/>
    </div>
  );
}

Object.assign(window, {
  ST, S_ITEMS, S_MEALS, S_CATEGORIES, S_CAT_SHORT,
  byCategory, byStore,
  SIcon, SCheck, MealBadge, WeekBanner, StapleTitle, ProgressBar,
});
