import React, { useId } from 'react';

// Star path and viewBox extracted from assets/icons/interventions/star.svg
const STAR_PATH =
  'M30.1577 12.0642C30.0013 11.5824 29.5835 11.2304 29.0822 11.1575L20.8688 9.9646L17.1959 2.52105C16.7479 1.61082 15.2528 1.61082 14.8048 2.52105L11.1319 9.96282L2.91861 11.1557C2.41728 11.2286 1.9995 11.5806 1.84306 12.0624C1.68661 12.5442 1.81639 13.0757 2.18084 13.4295L8.12395 19.2215L6.7195 27.401C6.63417 27.9024 6.83861 28.4073 7.24928 28.7059C7.65995 29.0028 8.20573 29.0419 8.65373 28.8073L15.9995 24.9442L23.3453 28.8073C23.5408 28.9104 23.7524 28.9602 23.9657 28.9602C24.2413 28.9602 24.5168 28.8748 24.7497 28.7059C25.1604 28.4073 25.3666 27.9024 25.2795 27.401L23.8751 19.2215L29.8182 13.4295C30.1826 13.0757 30.3124 12.5442 30.1559 12.0624L30.1577 12.0642Z';
const SIZE_VB = 32;

interface StarRatingProps {
  value: number | null | undefined;
  showNumber?: boolean;
  max?: number;
  size?: number;
}

/** Single star with a fractional gold fill (0–1). */
const Star: React.FC<{ fill: number; id: string; size: number }> = ({ fill, id, size }) => {
  const clipId = `${id}-clip`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE_VB} ${SIZE_VB}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={SIZE_VB * fill} height={SIZE_VB} />
        </clipPath>
      </defs>
      {/* grey background */}
      <path d={STAR_PATH} fill="#d1d5db" />
      {/* gold foreground clipped to fill % */}
      <path d={STAR_PATH} fill="#f59e0b" clipPath={`url(#${clipId})`} />
    </svg>
  );
};

const StarRating: React.FC<StarRatingProps> = ({
  value,
  showNumber = false,
  max = 5,
  size = 16,
}) => {
  if (value == null || isNaN(value) || value <= 0) return null;

  const uid = useId();
  const clamped = Math.min(value, max);

  return (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap"
      aria-label={`${value}/${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const fill = Math.min(1, Math.max(0, clamped - i));
        return <Star key={i} fill={fill} id={`${uid}-${i}`} size={size} />;
      })}
      {showNumber && <span className="text-xs text-gray-500 ml-1">{value}</span>}
    </span>
  );
};

/**
 * Extracts the numeric star rating (1–5) from a date entry's feedback array.
 * The backend serialises without questionKey, but star answers always have
 * translations containing the ★ character (e.g. "★★★☆☆ (3/5)").
 */
export const getRatingFromDateEntry = (dateEntry: { feedback?: any[] }): number | null => {
  const fbs = Array.isArray(dateEntry.feedback) ? dateEntry.feedback : [];
  for (const fb of fbs as any[]) {
    const answers = Array.isArray(fb?.answer) ? (fb.answer as any[]) : [];
    for (const answer of answers) {
      const translations = Array.isArray(answer?.translations) ? answer.translations : [];
      const isStar = translations.some((tr: any) => String(tr?.text || '').includes('★'));
      if (isStar) {
        const n = Number(answer?.key);
        if (!isNaN(n) && n >= 1 && n <= 5) return n;
      }
    }
  }
  return null;
};

export default StarRating;
