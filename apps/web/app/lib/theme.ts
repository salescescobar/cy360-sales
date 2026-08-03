/**
 * Design tokens — single source of truth. Components must never hardcode a colour.
 * Crush Yard palette VERIFIED from crushyard.com/orlando on 2026-08-03 (computed styles).
 */
export const theme = {
  ink: "#16181D",
  surface: "#FFFFFF",
  surfaceMuted: "#FAFAFA",
  border: "#E6E7EA",
  textSecondary: "#69727D",
  textTertiary: "#494C4F",
  aiLabsCoral: "#FF6B4A",

  // Crush Yard (client accent — swap this block per client, nothing else changes)
  clientAccent: "#E8503E",
  clientAccentSoft: "#E97263",
  clientDeep: "#130B36",
  clientDeepAlt: "#1E1545",
  clientMuted: "#4B446A",

  // Traffic lights — colour is NEVER the only signal; the number's sign carries it too
  up: "#1E8E5A",
  flat: "#B08900",
  down: "#C0392B",

  font: {
    display: '"SS Nickson One", "Helvetica Neue", Helvetica, Arial, sans-serif',
    body: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  numericFeatures: '"tnum" 1, "lnum" 1',
  radius: { card: "12px", pill: "999px" },
  space: (n: number) => `${n * 4}px`,
} as const;
