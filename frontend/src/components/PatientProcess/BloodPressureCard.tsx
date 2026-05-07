import React from 'react';
import { CartesianGrid, Dot, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { DailyMetricsDatum } from '@/hooks/usePatientProcess';
import Card from '@/components/Card';
import { useTranslation } from 'react-i18next';

type Props = {
  title: string;
  bpSysAverage: number | null;
  bpDiaAverage: number | null;
  chartConfig: ChartConfig;
  data: DailyMetricsDatum[];
  yMax: number;
  bpSysThreshold: number | null;
  bpDiaThreshold: number | null;
  lineColor: string;
  thresholdLineProps: {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string;
  };
};

const BloodPressureCard: React.FC<Props> = ({
  title,
  bpSysAverage,
  bpDiaAverage,
  chartConfig,
  data,
  yMax,
  bpSysThreshold,
  bpDiaThreshold,
  lineColor,
  thresholdLineProps,
}) => {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="font-bold text-lg text-zinc-800">{title}</div>
      <div className="font-medium text-sm text-zinc-500">{t('Average per day')}</div>

      <div className="flex items-end">
        <div className="flex-1">
          <div className="font-bold text-[28px] text-zinc-900 leading-[110%] tracking-[-1.1%]">
            {bpSysAverage !== null ? bpSysAverage : '--'}
            <br />/{bpDiaAverage !== null ? bpDiaAverage : '--'} mmHg
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
              <ChartTooltip content={<ChartTooltipContent hideLabel hideIndicator />} />
              <Line
                type="monotone"
                dataKey="bpSys"
                stroke={lineColor}
                strokeWidth={4}
                strokeOpacity={0.7}
                connectNulls={true}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const fill = (payload as DailyMetricsDatum).colors.bpSys;
                  return <Dot key={props.key} cx={cx} cy={cy} r={4} fill={fill} stroke={fill} />;
                }}
              />
              <Line
                type="monotone"
                dataKey="bpDia"
                stroke={lineColor}
                strokeWidth={4}
                strokeOpacity={0.5}
                connectNulls={true}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const fill = (payload as DailyMetricsDatum).colors.bpDia;
                  return <Dot key={props.key} cx={cx} cy={cy} r={4} fill={fill} stroke={fill} />;
                }}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </div>
    </Card>
  );
};

export default BloodPressureCard;
