import React from 'react';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CircleXFill from '@/assets/icons/circle-xmark-fill.svg?react';

type Props = {
  isReached: boolean | null;
  reachedLabel: string;
  notReachedLabel: string;
};

const ThresholdStatusBadge: React.FC<Props> = ({ isReached, reachedLabel, notReachedLabel }) => {
  if (isReached === null) return null;

  return (
    <div className={`flex gap-2 ${isReached ? 'text-[#16A34A]' : 'text-red-600'}`}>
      <div className="font-bold text-lg">{isReached ? reachedLabel : notReachedLabel}</div>
      {isReached ? <CircleCheckFill className="w-8 h-8" /> : <CircleXFill className="w-8 h-8" />}
    </div>
  );
};

export default ThresholdStatusBadge;
