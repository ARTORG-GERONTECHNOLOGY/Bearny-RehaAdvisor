import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Row,
  Col,
  ToggleButtonGroup,
  ToggleButton,
  Badge,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { startOfWeek, addDays, format, isToday, isPast } from 'date-fns';
import { enUS, de, fr, it } from 'date-fns/locale';
import apiClient from '../../api/client';
import PatientInterventionPopUp from './PatientInterventionPopUp';
import FeedbackPopup from './FeedbackPopup';
import PatientQuestionaire from './PatientQuestionaire';
import { translateText } from '../../utils/translate';

const InterventionList = () => {
  const { t, i18n } = useTranslation();
  const [recommendations, setRecommendations] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [feedbackItem, setFeedbackItem] = useState(null);
  const [feedbackQuestions, setFeedbackQuestions] = useState([]);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [showHealthPopup, setShowHealthPopup] = useState(false);
  const [showPatientPopup, setShowPatientPopup] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const localeMap = { en: enUS, de, fr, it };
  const currentLocale = useMemo(() => localeMap[i18n.language] || enUS, [i18n.language]);

  useEffect(() => {
    fetchInterventions();
    getInitialQuestionnaire();
    getHealthQuestionnaire();
  }, []);

  const getHealthQuestionnaire = async () => {
    try {
      const { data: res } = await apiClient.get(
        `/patients/get-questions/Healthstatus/${localStorage.getItem('id')}/`
      );
      if (!res.questions?.length) return;

      const lang = i18n.language || 'en';
      const formatted = res.questions.map((q) => ({
        questionKey: q.questionKey,
        label: q.translations.find((t) => t.language === lang)?.text || q.translations[0]?.text || '',
        options: q.possibleAnswers || [],
        type: q.answerType,
      }));
      setFeedbackQuestions(formatted);
      setShowHealthPopup(true);
    } catch (err) {
      console.error('Error loading health questionnaire:', err);
    }
  };

  const getInitialQuestionnaire = async () => {
    try {
      const { data: res } = await apiClient.get(
        `users/${localStorage.getItem('id')}/initial-questionaire/`
      );
      setShowPatientPopup(res.data);
    } catch (err) {
      console.error('Error checking initial questionnaire:', err);
    }
  };

  const fetchInterventions = async () => {
    try {
      const { data } = await apiClient.get(
        `/patients/rehabilitation-plan/patient/${localStorage.getItem('id')}/`
      );
      const lang = i18n.language || 'en';

      const translated = await Promise.all(
        data.map(async (rec) => {
          const { translatedText: title, detectedSourceLanguage: titleLang } = await translateText(
            rec.intervention_title,
            lang
          );
          const { translatedText: desc, detectedSourceLanguage: descLang } = await translateText(
            rec.description || '',
            lang
          );
          return {
            ...rec,
            translated_title: title,
            translated_description: desc,
            titleLang,
            descLang,
          };
        })
      );
      setRecommendations(translated);
    } catch (err) {
      console.error('Failed to load interventions:', err);
    }
  };

  const handleMarkAsDone = async (interventionId: string) => {
    try {
      await apiClient.post('interventions/complete/', {
        patient_id: localStorage.getItem('id'),
        intervention_id: interventionId,
      });

      setRecommendations((prev) =>
        prev.map((rec) =>
          rec.intervention_id === interventionId
            ? {
                ...rec,
                completion_dates: [...rec.completion_dates, new Date().toISOString()],
              }
            : rec
        )
      );
      setFeedbackItem(interventionId);

      const { data: res } = await apiClient.get(
        `/patients/get-questions/Intervention/${localStorage.getItem('id')}/${interventionId}/`
      );

      const lang = i18n.language || 'en';
      const formatted = res.questions.map((q) => ({
        questionKey: q.questionKey,
        label: q.translations.find((t) => t.language === lang)?.text || q.translations[0]?.text || '',
        options: q.possibleAnswers || [],
        type: q.answerType,
      }));

      setFeedbackQuestions(formatted);
      setShowFeedbackPopup(true);
    } catch (err) {
      console.error('Error marking intervention as done:', err);
    }
  };

  const isCompletedOn = (rec, date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return rec.completion_dates?.some((d) => d.startsWith(dateStr));
  };

  const renderStatus = (rec, date) => {
    if (isToday(date)) {
      return isCompletedOn(rec, date) ? (
        <Badge bg="success">{t('Done')}</Badge>
      ) : (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleMarkAsDone(rec.intervention_id);
          }}
          title={t('Click when completed')}
        >
          {t('Ididit')}
        </Button>
      );
    }
    if (isPast(date)) {
      return isCompletedOn(rec, date) ? (
        <Badge bg="success">{t('Done')}</Badge>
      ) : (
        <Badge bg="secondary">{t('Missed')}</Badge>
      );
    }
    return <Badge bg="info">{t('Upcoming')}</Badge>;
  };

  const renderDayColumn = (date, isWeekView = false) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const filtered = recommendations.filter((rec) => rec.dates.some((d) => d.startsWith(dateKey)));

    return (
      <div
        key={dateKey}
        style={{
          flex: isWeekView ? '0 0 280px' : '1 0 100%',
          maxWidth: isWeekView ? '280px' : '100%',
          minWidth: isWeekView ? '260px' : '100%',
          padding: '0 0.5rem',
        }}
      >
        <h6 className="text-center">{format(date, 'EEE dd.MM', { locale: currentLocale })}</h6>
        {filtered.map((rec) => (
          <Card
            key={rec.intervention_id}
            className="mb-3"
            onClick={() => setSelectedItem(rec)}
            style={{ cursor: 'pointer', minHeight: 300 }}
          >
            {rec.preview_img && (
              <img
                src={rec.preview_img}
                alt="preview"
                style={{ width: '100%', height: 180, objectFit: 'cover' }}
              />
            )}
            <Card.Body>
              <Card.Title style={{ fontSize: '1rem' }}>
                {rec.translated_title}{' '}
                {rec.titleLang && (
                  <small className="text-muted">
                    ({t('Original language:')} {rec.titleLang})
                  </small>
                )}
              </Card.Title>
              <Card.Text style={{ fontSize: '0.9rem' }}>
                {rec.translated_description?.slice(0, 50)}...
                {rec.descLang && (
                  <span className="text-muted ms-2">
                    ({t('Original language:')} {rec.descLang})
                  </span>
                )}
                <div>
                  {t('Duration')}: {rec.duration} {t('minutes')}
                </div>
              </Card.Text>
            </Card.Body>
            <Card.Footer className="text-center">{renderStatus(rec, date)}</Card.Footer>
          </Card>
        ))}
      </div>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const weekNumber = format(start, 'I');
    return (
      <>
        <h5 className="text-center mb-3">
          {format(weekDates[0], 'dd.MM')} - {format(weekDates[6], 'dd.MM')} ({t('Week')} {weekNumber})
        </h5>
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            paddingBottom: '1rem',
            scrollbarWidth: 'thin',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {weekDates.map((date) => renderDayColumn(date, true))}
        </div>
      </>
    );
  };

  const renderDayView = () => (
    <>
      <h5 className="text-center mb-3">
        {format(selectedDate, 'EEEE, dd.MM.yyyy', { locale: currentLocale })}
      </h5>
      <Row className="g-3">{renderDayColumn(selectedDate)}</Row>
    </>
  );

  const handleNavigate = (dir: 'prev' | 'next') => {
    const delta = viewMode === 'day' ? 1 : 7;
    setSelectedDate((prev) => addDays(prev, dir === 'next' ? delta : -delta));
  };

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <Button onClick={() => handleNavigate('prev')} title={t('Go back')}>
          {t('Previous')}
        </Button>
        <ToggleButtonGroup type="radio" name="viewMode" value={viewMode} onChange={setViewMode}>
          <ToggleButton id="day" value="day" variant="outline-primary">
            {t('Day')}
          </ToggleButton>
          <ToggleButton id="week" value="week" variant="outline-primary">
            {t('Week')}
          </ToggleButton>
        </ToggleButtonGroup>
        <Button onClick={() => handleNavigate('next')} title={t('Go forward')}>
          {t('Next')}
        </Button>
      </div>

      {viewMode === 'week' ? renderWeekView() : renderDayView()}

      {selectedItem && !showFeedbackPopup && (
        <PatientInterventionPopUp
          show
          item={selectedItem}
          handleClose={() => setSelectedItem(null)}
        />
      )}
      {showFeedbackPopup && (
        <FeedbackPopup
          show
          interventionId={feedbackItem || ''}
          questions={feedbackQuestions}
          onClose={() => setShowFeedbackPopup(false)}
        />
      )}
      {showHealthPopup && (
        <FeedbackPopup
          show
          interventionId=""
          questions={feedbackQuestions}
          onClose={() => setShowHealthPopup(false)}
        />
      )}
      {showPatientPopup && (
        <PatientQuestionaire
          patient_id={localStorage.getItem('id')}
          show
          handleClose={() => setShowPatientPopup(false)}
        />
      )}
    </div>
  );
};

export default InterventionList;
