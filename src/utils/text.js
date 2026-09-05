// ---------------------------------------------------------------------------
// Text helpers — HTML entity decoding without touching the DOM (must work
// in Jest/jsdom-less environments, e.g. Node scripts).
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const ENTITY_PATTERN = /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&#x([0-9a-fA-F]+);|&#(\d+);/g;

/**
 * Decodes literal HTML entities in a string (as scraped from HEB product
 * names, e.g. "Strawberry &amp; Watermelon&nbsp;") without relying on the
 * DOM, then trims and collapses whitespace runs to a single space.
 *
 * Non-string input returns "".
 */
export function decodeHtmlEntities(str) {
  if (typeof str !== "string") return "";

  const decoded = str.replace(ENTITY_PATTERN, (match, hex, dec) => {
    if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
    if (dec !== undefined) return String.fromCodePoint(parseInt(dec, 10));
    return NAMED_ENTITIES[match] ?? match;
  });

  return decoded.replace(/\s+/g, " ").trim();
}
