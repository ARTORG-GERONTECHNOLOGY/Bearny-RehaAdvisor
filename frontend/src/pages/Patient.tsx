// src/pages/PatientView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

import ErrorAlert from '@/components/common/ErrorAlert';
import Layout from '@/components/Layout';
import ActivitySection from '@/components/PatientPage/ActivitySection';
import DailyInterventionCard from '@/components/PatientPage/DailyInterventionCard';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import HealthCheckInSection from '@/components/PatientPage/HealthCheckInSection';
import ManualBloodPressureSheet from '@/components/PatientPage/ManualBloodPressureSheet';
import ManualStepsSheet from '@/components/PatientPage/ManualStepsSheet';
import ManualWeightSheet from '@/components/PatientPage/ManualWeightSheet';
import PatientQuestionaire from '@/components/PatientPage/PatientQuestionaire';
import authStore from '@/stores/authStore';
import { patientUiStore } from '@/stores/patientUiStore';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { patientVitalsStore } from '@/stores/patientVitalsStore';
import { useInterventions } from '@/hooks/useInterventions';
import type { PatientType } from '@/types';
import { getDateFnsLocale } from '@/utils/dateLocale';
import HomeIllustration from '@/assets/home_illustration.svg?react';

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const locale = getDateFnsLocale(i18n.language);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const fitbitStatus = useMemo(() => searchParams.get('fitbit_status'), [searchParams]);
  const patientId = localStorage.getItem('id') || authStore.id || '';

  // Get today's interventions completion count for badge
  const today = useMemo(() => new Date(), []);
  const { completionCount } = useInterventions(today);
  const completionBadge =
    completionCount.total > 0 ? `${completionCount.completed}/${completionCount.total}` : undefined;

  const selectedDateLabel = format(patientUiStore.selectedDate, 'dd.MM.yyyy', { locale });
  const selectedDateLongLabel = format(patientUiStore.selectedDate, 'dd. MMMM yyyy', { locale });

  const stepsHistoryData = useMemo(() => {
    const dailyRows = patientFitbitStore.summary?.period?.daily;
    if (!Array.isArray(dailyRows)) return [];

    return dailyRows.slice(-7).map((row) => {
      const parsedSteps = Number(row.steps ?? 0);
      const safeSteps = Number.isFinite(parsedSteps) ? Math.max(0, Math.round(parsedSteps)) : 0;
      const label = typeof row.date === 'string' ? row.date.slice(5, 10) : '';

      return {
        date: label,
        steps: safeSteps,
      };
    });
  }, [patientFitbitStore.summary?.period?.daily]);

  // State for manual entry modals
  const [showManualStepsEntry, setShowManualStepsEntry] = useState<boolean>(false);
  const [showManualWeightEntry, setShowManualWeightEntry] = useState<boolean>(false);
  const [showManualBloodPressureEntry, setShowManualBloodPressureEntry] = useState<boolean>(false);

  // Safe questions array for feedback questionnaire
  const safeInterventionQuestions = Array.isArray(patientQuestionnairesStore.feedbackQuestions)
    ? patientQuestionnairesStore.feedbackQuestions
    : [];

  // Safe questions array for health questionnaire
  const safeHealthQuestions = Array.isArray(patientQuestionnairesStore.healthQuestions)
    ? patientQuestionnairesStore.healthQuestions
    : [];

  useEffect(() => {
    let alive = true;

    const run = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;

      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
        return;
      }

      if (fitbitStatus === 'error') setPageError(String(t('Fitbit connection failed.')));

      if (patientId) {
        patientFitbitStore.fetchStatus(patientId);
        patientFitbitStore.fetchSummary(patientId, 7);
        patientInterventionsStore.fetchPlan(patientId, i18n.language);
        patientQuestionnairesStore.checkInitialQuestionnaire(patientId);
        patientQuestionnairesStore.loadHealthQuestionnaire(patientId, i18n.language);
        patientVitalsStore.checkExists(patientId);
      }

      setLoading(false);
    };

    run();

    return () => {
      alive = false;
    };
  }, [navigate, fitbitStatus, t, patientId, i18n.language]);

  if (loading) return null;

  return (
    <Layout
      title={t('today')}
      subtitle={new Date().toLocaleDateString(t('locale'), { day: 'numeric', month: 'long' })}
    >
      <HomeIllustration className="absolute right-0 top-12 md:top-24" />

      <div className="mt-28 flex flex-col gap-2">
        <DailyInterventionCard
          date={today}
          title={t('Your recommendations')}
          badgeText={completionBadge}
          onOpenIntervention={(rec, date) =>
            navigate(
              `/patient-intervention/${rec.intervention_id}?date=${format(date, 'yyyy-MM-dd')}`
            )
          }
        />

        {pageError && <ErrorAlert message={pageError} onClose={() => setPageError('')} />}

        <ActivitySection
          loading={patientFitbitStore.connected === null || patientFitbitStore.summaryLoading}
          connected={Boolean(patientFitbitStore.connected)}
          stepsToday={patientFitbitStore.summary?.today?.steps}
          stepsGoal={patientFitbitStore.summary?.thresholds?.steps_goal}
          stepsHistoryData={stepsHistoryData}
          activeMinutes={patientFitbitStore.summary?.today?.active_minutes}
          activeMinutesGoal={patientFitbitStore.summary?.thresholds?.active_minutes_green}
          sleepMinutes={patientFitbitStore.summary?.today?.sleep_minutes}
          sleepMinutesGoal={patientFitbitStore.summary?.thresholds?.sleep_green_min}
          onOpenManualStepsEntry={() => setShowManualStepsEntry(true)}
        />

        <HealthCheckInSection
          loading={
            patientFitbitStore.connected === null ||
            patientFitbitStore.summaryLoading ||
            patientVitalsStore.loading
          }
          selectedDateLabel={selectedDateLabel}
          weightKg={patientFitbitStore.summary?.today?.weight_kg}
          bpSys={patientFitbitStore.summary?.today?.bp_sys}
          bpDia={patientFitbitStore.summary?.today?.bp_dia}
          onOpenWeightEntry={() => setShowManualWeightEntry(true)}
          onOpenBloodPressureEntry={() => setShowManualBloodPressureEntry(true)}
        />
      </div>

      <ManualStepsSheet
        open={showManualStepsEntry}
        dateLabel={selectedDateLongLabel}
        onClose={() => setShowManualStepsEntry(false)}
        onSubmit={async (steps) => {
          try {
            await patientFitbitStore.submitManualSteps(
              patientId,
              format(new Date(), 'yyyy-MM-dd'),
              steps
            );
          } catch {
            throw new Error(t('Failed to save steps. Please try again.'));
          }
        }}
      />

      <ManualWeightSheet
        open={showManualWeightEntry}
        dateLabel={selectedDateLongLabel}
        onClose={() => setShowManualWeightEntry(false)}
        onSubmit={async (weightKg) => {
          await patientVitalsStore.submit(patientId, { weight_kg: weightKg });
          if (patientVitalsStore.error) {
            throw new Error(t('failedSave'));
          }
          patientFitbitStore.fetchSummary(patientId, 7);
        }}
      />

      <ManualBloodPressureSheet
        open={showManualBloodPressureEntry}
        dateLabel={selectedDateLongLabel}
        onClose={() => setShowManualBloodPressureEntry(false)}
        onSubmit={async (bpSys, bpDia) => {
          await patientVitalsStore.submit(patientId, {
            bp_sys: bpSys,
            bp_dia: bpDia,
          });
          if (patientVitalsStore.error) {
            throw new Error(t('failedSave'));
          }
          patientFitbitStore.fetchSummary(patientId, 7);
        }}
      />

      {/* Intervention Feedback Popup */}
      {patientQuestionnairesStore.showFeedbackPopup && (
        <FeedbackPopup
          show
          interventionId={patientQuestionnairesStore.feedbackInterventionId || ''}
          questions={safeInterventionQuestions}
          date={patientQuestionnairesStore.feedbackDateKey}
          onClose={() => patientQuestionnairesStore.closeFeedback()}
        />
      )}

      {/* Health Questionnaire Popup (only on Patient home page) */}
      {patientQuestionnairesStore.showHealthPopup && (
        <FeedbackPopup
          show
          interventionId=""
          questions={safeHealthQuestions}
          date={format(patientUiStore.selectedDate, 'yyyy-MM-dd')}
          onClose={() => patientQuestionnairesStore.closeHealth()}
        />
      )}

      {/* Initial Patient Questionnaire (only on Patient home page) */}
      {patientQuestionnairesStore.showInitialPopup && (
        <PatientQuestionaire
          patient_id={{ _id: patientId } as PatientType}
          show
          handleClose={() => patientQuestionnairesStore.closeInitial()}
        />
      )}
    </Layout>
  );
});

export default PatientView;
