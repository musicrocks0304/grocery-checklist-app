// Match a transcript against a list of unchecked items. Used by voice
// check-off v2. Strategy:
//   1. Exact name match (case-insensitive). Otherwise "milk" would match
//      "Almond milk" via reverse-substring before ever reaching "Milk".
//   2. Whole-word containment (either direction); longest item name wins so
//      "almond milk" beats "milk". Word boundaries are required — a plain
//      substring pass checked off Licorice when the shopper said "rice".
//   3. Word-overlap fallback, SCORED: the item sharing the most >= 3-char
//      words with the transcript wins (first-wins let list order decide
//      between "Chicken broth" and "Chicken breast"). Light stemming
//      (trailing s) so "carrot" still hits "Carrots".
// Returns the matched item, or null if no match.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsAsWord = (haystack, needle) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, "i").test(haystack);
const stem = (w) => (w.length > 3 ? w.replace(/s$/, "") : w);

export const findBestMatch = (transcript, uncheckedItems) => {
  if (!transcript) return null;
  if (!Array.isArray(uncheckedItems) || uncheckedItems.length === 0) return null;
  const t = transcript.toLowerCase().trim();
  if (!t) return null;
  for (const item of uncheckedItems) {
    if (item.ItemName.toLowerCase() === t) return item;
  }
  const byLength = [...uncheckedItems].sort(
    (a, b) => b.ItemName.length - a.ItemName.length
  );
  for (const item of byLength) {
    const name = item.ItemName.toLowerCase();
    if (containsAsWord(t, name) || containsAsWord(name, t)) return item;
  }
  const words = t.split(/\s+/).filter((w) => w.length >= 3).map(stem);
  if (words.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const item of uncheckedItems) {
    const nameWords = item.ItemName.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3)
      .map(stem);
    const score = words.filter((w) => nameWords.includes(w)).length;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
};
