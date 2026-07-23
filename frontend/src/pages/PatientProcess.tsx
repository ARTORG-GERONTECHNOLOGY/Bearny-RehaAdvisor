import React from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Section from '@/components/Section';
import { Badge } from '@/components/ui/badge';
import type { ChartConfig } from '@/components/ui/chart';
import { format } from 'date-fns';
import RecommendationsCard from '@/components/PatientProcess/RecommendationsCard';
import MetricBarCard from '@/components/PatientProcess/MetricBarCard';
import BloodPressureCard from '@/components/PatientProcess/BloodPressureCard';
import { usePatientProcess } from '@/hooks/usePatientProcess';
import { PatientProcessLoadingContent } from '@/components/skeletons/PatientProcessSkeleton';
import { colors } from '@/lib/colors';

const THRESHOLD_LINE_PROPS: {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
} = {
  stroke: colors.chartMuted,
  strokeWidth: 2,
  strokeDasharray: '8 8',
};

const PatientProcess: React.FC = observer(() => {
  const { t } = useTranslation();

  const {
    processFilter,
    setProcessFilter,
    from,
    to,
    loading,
    error,
    dailyMetrics,
    adherenceTotals,
    averageMetrics,
    chartThresholds,
    chartYMax,
  } = usePatientProcess();

  const chartConfigs = React.useMemo(
    () => ({
      recommendations: {
        completed: { label: t('Completed') },
        uncompleted: { label: t('Uncompleted') },
      } satisfies ChartConfig,
      steps: {
        steps: { label: t('Steps') },
      } satisfies ChartConfig,
      activeMinutes: {
        activeMinutes: { label: t('activeMinutes') },
      } satisfies ChartConfig,
      sleepMinutes: {
        sleepMinutes: { label: t('Sleep (min)') },
      } satisfies ChartConfig,
      bloodPressure: {
        bpSys: { label: t('Blood pressure systolic') },
        bpDia: { label: t('Blood pressure diastolic') },
      } satisfies ChartConfig,
    }),
    [t]
  );

  const filterOptions: { value: 'week' | 'month'; label: string }[] = [
    { value: 'week', label: t('Last Week') },
    { value: 'month', label: t('Last Month') },
  ];

  const barMetricCards = [
    {
      metricKey: 'steps' as const,
      title: t('Steps'),
      average: averageMetrics.steps !== null ? averageMetrics.steps.toLocaleString() : '--',
      threshold: chartThresholds.stepsGreen,
      yMax: chartYMax.steps,
    },
    {
      metricKey: 'activeMinutes' as const,
      title: t('activeMinutes'),
      average: averageMetrics.activeMinutesLabel ?? '--',
      threshold: chartThresholds.activeMinutesGreen,
      yMax: chartYMax.activeMinutes,
    },
    {
      metricKey: 'sleepMinutes' as const,
      title: t('Sleep'),
      average: averageMetrics.sleepMinutesLabel ?? '--',
      threshold: chartThresholds.sleepMinutesGreen,
      yMax: chartYMax.sleepMinutes,
    },
  ];

  if (!loading && error) {
    return (
      <Layout>
        <div className="text-nok text-center py-10">{t('Failed to load health data.')}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-8 justify-between items-start">
        <PageHeader
          title={t('Process')}
          subtitle={`${format(new Date(`${from}T00:00:00Z`), 'dd.MM.')} - ${format(new Date(`${to}T00:00:00Z`), 'dd.MM.')}`}
        />
        <div
          className="flex gap-1 no-scrollbar overflow-y-auto"
          role="group"
          aria-label={t('Filter by time period')}
        >
          {filterOptions.map(({ value, label }) => (
            <Badge
              key={value}
              onClick={() => setProcessFilter(value)}
              variant={processFilter === value ? 'filter-active' : 'filter-inactive'}
              role="button"
              aria-pressed={processFilter === value}
              aria-label={processFilter === 'week' ? t('Show last week') : t('Show last month')}
              className="px-4 py-2 text-base"
            >
              {label}
            </Badge>
          ))}
        </div>
      </div>

      {loading && <PatientProcessLoadingContent />}

      {!loading && (
        <div className="flex flex-col gap-2 mt-6 lg:grid lg:grid-cols-3 lg:items-start">
          <Section>
            <div className="flex flex-col gap-2">
              <RecommendationsCard
                title={t('Recommendations')}
                doneLabel={t('Done')}
                recommendationsPct={averageMetrics.recommendationsPct}
                adherenceTotals={adherenceTotals}
                chartConfig={chartConfigs.recommendations}
                doneColor={colors.brand}
                notDoneColor={colors.chartMuted}
              />
            </div>
          </Section>

          <Section>
            <div className="flex flex-col gap-2">
              {barMetricCards.map((card) => (
                <MetricBarCard
                  key={card.metricKey}
                  title={card.title}
                  average={card.average}
                  metricKey={card.metricKey}
                  data={dailyMetrics}
                  yMax={card.yMax}
                  threshold={card.threshold}
                  chartConfig={chartConfigs[card.metricKey]}
                  thresholdLineProps={THRESHOLD_LINE_PROPS}
                />
              ))}
            </div>
          </Section>

          <Section>
            <div className="flex flex-col gap-2">
              <BloodPressureCard
                title={t('Blood pressure')}
                bpSysAverage={averageMetrics.bpSys}
                bpDiaAverage={averageMetrics.bpDia}
                chartConfig={chartConfigs.bloodPressure}
                data={dailyMetrics}
                yMax={chartYMax.bloodPressure}
                bpSysThreshold={chartThresholds.bpSysGreenMax}
                bpDiaThreshold={chartThresholds.bpDiaGreenMax}
                lineColor={colors.chartMuted}
                thresholdLineProps={THRESHOLD_LINE_PROPS}
              />
            </div>
          </Section>
        </div>
      )}
    </Layout>
  );
});

export default PatientProcess;
