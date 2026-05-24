import type React from 'react';

import flowerGreenImage from '@/assets/icf/flower_green.png';
import flowerVioletImage from '@/assets/icf/flower_violet.png';
import flowerYellowImage from '@/assets/icf/flower_yellow.png';

// Each entry defines one flower on the desktop side columns.
// `outset` = extra px beyond the content edge (calc(50% + 21rem + outset)).
const SIDE_FLOWERS: {
  src: string;
  side: 'left' | 'right';
  top: string;
  outset: number;
  width: number;
  rotate?: number;
}[] = [
  // ── Left column ──────────────────────────────────────────────
  { src: flowerVioletImage, side: 'left', top: '37.5px', outset: 75, width: 84, rotate: -10 },
  { src: flowerGreenImage, side: 'left', top: '200px', outset: 60, width: 74, rotate: 6 },
  { src: flowerVioletImage, side: 'left', top: '375px', outset: 24, width: 84, rotate: -16 },
  { src: flowerYellowImage, side: 'left', top: '537.5px', outset: 96, width: 90, rotate: 10 },
  { src: flowerGreenImage, side: 'left', top: '625px', outset: 24, width: 74, rotate: 16 },
  // ── Right column ─────────────────────────────────────────────
  { src: flowerVioletImage, side: 'right', top: '400px', outset: 96, width: 84, rotate: -8 },
  { src: flowerGreenImage, side: 'right', top: '512.5px', outset: 24, width: 74, rotate: 12 },
  { src: flowerYellowImage, side: 'right', top: '675px', outset: 50, width: 90, rotate: 12 },
];

export function FlowerSides() {
  return (
    <>
      {SIDE_FLOWERS.map((f, i) => {
        const hStyle: React.CSSProperties =
          f.side === 'left'
            ? { right: `calc(50% + 21rem + ${f.outset}px)` }
            : { left: `calc(50% + 21rem + ${f.outset}px)` };
        return (
          <img
            key={i}
            src={f.src}
            alt=""
            className="icf-flower-side"
            style={{
              top: f.top,
              width: f.width,
              transform: f.rotate ? `rotate(${f.rotate}deg)` : undefined,
              ...hStyle,
            }}
          />
        );
      })}
    </>
  );
}

// Each entry defines one flower in the bottom button row.
// `side`    = which group (left or right of the children).
// `offsetY` = vertical offset in px — positive moves the flower down.
// `rotate`  = rotation in degrees.
const BOTTOM_FLOWERS: {
  src: string;
  side: 'left' | 'right';
  width: number;
  rotate?: number;
  offsetY?: number;
}[] = [
  // ── Left group ───────────────────────────────────────────────
  { src: flowerGreenImage, side: 'left', width: 37, rotate: 0, offsetY: 0 },
  { src: flowerYellowImage, side: 'left', width: 50, rotate: 10, offsetY: -16 },
  // ── Right group ──────────────────────────────────────────────
  { src: flowerYellowImage, side: 'right', width: 50, rotate: 32, offsetY: 16 },
  { src: flowerVioletImage, side: 'right', width: 42, rotate: -6, offsetY: -24 },
];

interface FlowerButtonRowProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function FlowerButtonRow({ children, style }: FlowerButtonRowProps) {
  const leftFlowers = BOTTOM_FLOWERS.filter((f) => f.side === 'left');
  const rightFlowers = BOTTOM_FLOWERS.filter((f) => f.side === 'right');

  const renderFlower = (f: (typeof BOTTOM_FLOWERS)[number], i: number) => (
    <img
      key={i}
      src={f.src}
      alt=""
      className="icf-flower-bottom"
      style={{
        width: f.width,
        transform: f.rotate ? `rotate(${f.rotate}deg)` : undefined,
        position: 'relative',
        top: f.offsetY ?? 0,
      }}
    />
  );

  return (
    <div className="icf-btn-row mb-6" style={style}>
      <div className="icf-flower-bottom-group">{leftFlowers.map(renderFlower)}</div>
      {children}
      <div className="icf-flower-bottom-group">{rightFlowers.map(renderFlower)}</div>
    </div>
  );
}
