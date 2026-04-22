import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '@/lib/colors';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CircleDashedFill from '@/assets/icons/circle-dashed-fill.svg?react';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import FitbitConnectButton from '@/components/PatientPage/FitbitStatus';
import ProgressIndicator from '@/components/PatientPage/ProgressIndicator';
import Section from '@/components/Section';
import { PatientActivitySectionSkeleton } from '@/components/skeletons/PatientSkeleton';
import Card from '@/components/Card';

interface StepsHistoryItem {
  date: string;
  steps: number;
}

interface ActivitySectionProps {
  loading: boolean;
  connected: boolean;
  stepsToday?: number | null;
  stepsGoal?: number | null;
  stepsHistoryData: StepsHistoryItem[];
  activeMinutes?: number | null;
  activeMinutesGoal?: number | null;
  sleepMinutes?: number | null;
  sleepMinutesGoal?: number | null;
  onOpenManualStepsEntry: () => void;
}

const ActivitySection: React.FC<ActivitySectionProps> = ({
  loading,
  connected,
  stepsToday,
  stepsGoal,
  stepsHistoryData,
  activeMinutes,
  activeMinutesGoal,
  sleepMinutes,
  sleepMinutesGoal,
  onOpenManualStepsEntry,
}) => {
  const { t } = useTranslation();

  const stepsChartMax = useMemo(() => {
    const maxFromHistory =
      stepsHistoryData.length > 0 ? Math.max(...stepsHistoryData.map((item) => item.steps)) : 0;
    const maxReference = Math.max(maxFromHistory, stepsGoal ?? 0);
    return maxReference > 0 ? Math.ceil(maxReference * 1.1) : 1000;
  }, [stepsHistoryData, stepsGoal]);

  const formatMinutesToHM = (minutes?: number | null) => {
    if (!minutes || Number.isNaN(Number(minutes))) return '--';
    const total = Math.max(0, Math.round(Number(minutes)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return `${hours}h ${mins}min`;
  };

  if (loading) {
    return <PatientActivitySectionSkeleton />;
  }

  return (
    <Section>
      <div className="flex p-2 pl-4 justify-between w-full">
        <div className="text-lg font-medium text-zinc-500">{t('Todays Activity')}</div>
        {connected && <Badge variant="section">{t('Fitbit Connected')}</Badge>}
      </div>

      <div className="flex flex-col gap-2">
        <Card
          role={!connected ? 'button' : undefined}
          onClick={() => {
            if (connected) return;
            onOpenManualStepsEntry();
          }}
          className="flex flex-col gap-4 justify-between"
        >
          <div className="flex justify-between">
            <div>
              <div className="font-bold text-lg text-zinc-800">{t('Steps')}</div>
              {!connected && (
                <div className="font-medium text-sm text-zinc-500">{t('Manual entry')}</div>
              )}
            </div>
            <div className="w-8 h-8 shrink-0">
              {connected ? (
                <ProgressIndicator current={stepsToday ?? 0} goal={stepsGoal ?? 0} />
              ) : stepsToday ? (
                <CircleCheckFill className="w-full h-full text-ok" />
              ) : (
                <CircleDashedFill className="w-full h-full text-zinc-200" />
              )}
            </div>
          </div>

          <div className="flex items-end">
            <div className="flex-1">
              <div className="font-bold text-[28px] text-zinc-900 leading-[110%] tracking-[-1.1%]">
                {stepsToday || '--'}
              </div>
              <div className="font-medium text-sm text-zinc-500">
                {t('Goal')}: {stepsGoal || '--'}
              </div>
            </div>

            {connected && (
              <div className="flex-1">
                <ChartContainer
                  config={{
                    steps: { label: t('Steps') },
                  }}
                  className="w-full max-h-36"
                >
                  <BarChart accessibilityLayer data={stepsHistoryData}>
                    <CartesianGrid vertical={false} />
                    <YAxis hide domain={[0, stepsChartMax]} />
                    {stepsGoal !== null && stepsGoal !== undefined && (
                      <ReferenceLine
                        y={stepsGoal}
                        stroke={colors.chartMuted}
                        strokeWidth={2}
                        strokeDasharray="8 8"
                      />
                    )}
                    <XAxis dataKey="date" hide />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Bar dataKey="steps" fill={colors.pink} radius={18} />
                  </BarChart>
                </ChartContainer>
              </div>
            )}
          </div>
        </Card>

        {connected && (
          <div className="flex gap-2 flex-wrap">
            <Card className="flex-1 flex flex-col gap-4 justify-between">
              <div className="flex justify-between">
                <div className="font-bold text-lg text-zinc-800">{t('activeMinutes')}</div>
                <div className="w-8 h-8 shrink-0">
                  <ProgressIndicator current={activeMinutes ?? 0} goal={activeMinutesGoal ?? 0} />
                </div>
              </div>
              <div>
                <div className="font-bold text-[28px] text-zinc-900 leading-[110%] tracking-[-1.1%]">
                  {formatMinutesToHM(activeMinutes)}
                </div>
                <div className="font-medium text-sm text-zinc-500">
                  {t('Goal')}: {formatMinutesToHM(activeMinutesGoal)}
                </div>
              </div>
            </Card>

            <Card className="flex-1 flex flex-col gap-4 justify-between">
              <div className="flex justify-between">
                <div className="font-bold text-lg text-zinc-800">{t('Sleep')}</div>
                <div className="w-8 h-8 shrink-0">
                  <ProgressIndicator current={sleepMinutes ?? 0} goal={sleepMinutesGoal ?? 0} />
                </div>
              </div>
              <div>
                <div className="font-bold text-[28px] text-zinc-900 leading-[110%] tracking-[-1.1%]">
                  {formatMinutesToHM(sleepMinutes)}
                </div>
                <div className="font-medium text-sm text-zinc-500">
                  {t('Goal')}: {formatMinutesToHM(sleepMinutesGoal)}
                </div>
              </div>
            </Card>
          </div>
        )}

        {!connected && (
          <div className="p-4 rounded-3xl bg-zinc-100 flex gap-1 justify-between items-center">
            <div className="flex flex-col">
              <div className="font-bold text-lg text-zinc-800">{t('Fitbit')}</div>
              <div className="font-medium text-sm text-zinc-500">{t('Fitness Tracker')}</div>
            </div>
            <FitbitConnectButton />
          </div>
        )}
      </div>
    </Section>
  );
};

export default ActivitySection;
