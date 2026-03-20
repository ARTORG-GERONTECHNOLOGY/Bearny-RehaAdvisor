// src/pages/PatientView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

import ErrorAlert from '@/components/common/ErrorAlert';
import Layout from '@/components/Layout';
import FitbitConnectButton from '@/components/PatientPage/FitbitStatus';
import ActivitySummary from '@/components/PatientPage/ActivitySummary';
import DailyVitalsPrompt from '@/components/PatientPage/DailyVitalsPrompt';
import DailyInterventionCard from '@/components/PatientPage/DailyInterventionCard';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import PatientQuestionaire from '@/components/PatientPage/PatientQuestionaire';
import authStore from '@/stores/authStore';
import { patientUiStore } from '@/stores/patientUiStore';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { useInterventions } from '@/hooks/useInterventions';
import type { PatientType } from '@/types';
import HomeIllustration from '@/assets/home_illustration.svg?react';
import { Badge } from '@/components/ui/badge';
import { ChartContainer } from '@/components/ui/chart';
import { RadialBar, BarChart, PolarAngleAxis, RadialBarChart } from 'recharts';
import CircleDashedFill from '@/assets/icons/circle-dashed-fill.svg?react';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const fitbitStatus = useMemo(() => searchParams.get('fitbit_status'), [searchParams]);
  const patientId = localStorage.getItem('id') || authStore.id || '';

  // Get today's interventions completion count for badge
  const today = useMemo(() => new Date(), []);
  const { completionCount } = useInterventions(today);
  const completionBadge =
    completionCount.total > 0 ? `${completionCount.completed}/${completionCount.total}` : undefined;

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

      // Load interventions and questionnaires if patient is authenticated
      if (patientId) {
        patientFitbitStore.fetchStatus(patientId);
        patientInterventionsStore.fetchPlan(patientId, i18n.language);
        patientQuestionnairesStore.checkInitialQuestionnaire(patientId);
        patientQuestionnairesStore.loadHealthQuestionnaire(patientId, i18n.language);
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
    <Layout>
      <div aria-label={t('Week range and current month')}>
        <h1 className="text-2xl font-bold p-0 m-0 text-zinc-800">{t('today')}</h1>
        <h2 className="text-lg p-0 m-0 text-zinc-600">
          {new Date().toLocaleDateString(t('locale'), { day: 'numeric', month: 'long' })}
        </h2>
      </div>

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

        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="flex p-2 pl-4 justify-between w-full">
            <div className="text-lg font-[500] text-zinc-500">{t('Todays Activity')}</div>
            {patientFitbitStore.connected && (
              <Badge className="font-medium text-zinc-500 rounded-full py-[6px] px-3 border-none bg-zinc-50 shadow-none">
                {t('Fitbit Connected')}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="p-4 border border-accent rounded-3xl">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('Steps')}</div>
                  {patientFitbitStore.connected && (
                    <div className="font-medium text-sm text-zinc-500">{t('Manual entry')}</div>
                  )}
                </div>
                <div className="w-8 h-8 shrink-0">
                  {patientFitbitStore.connected ? (
                    (() => {
                      // TODO: replace with real data
                      const stepsProgressPercent = 30;
                      const normalizedStepsProgress = Math.max(
                        0,
                        Math.min(100, stepsProgressPercent)
                      );

                      return (
                        <RadialBarChart
                          width={32}
                          height={32}
                          data={[{ name: 'Steps', value: normalizedStepsProgress }]}
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
                            fill="#16A34A"
                            background={{ fill: '#E4E4E7' }}
                            cornerRadius={999}
                          />
                        </RadialBarChart>
                      );
                    })()
                  ) : (
                    <>
                      <CircleCheckFill className="w-full h-full text-green-600" />
                      <CircleDashedFill className="w-full h-full text-zinc-200" />
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-end">
                <div className="flex-1">
                  <div className="font-bold text-[28px] text-zinc-900">
                    {patientFitbitStore.summary?.today?.steps || '--'}
                  </div>
                  <div className="font-medium text-sm text-zinc-500">
                    {t('Goal')}: {patientFitbitStore.summary?.thresholds?.steps_goal || '--'}
                  </div>
                </div>

                <div className="flex-1">
                  {/* TODO: Replace with real data from last week (like in PatientProcess steps chart) */}
                  <ChartContainer config={{}} className="w-full">
                    <BarChart className="text-zinc-200" />
                  </ChartContainer>
                </div>
              </div>
            </div>

            {patientFitbitStore.connected && (
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 p-4 border border-accent rounded-3xl">
                  <div className="flex justify-between">
                    <div className="font-bold text-lg text-zinc-800">{t('activeMinutes')}</div>
                    <div className="w-6 h-6 bg-accent" />
                  </div>
                  <div>
                    <div className="font-bold text-[28px] text-zinc-900">
                      {patientFitbitStore.summary?.today?.active_minutes || '--'}
                    </div>
                    <div className="font-medium text-sm text-zinc-500">
                      {t('Goal')}:{' '}
                      {patientFitbitStore.summary?.thresholds?.active_minutes_green || '--'}
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-4 border border-accent rounded-3xl">
                  <div className="flex justify-between">
                    <div className="font-bold text-lg text-zinc-800">{t('Sleep')}</div>
                    <div className="w-6 h-6 bg-accent" />
                  </div>
                  <div>
                    <div className="font-bold text-[28px] text-zinc-900">
                      {patientFitbitStore.summary?.today?.sleep_minutes || '--'}
                    </div>
                    <div className="font-medium text-sm text-zinc-500">
                      {t('Goal')}: {patientFitbitStore.summary?.thresholds?.sleep_green_min || '--'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!patientFitbitStore.connected && (
              <div className="p-4 rounded-3xl bg-zinc-100 flex gap-1 justify-between items-center">
                <div className="flex flex-col">
                  <div className="font-bold text-lg text-zinc-800">{t('Fitbit')}</div>
                  <div className="font-medium text-sm text-zinc-500">{t('Fitness Tracker')}</div>
                </div>
                <FitbitConnectButton />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="flex p-2 pl-4 justify-between w-full">
            <div className="text-lg font-[500] text-zinc-500">{t('CheckIn')}</div>
            <Badge className="font-medium text-zinc-500 rounded-full py-[6px] px-3 border-none bg-zinc-50 shadow-none">
              {0 / 2}
            </Badge>
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 p-4 border border-accent rounded-3xl">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('WeightLabel')}</div>
                  <div className="font-medium text-sm text-zinc-500">--:-- Uhr</div>
                </div>
                <div className="w-8 h-8 shrink-0">
                  <CircleCheckFill className="w-full h-full text-green-600" />
                  <CircleDashedFill className="w-full h-full text-zinc-200" />
                </div>
              </div>

              <div className="font-bold text-[28px] text-zinc-900">--</div>
            </div>

            <div className="flex-1 p-4 border border-accent rounded-3xl">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('Blood pressure')}</div>
                  <div className="font-medium text-sm text-zinc-500">--:-- Uhr</div>
                </div>
                <div className="w-8 h-8 shrink-0">
                  <CircleCheckFill className="w-full h-full text-green-600" />
                  <CircleDashedFill className="w-full h-full text-zinc-200" />
                </div>
              </div>

              <div className="font-bold text-[28px] text-zinc-900">--</div>
            </div>
          </div>
        </div>

        {/*
        <DailyVitalsPrompt />
        {pageError ? <ErrorAlert message={pageError} onClose={() => setPageError('')} /> : null}
        <ActivitySummary selectedDate={patientUiStore.selectedDate} />
        */}
      </div>

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
