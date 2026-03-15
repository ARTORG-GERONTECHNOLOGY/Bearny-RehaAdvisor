import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import DailyInterventionCard from '@/components/PatientPage/DailyInterventionCard';
import { patientUiStore } from '@/stores/patientUiStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { startOfWeek, addDays, format, isToday, endOfWeek, type Locale } from 'date-fns';
import { de, enUS, fr, it } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import authStore from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';

type DayFilter = 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6;

const PatientPlan: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');

  const patientId = localStorage.getItem('id') || authStore.id || '';

  const localeMap: Record<string, Locale> = { en: enUS, de, fr, it };
  const locale = localeMap[i18n.language.slice(0, 2)] || enUS;

  const start = startOfWeek(patientUiStore.selectedDate, { weekStartsOn: 1 });
  const end = endOfWeek(patientUiStore.selectedDate, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const filteredDates = dayFilter === 'all' ? weekDates : [weekDates[dayFilter]];

  const dayLabels = [
    { value: 'all' as const, label: t('Whole Week') },
    { value: 0 as const, label: t('Mon') },
    { value: 1 as const, label: t('Tue') },
    { value: 2 as const, label: t('Wed') },
    { value: 3 as const, label: t('Thu') },
    { value: 4 as const, label: t('Fri') },
    { value: 5 as const, label: t('Sat') },
    { value: 6 as const, label: t('Sun') },
  ];

  // Safe questions array for feedback questionnaire
  const safeInterventionQuestions = Array.isArray(patientQuestionnairesStore.feedbackQuestions)
    ? patientQuestionnairesStore.feedbackQuestions
    : [];

  // Fetch interventions on mount
  useEffect(() => {
    if (patientId) {
      patientInterventionsStore.fetchPlan(patientId, i18n.language);
    }
  }, [patientId, i18n.language]);

  // Check authentication
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

  return (
    <Layout>
      <div aria-label={t('Week range and current month')}>
        <h1 className="text-2xl font-bold p-0 m-0 text-zinc-800">
          {format(start, 'dd.MM.')} - {format(end, 'dd.MM.')}
        </h1>
        <h2 className="text-lg p-0 m-0 text-zinc-600">
          {format(patientUiStore.selectedDate, 'MMMM yyyy', { locale })}
        </h2>
      </div>

      {/* Day Filter */}
      <div
        className="mt-8 flex gap-1 no-scrollbar overflow-y-auto"
        role="group"
        aria-label={t('Filter by day')}
      >
        {dayLabels.map(({ value, label }) => (
          <Badge
            key={value}
            onClick={() => setDayFilter(value)}
            className={`font-medium rounded-full py-[10px] px-4 border-none shadow-none text-nowrap ${
              dayFilter === value ? 'bg-white text-zinc-800' : 'bg-zinc-50 text-zinc-400'
            }`}
            role="button"
            aria-pressed={dayFilter === value}
            aria-label={value === 'all' ? t('Show all days') : t('Show {{day}}', { day: label })}
          >
            {label}
          </Badge>
        ))}
      </div>

      <div
        className="flex flex-col gap-2 mt-6 md:grid md:grid-cols-2 md:items-start"
        role="region"
        aria-label={t('Weekly interventions')}
      >
        {filteredDates.map((date) => (
          <DailyInterventionCard
            key={format(date, 'yyyy-MM-dd')}
            date={date}
            locale={locale}
            badgeText={isToday(date) ? t('Today') : undefined}
            onOpenIntervention={(rec, openDate) =>
              navigate(
                `/patient-intervention/${rec.intervention_id}?date=${format(openDate, 'yyyy-MM-dd')}`
              )
            }
          />
        ))}
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
    </Layout>
  );
});

export default PatientPlan;
