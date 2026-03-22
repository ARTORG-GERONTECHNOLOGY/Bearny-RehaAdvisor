import React from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { DailyMetricsDatum } from '@/hooks/usePatientProcess';
import ThresholdStatusBadge from '@/components/PatientProcess/ThresholdStatusBadge';
import { useTranslation } from 'react-i18next';

type Props = {
  title: string;
  bpSys: number | null;
  bpDia: number | null;
  isReached: boolean | null;
  chartConfig: ChartConfig;
  data: DailyMetricsDatum[];
  yMax: number;
  bpSysThreshold: number | null;
  bpDiaThreshold: number | null;
  accentColor: string;
  accentLightColor: string;
  thresholdLineProps: {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string;
  };
};

const BloodPressureCard: React.FC<Props> = ({
  title,
  bpSys,
  bpDia,
  isReached,
  chartConfig,
  data,
  yMax,
  bpSysThreshold,
  bpDiaThreshold,
  accentColor,
  accentLightColor,
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
        <ThresholdStatusBadge isReached={isReached} />
      </div>

      <div className="flex items-end">
        <div className="flex-1">
          <div className="font-bold text-[28px] text-zinc-900">
            {bpSys !== null ? bpSys : '--'}
            <br />/{bpDia !== null ? bpDia : '--'} mmHg
          </div>
        </div>

        <div className="flex-1">
          <ChartContainer config={chartConfig} className="w-full max-h-36">
            <LineChart accessibilityLayer data={data}>
              <CartesianGrid vertical={false} />
              <YAxis hide domain={[0, yMax]} />
              {bpSysThreshold !== null && (
                <ReferenceLine y={bpSysThreshold} {...thresholdLineProps} />
              )}
              {bpDiaThreshold !== null && (
                <ReferenceLine y={bpDiaThreshold} {...thresholdLineProps} />
              )}
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                tickFormatter={(date) => date.slice(3)}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Line
                type="monotone"
                dataKey="bpSys"
                stroke={accentColor}
                strokeWidth={4}
                dot={true}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="bpDia"
                stroke={accentLightColor}
                strokeWidth={4}
                dot={true}
                connectNulls={true}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
};

export default BloodPressureCard;
