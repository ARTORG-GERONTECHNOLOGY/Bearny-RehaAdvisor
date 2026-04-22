/**
 * Brand color palette – single source of truth for both Tailwind and programmatic (JS/TS) usage.
 * Tailwind config imports this object directly (tailwind.config.ts).
 * For CSS usage, use the corresponding utility classes:
 *   back          → bg-back
 *   ok            → text-ok / bg-ok
 *   nok           → text-nok   / bg-nok
 *   brand         → text-brand / bg-brand
 *   pink          → text-pink  / bg-pink
 *   yellow        → text-yellow / bg-yellow
 *   chartMuted    → stroke/fill via colors.chartMuted (JS only; used for chart reference lines and tracks)
 */
export const colors = {
  back: '#F2F2F7',
  ok: '#16A34A',
  nok: '#DC2626',
  brand: '#00956C',
  pink: '#F1ADCF',
  yellow: '#EFA73B',
  chartMuted: '#E4E4E7',
} as const;
