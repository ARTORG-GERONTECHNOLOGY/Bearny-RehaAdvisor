import React from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { BarMetricKey, DailyMetricsDatum, ThresholdStatus } from '@/hooks/usePatientProcess';
import ThresholdStatusBadge from '@/components/PatientProcess/ThresholdStatusBadge';
import { useTranslation } from 'react-i18next';

type Props = {
  title: string;
  average: string;
  metricKey: BarMetricKey;
  data: DailyMetricsDatum[];
  yMax: number;
  threshold: number | null;
  status: ThresholdStatus;
  chartConfig: ChartConfig;
  accentColor: string;
  thresholdLineProps: {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string;
  };
};

const MetricBarCard: React.FC<Props> = ({
  title,
  average,
  metricKey,
  data,
  yMax,
  threshold,
  status,
  chartConfig,
  accentColor,
  thresholdLineProps,
}) => {
  const { t } = useTranslation();

  return (
    <div className="p-4 border border-accent rounded-3xl">
      <div className="flex justify-between">
        <div>
          <div className="font-bold text-lg text-zinc-800">{title}</div>
          <div className="font-medium text-sm text-zinc-500">{t('Average per day')}</div>
        </div>
        <ThresholdStatusBadge status={status} />
      </div>

      <div className="flex items-end">
        <div className="flex-1">
          <div className="font-bold text-[28px] text-zinc-900 leading-[110%] tracking-[-1.1%]">
            {average}
          </div>
        </div>

        <div className="flex-1">
          <ChartContainer config={chartConfig} className="w-full max-h-36">
            <BarChart accessibilityLayer data={data}>
              <CartesianGrid vertical={false} />
              <YAxis hide domain={[0, yMax]} />
              {threshold !== null && <ReferenceLine y={threshold} {...thresholdLineProps} />}
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                tickFormatter={(date) => date.slice(3)}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey={metricKey} fill={accentColor} radius={18} />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
};

export default MetricBarCard;
