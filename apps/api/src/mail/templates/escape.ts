/**
 * Escape a value for safe interpolation into HTML text or a double-quoted
 * attribute. Every user-supplied value (gem titles, names, references) MUST pass
 * through this before it reaches an HTML string — no template accepts pre-rendered
 * HTML from a caller. Non-string inputs are coerced to string first.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
