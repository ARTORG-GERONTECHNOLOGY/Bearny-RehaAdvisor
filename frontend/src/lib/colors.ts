/**
 * Brand color palette – single source of truth for programmatic (JS/TS) usage.
 * For CSS/Tailwind usage, use the corresponding utility classes:
 *   back          → bg-back
 *   success       → text-success / bg-success
 *   error         → text-error   / bg-error
 *   brand         → text-brand   / bg-brand
 *   pink          → text-pink    / bg-pink
 *   yellow        → text-yellow  / bg-yellow
 *   chartMuted    → stroke/fill via colors.chartMuted (JS only; used for chart reference lines and tracks)
 */
export const colors = {
  back: '#F2F2F7',
  success: '#16A34A',
  error: '#DC2626',
  brand: '#00956C',
  pink: '#F1ADCF',
  yellow: '#EFA73B',
  chartMuted: '#E4E4E7',
} as const;
