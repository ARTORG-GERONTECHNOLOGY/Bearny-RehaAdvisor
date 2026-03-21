// src/pages/PatientView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, type Locale } from 'date-fns';
import { de, enUS, fr, it } from 'date-fns/locale';

import ErrorAlert from '@/components/common/ErrorAlert';
import Layout from '@/components/Layout';
import FitbitConnectButton from '@/components/PatientPage/FitbitStatus';
import ActivitySummary from '@/components/PatientPage/ActivitySummary';
import DailyInterventionCard from '@/components/PatientPage/DailyInterventionCard';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import PatientQuestionaire from '@/components/PatientPage/PatientQuestionaire';
import authStore from '@/stores/authStore';
import { patientUiStore } from '@/stores/patientUiStore';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { patientVitalsStore } from '@/stores/patientVitalsStore';
import { useInterventions } from '@/hooks/useInterventions';
import type { PatientType } from '@/types';
import HomeIllustration from '@/assets/home_illustration.svg?react';
import { Badge } from '@/components/ui/badge';
import { ChartContainer } from '@/components/ui/chart';
import { RadialBar, BarChart, PolarAngleAxis, RadialBarChart } from 'recharts';
import CircleDashedFill from '@/assets/icons/circle-dashed-fill.svg?react';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Alert } from 'react-bootstrap';
import { Skeleton } from '@/components/ui/skeleton';

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const localeMap: Record<string, Locale> = { en: enUS, de, fr, it };
  const locale = localeMap[i18n.language.slice(0, 2)] || enUS;

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const fitbitStatus = useMemo(() => searchParams.get('fitbit_status'), [searchParams]);
  const patientId = localStorage.getItem('id') || authStore.id || '';

  // Get today's interventions completion count for badge
  const today = useMemo(() => new Date(), []);
  const { completionCount } = useInterventions(today);
  const completionBadge =
    completionCount.total > 0 ? `${completionCount.completed}/${completionCount.total}` : undefined;

  const hasWeightEntry = patientFitbitStore.summary?.today?.weight_kg != null;
  const hasBloodPressureEntry =
    patientFitbitStore.summary?.today?.bp_sys != null &&
    patientFitbitStore.summary?.today?.bp_dia != null;
  const checkInEnteredCount = Number(hasWeightEntry) + Number(hasBloodPressureEntry);

  // State for manual entry modals
  const [showManualStepsEntry, setShowManualStepsEntry] = useState<boolean>(false);
  const [showManualWeightEntry, setShowManualWeightEntry] = useState<boolean>(false);
  const [showManualBloodPressureEntry, setShowManualBloodPressureEntry] = useState<boolean>(false);
  const [stepsInput, setStepsInput] = useState<string>('');
  const [weightInput, setWeightInput] = useState<string>('');
  const [bpSysInput, setBpSysInput] = useState<string>('');
  const [bpDiaInput, setBpDiaInput] = useState<string>('');

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

        {pageError && <ErrorAlert message={pageError} onClose={() => setPageError('')} />}

        {patientFitbitStore.connected === null ||
          (patientFitbitStore.summaryLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-56 w-full rounded-[40px]" />
              <Skeleton className="h-56 w-full rounded-[40px]" />
            </div>
          ))}

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



        <ActivitySummary selectedDate={patientUiStore.selectedDate} />



        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="flex p-2 pl-4 justify-between w-full">
            <div className="text-lg font-[500] text-zinc-500">{t('CheckIn')}</div>
            <Badge className="font-medium text-zinc-500 rounded-full py-[6px] px-3 border-none bg-zinc-50 shadow-none">
              {checkInEnteredCount} / 2
            </Badge>
          </div>

          <div className="flex gap-2 flex-wrap">
            <div
              role="button"
              className="flex-1 p-4 border border-accent rounded-3xl flex flex-col gap-4 justify-between"
              onClick={() => setShowManualWeightEntry(true)}
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('WeightLabel')}</div>
                  <div className="font-medium text-sm text-zinc-500">
                    {format(patientUiStore.selectedDate, 'dd.MM.yyyy', { locale })}
                  </div>
                </div>
                <div className="w-8 h-8 shrink-0">
                  {hasWeightEntry ? (
                    <CircleCheckFill className="w-full h-full text-green-600" />
                  ) : (
                    <CircleDashedFill className="w-full h-full text-zinc-200" />
                  )}
                </div>
              </div>

              <div className="font-bold text-[28px] text-zinc-900">
                {patientFitbitStore.summary?.today?.weight_kg || '--'} kg
              </div>
            </div>

            <div
              role="button"
              className="flex-1 p-4 border border-accent rounded-3xl flex flex-col gap-4 justify-between"
              onClick={() => setShowManualBloodPressureEntry(true)}
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('Blood pressure')}</div>
                  <div className="font-medium text-sm text-zinc-500">
                    {format(patientUiStore.selectedDate, 'dd.MM.yyyy', { locale })}
                  </div>
                </div>
                <div className="w-8 h-8 shrink-0">
                  {hasBloodPressureEntry ? (
                    <CircleCheckFill className="w-full h-full text-green-600" />
                  ) : (
                    <CircleDashedFill className="w-full h-full text-zinc-200" />
                  )}
                </div>
              </div>

              <div className="font-bold text-[28px] text-zinc-900">
                {patientFitbitStore.summary?.today?.bp_sys || '--'}
                <br />/{patientFitbitStore.summary?.today?.bp_dia || '--'} mmHg
              </div>
            </div>
          </div>
        </div>
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

      <Sheet
        open={showManualStepsEntry}
        onOpenChange={(open) => !open && setShowManualStepsEntry(false)}
      >
        <SheetContent side="bottom" className="flex flex-col min-h-[500px]">
          <SheetHeader>
            <SheetTitle>{t('Steps')}</SheetTitle>
            <SheetDescription>
              {format(patientUiStore.selectedDate, 'dd. MMMM yyyy', { locale })}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col gap-4 items-center justify-center">
            <Field className="w-fit flex flex-row items-center gap-3">
              <Input
                id="steps"
                type="number"
                placeholder="0"
                className="h-20 !w-[200px] rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
              />
              <FieldLabel htmlFor="steps" className="font-bold text-2xl text-zinc-300">
                {t('Steps')}
              </FieldLabel>
            </Field>
          </div>

          <SheetFooter>
            <Button
              onClick={() => {}}
              className="px-5 py-4 bg-[#00956C] shadow-none border-none rounded-full text-lg font-medium text-zinc-50"
            >
              {t('Save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={showManualWeightEntry}
        onOpenChange={(open) => !open && setShowManualWeightEntry(false)}
      >
        <SheetContent side="bottom" className="flex flex-col min-h-[500px]">
          <SheetHeader>
            <SheetTitle>{t('WeightLabel')}</SheetTitle>
            <SheetDescription>
              {format(patientUiStore.selectedDate, 'dd. MMMM yyyy', { locale })}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col gap-4 items-center justify-center">
            <Field className="w-fit flex flex-row items-center gap-3">
              <Input
                id="weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="25"
                max="400"
                placeholder="0"
                onChange={(e) => setWeightInput(e.target.value)}
                className="h-20 !w-40 rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
              />
              <FieldLabel htmlFor="weight" className="font-bold text-2xl text-zinc-300">
                Kg
              </FieldLabel>
            </Field>
          </div>

          {patientVitalsStore.error && (
            <Alert variant="danger">{t(patientVitalsStore.error)}</Alert>
          )}

          <SheetFooter>
            <Button
              onClick={async () => {
                if (patientVitalsStore.posting) return;
                if (weightInput.trim() === '' || isNaN(Number(weightInput))) return;
                await patientVitalsStore.submit(patientId, { weight_kg: Number(weightInput) });
                setShowManualWeightEntry(false);
              }}
              className="px-5 py-4 bg-[#00956C] shadow-none border-none rounded-full text-lg font-medium text-zinc-50"
            >
              {t('Save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={showManualBloodPressureEntry}
        onOpenChange={(open) => !open && setShowManualBloodPressureEntry(false)}
      >
        <SheetContent side="bottom" className="flex flex-col min-h-[500px]">
          <SheetHeader>
            <SheetTitle>{t('Blood pressure')}</SheetTitle>
            <SheetDescription>
              {format(patientUiStore.selectedDate, 'dd. MMMM yyyy', { locale })}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col gap-4 items-center justify-center">
            <Field className="w-fit gap-1">
              <FieldLabel htmlFor="systolic" className="font-medium text-lg text-zinc-600">
                SYS
              </FieldLabel>
              <Input
                id="systolic"
                type="number"
                inputMode="numeric"
                step="1"
                min="60"
                max="250"
                placeholder="120"
                onChange={(e) => setBpSysInput(e.target.value)}
                className="h-20 !w-[200px] rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
              />
              <FieldDescription className="text-sm text-zinc-500">
                {t('Upper blood pressure number (while heart beats).')}
              </FieldDescription>
            </Field>
            <Field className="w-fit gap-1">
              <FieldLabel htmlFor="diastolic" className="font-medium text-lg text-zinc-600">
                DIA
              </FieldLabel>
              <Input
                id="diastolic"
                type="number"
                inputMode="numeric"
                step="1"
                min="40"
                max="150"
                placeholder="80"
                onChange={(e) => setBpDiaInput(e.target.value)}
                className="h-20 !w-[200px] rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
              />
              <FieldDescription className="text-sm text-zinc-500">
                {t('Lower blood pressure number (while heart rests).')}
              </FieldDescription>
            </Field>
          </div>

          {patientVitalsStore.error && (
            <Alert variant="danger">{t(patientVitalsStore.error)}</Alert>
          )}

          <SheetFooter>
            <Button
              onClick={async () => {
                if (patientVitalsStore.posting) return;
                if (bpSysInput.trim() === '' || isNaN(Number(bpSysInput))) return;
                if (bpDiaInput.trim() === '' || isNaN(Number(bpDiaInput))) return;
                await patientVitalsStore.submit(patientId, {
                  bp_sys: Number(bpSysInput),
                  bp_dia: Number(bpDiaInput),
                });
                setShowManualBloodPressureEntry(false);
              }}
              className="px-5 py-4 bg-[#00956C] shadow-none border-none rounded-full text-lg font-medium text-zinc-50"
            >
              {t('Save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Layout>
  );
});

export default PatientView;
