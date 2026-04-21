import React from 'react';
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts';
import { colors } from '@/lib/colors';

interface ProgressIndicatorProps {
  current: number;
  goal: number;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ current, goal }) => {
  const progressPercent = goal > 0 ? (current / goal) * 100 : 0;
  const normalizedProgress = Math.max(0, Math.min(100, progressPercent));

  return (
    <RadialBarChart
      width={32}
      height={32}
      data={[{ name: 'Progress', value: normalizedProgress }]}
      cx="50%"
      cy="50%"
      startAngle={90}
      endAngle={-270}
      innerRadius={11}
      outerRadius={15}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
      <RadialBar
        dataKey="value"
        fill={colors.success}
        background={{ fill: colors.chartMuted }}
        cornerRadius={999}
      />
    </RadialBarChart>
  );
};

export default ProgressIndicator;
