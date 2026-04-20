import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Section from '@/components/Section';
import { Badge } from '@/components/ui/badge';
import type { ChartConfig } from '@/components/ui/chart';
import { format } from 'date-fns';
import authStore from '@/stores/authStore';
import RecommendationsCard from '@/components/PatientProcess/RecommendationsCard';
import MetricBarCard from '@/components/PatientProcess/MetricBarCard';
import BloodPressureCard from '@/components/PatientProcess/BloodPressureCard';
import { usePatientProcess } from '@/hooks/usePatientProcess';
import { PatientProcessLoadingContent } from '@/components/skeletons/PatientProcessSkeleton';

const CHART_ACCENT = '#F1ADCF';
const CHART_ACCENT_LIGHT = '#F1ADCF80';
const CHART_ACCENT_SOFT = '#FCEFF5';
const THRESHOLD_LINE_PROPS: {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
} = {
  stroke: '#E4E4E7',
  strokeWidth: 2,
  strokeDasharray: '8 8',
};

const PatientProcess: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
    thresholdStatus,
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
      threshold: chartThresholds.steps,
      yMax: chartYMax.steps,
      status: thresholdStatus.steps,
    },
    {
      metricKey: 'activeMinutes' as const,
      title: t('activeMinutes'),
      average: averageMetrics.activeMinutesLabel ?? '--',
      threshold: chartThresholds.activeMinutes,
      yMax: chartYMax.activeMinutes,
      status: thresholdStatus.activeMinutes,
    },
    {
      metricKey: 'sleepMinutes' as const,
      title: t('Sleep'),
      average: averageMetrics.sleepMinutesLabel ?? '--',
      threshold: chartThresholds.sleepMinutes,
      yMax: chartYMax.sleepMinutes,
      status: thresholdStatus.sleepMinutes,
    },
  ];

  useEffect(() => {
    let alive = true;

    const checkAuth = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;
      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
      }
    };

    checkAuth();

    return () => {
      alive = false;
    };
  }, [navigate]);

  if (!loading && error) {
    return (
      <Layout>
        <div className="text-red-600 text-center py-10">{t('Failed to load health data.')}</div>
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
                accentColor={CHART_ACCENT}
                accentSoftColor={CHART_ACCENT_SOFT}
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
                  status={card.status}
                  chartConfig={chartConfigs[card.metricKey]}
                  accentColor={CHART_ACCENT}
                  thresholdLineProps={THRESHOLD_LINE_PROPS}
                />
              ))}
            </div>
          </Section>

          <Section>
            <div className="flex flex-col gap-2">
              <BloodPressureCard
                title={t('Blood pressure')}
                bpSys={averageMetrics.bpSys}
                bpDia={averageMetrics.bpDia}
                status={thresholdStatus.bloodPressure}
                chartConfig={chartConfigs.bloodPressure}
                data={dailyMetrics}
                yMax={chartYMax.bloodPressure}
                bpSysThreshold={chartThresholds.bpSysMax}
                bpDiaThreshold={chartThresholds.bpDiaMax}
                accentColor={CHART_ACCENT}
                accentLightColor={CHART_ACCENT_LIGHT}
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
