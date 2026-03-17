import React from 'react';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

type Props = {
  title: string;
  doneLabel: string;
  recommendationsPct: number | null;
  adherenceTotals: { completed: number; uncompleted: number };
  chartConfig: ChartConfig;
  accentColor: string;
  accentSoftColor: string;
};

const RecommendationsCard: React.FC<Props> = ({
  title,
  doneLabel,
  recommendationsPct,
  adherenceTotals,
  chartConfig,
  accentColor,
  accentSoftColor,
}) => {
  return (
    <div className="p-4 border border-accent rounded-3xl">
      <div>
        <div className="font-bold text-lg text-zinc-800">{title}</div>
        <div className="font-medium text-sm text-zinc-500 flex gap-1 items-center">
          {doneLabel}
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
        </div>
      </div>

      <div className="flex items-end">
        <div className="flex-1">
          <div className="font-bold text-[28px] text-zinc-900">
            {recommendationsPct !== null ? `${recommendationsPct}%` : '--%'}
          </div>
        </div>

        <div className="flex-1">
          <ChartContainer config={chartConfig} className="w-full">
            <BarChart
              layout="vertical"
              accessibilityLayer
              data={[adherenceTotals]}
              margin={{ bottom: 16 }}
            >
              <XAxis
                type="number"
                domain={[0, Math.max(1, adherenceTotals.completed + adherenceTotals.uncompleted)]}
                hide
              />
              <YAxis type="category" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />

              <Bar dataKey="completed" stackId="a" fill={accentColor} radius={18}>
                <LabelList
                  dataKey="completed"
                  content={({ x, y, height, value }) => (
                    <text
                      x={Number(x)}
                      y={Number(y) + Number(height) + 16}
                      textAnchor="start"
                      className="fill-zinc-400 text-xs font-medium"
                    >
                      {String(value)}
                    </text>
                  )}
                />
              </Bar>

              <Bar dataKey="uncompleted" stackId="a" fill={accentSoftColor} radius={18}>
                <LabelList
                  dataKey="uncompleted"
                  content={({ x, y, height, value }) => (
                    <text
                      x={Number(x)}
                      y={Number(y) + Number(height) + 16}
                      textAnchor="start"
                      className="fill-zinc-400 text-xs font-medium"
                    >
                      {String(value)}
                    </text>
                  )}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
};

export default RecommendationsCard;
