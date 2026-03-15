import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '@/stores/authStore';
import apiClient from '@/api/client';
import Layout from '@/components/Layout';
import { Badge } from '@/components/ui/badge';

type ProcessFilter = 'week' | 'month';
type PatientThresholds = Record<string, number>;
type CombinedHealthResponse = {
  fitbit?: unknown[];
  questionnaire?: unknown[];
  adherence?: unknown[];
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const getDateWindow = (filter: ProcessFilter) => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (filter === 'week' ? 7 : 30));

  return { from: toISODate(from), to: toISODate(to) };
};

const PatientProcess: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [processFilter, setProcessFilter] = React.useState<ProcessFilter>('week');
  const [thresholds, setThresholds] = React.useState<PatientThresholds | null>(null);
  const [thresholdsLoading, setThresholdsLoading] = React.useState(false);
  const [thresholdsError, setThresholdsError] = React.useState('');
  const [combinedHistory, setCombinedHistory] = React.useState<CombinedHealthResponse | null>(null);
  const [combinedHistoryLoading, setCombinedHistoryLoading] = React.useState(false);
  const [combinedHistoryError, setCombinedHistoryError] = React.useState('');

  const patientId = localStorage.getItem('id') || authStore.id || '';

  const filterOptions: { value: ProcessFilter; label: string }[] = [
    { value: 'week', label: t('Last Week') },
    { value: 'month', label: t('Last Month') },
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

  useEffect(() => {
    let alive = true;

    const loadThresholds = async () => {
      if (!patientId || !authStore.isAuthenticated || authStore.userType !== 'Patient') return;

      setThresholdsLoading(true);
      setThresholdsError('');

      try {
        const res = await apiClient.get(`/patients/${patientId}/thresholds/`);
        const raw = res?.data;
        const next = (raw?.thresholds ?? raw) as unknown;

        if (!alive) return;

        if (next && typeof next === 'object' && !Array.isArray(next)) {
          setThresholds(next as PatientThresholds);
        } else {
          setThresholds(null);
          setThresholdsError(t('Failed to load thresholds.'));
        }
      } catch (err: unknown) {
        const errObj = err as {
          response?: { data?: { error?: string; message?: string; detail?: string } };
        };
        const msg = errObj?.response?.data;

        if (!alive) return;
        setThresholds(null);
        setThresholdsError(
          String(msg?.error || msg?.message || msg?.detail || t('Failed to load thresholds.'))
        );
      } finally {
        if (alive) setThresholdsLoading(false);
      }
    };

    void loadThresholds();

    return () => {
      alive = false;
    };
  }, [patientId, t, authStore.isAuthenticated, authStore.userType]);

  useEffect(() => {
    let alive = true;

    const loadCombinedHistory = async () => {
      if (!patientId || !authStore.isAuthenticated || authStore.userType !== 'Patient') return;

      const { from, to } = getDateWindow(processFilter);

      setCombinedHistoryLoading(true);
      setCombinedHistoryError('');

      try {
        const res = await apiClient.get<CombinedHealthResponse>(
          `/patients/health-combined-history/${patientId}/`,
          { params: { from, to } }
        );

        if (!alive) return;
        setCombinedHistory(res?.data || {});
      } catch (err: unknown) {
        const errObj = err as {
          response?: { data?: { error?: string; message?: string; detail?: string } };
        };
        const msg = errObj?.response?.data;

        if (!alive) return;
        setCombinedHistory(null);
        setCombinedHistoryError(
          String(msg?.error || msg?.message || msg?.detail || t('Failed to load health data.'))
        );
      } finally {
        if (alive) setCombinedHistoryLoading(false);
      }
    };

    void loadCombinedHistory();

    return () => {
      alive = false;
    };
  }, [patientId, processFilter, t, authStore.isAuthenticated, authStore.userType]);

  const { from, to } = getDateWindow(processFilter);
  const fitbitCount = Array.isArray(combinedHistory?.fitbit) ? combinedHistory.fitbit.length : 0;
  const questionnaireCount = Array.isArray(combinedHistory?.questionnaire)
    ? combinedHistory.questionnaire.length
    : 0;
  const adherenceCount = Array.isArray(combinedHistory?.adherence)
    ? combinedHistory.adherence.length
    : 0;

  return (
    <Layout>
      <h1 className="text-2xl font-bold p-0 m-0 text-zinc-800">{t('Process')}</h1>

      <div
        className="mt-8 flex gap-1 no-scrollbar overflow-y-auto"
        role="group"
        aria-label={t('Filter by time period')}
      >
        {filterOptions.map(({ value, label }) => (
          <Badge
            key={value}
            onClick={() => setProcessFilter(value)}
            className={`font-medium rounded-full py-[10px] px-4 border-none shadow-none text-nowrap ${
              processFilter === value ? 'bg-white text-zinc-800' : 'bg-zinc-50 text-zinc-400'
            }`}
            role="button"
            aria-pressed={processFilter === value}
            aria-label={processFilter === 'week' ? t('Show last week') : t('Show last month')}
          >
            {label}
          </Badge>
        ))}
      </div>

      <div className="flex flex-col gap-2 mt-6">
        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="text-sm text-zinc-500">
            {t('Threshold values from API')} (
            {processFilter === 'week' ? t('last week') : t('last month')})
          </div>

          {thresholdsLoading && <div>{t('Loading')}...</div>}

          {!thresholdsLoading && thresholdsError && (
            <div className="text-red-600" role="alert">
              {thresholdsError}
            </div>
          )}

          {!thresholdsLoading && !thresholdsError && thresholds && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {Object.entries(thresholds).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between border-b border-zinc-100 py-1"
                >
                  <span className="text-zinc-500">{key}</span>
                  <span className="font-medium text-zinc-800">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="text-sm text-zinc-500">
            {t('Combined health history')} ({from} - {to})
          </div>

          {combinedHistoryLoading && <div>{t('Loading')}...</div>}

          {!combinedHistoryLoading && combinedHistoryError && (
            <div className="text-red-600" role="alert">
              {combinedHistoryError}
            </div>
          )}

          {!combinedHistoryLoading && !combinedHistoryError && combinedHistory && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 py-1">
                <span className="text-zinc-500">fitbit</span>
                <span className="font-medium text-zinc-800">{fitbitCount}</span>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-100 py-1">
                <span className="text-zinc-500">questionnaire</span>
                <span className="font-medium text-zinc-800">{questionnaireCount}</span>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-100 py-1">
                <span className="text-zinc-500">adherence</span>
                <span className="font-medium text-zinc-800">{adherenceCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
});

export default PatientProcess;
