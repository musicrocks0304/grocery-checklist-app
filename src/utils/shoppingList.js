import { DEFAULT_CATEGORY } from "../constants/categories";

// Orders the incoming sections array by the given walk order, with any
// unknown categories appended in encounter order so nothing is dropped.
export const sortByWalkOrder = (sectionNames, walkOrder) => {
  const known = walkOrder.filter((name) => sectionNames.includes(name));
  const extras = sectionNames.filter((name) => !walkOrder.includes(name));
  return [...known, ...extras];
};

// Maps a HEB store_location string to a sortable integer for intra-section ordering.
// "Aisle 14" → 14 (numeric aisles sort first), department names ("Produce") → 8000,
// null/empty → 9999 so unknowns sink to the end.
export const aisleSortKey = (loc) => {
  if (typeof loc !== "string" || loc.trim() === "") return 9999;
  const m = loc.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 8000;
};

// Display badge for an aisle. Normalizes HEB's verbose location strings into
// short, readable labels suitable for a small inline badge. Examples:
//   "Aisle 14"                        -> "Aisle 14"
//   "In Produce"                      -> "Produce"
//   "In Produce on the Front Wall"    -> "Produce, Front"
//   "In Meat Market on the Back Wall" -> "Meat Market, Back"
//   "Back Edge of Deli"               -> "Deli, Back"
//   "On the Right Edge of Deli"       -> "Deli, Right"
//   "In Dairy on the Right Wall"      -> "Dairy, Right"
//   null/empty                         -> "" (ItemRow hides the badge span entirely)
export const formatAisleBadge = (loc) => {
  if (typeof loc !== "string" || loc.trim() === "") return "";
  const aisleMatch = loc.match(/aisle\s*(\d+\w?)/i);
  if (aisleMatch) return `Aisle ${aisleMatch[1]}`;
  return loc
    .replace(/^In\s+/i, "")
    .replace(/^On the\s+(Back|Front|Right|Left)\s+Edge of\s+(.+)$/i, "$2, $1")
    .replace(/^(Back|Front|Right|Left)\s+Edge of\s+(.+)$/i, "$2, $1")
    .replace(/\s+on the\s+/i, ", ")
    .replace(/\s+Wall$/i, "")
    .trim();
};

// Build { name, items[], checkedCount, totalCount }[] grouped by Category,
// sorted by the user's walk order. Within each section, unchecked items come
// first (sorted by physical aisle ascending so the shopper traverses in walk
// order), and checked items sink to the bottom.
export const groupByWalkOrder = (items, checked, walkOrder) => {
  const buckets = {};
  items.forEach((item) => {
    const name = item.Category || DEFAULT_CATEGORY;
    if (!buckets[name]) buckets[name] = [];
    buckets[name].push(item);
  });
  const orderedNames = sortByWalkOrder(Object.keys(buckets), walkOrder);
  return orderedNames.map((name) => {
    const bucket = buckets[name];
    const unchecked = bucket
      .filter((i) => !checked.has(i.ItemID.toString()))
      .sort((a, b) => aisleSortKey(a.store_location) - aisleSortKey(b.store_location));
    const checkedItems = bucket.filter((i) => checked.has(i.ItemID.toString()));
    return {
      name,
      items: [...unchecked, ...checkedItems],
      checkedCount: checkedItems.length,
      totalCount: bucket.length,
    };
  });
};
