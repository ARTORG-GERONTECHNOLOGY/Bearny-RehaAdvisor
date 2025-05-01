import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Row, Col, ToggleButtonGroup, ToggleButton, Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { startOfWeek, addDays, format, isToday, isPast } from 'date-fns';
import { enUS, de, fr, it } from 'date-fns/locale';

import apiClient from '../../api/client';
import PatientInterventionPopUp from './PatientInterventionPopUp';
import FeedbackPopup from './FeedbackPopup';

const InterventionList = () => {
  const { t, i18n } = useTranslation();
  const [recommendations, setRecommendations] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [feedbackItem, setFeedbackItem] = useState(null);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [feedbackQuestions, setFeedbackQuestions] = useState([]);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showHealthPopup, setShowHealthPopup] = useState(false);

  // ✅ Map language to date-fns locale
  const localeMap = {
    en: enUS,
    de: de,
    fr: fr,
    it: it,
  };

  const currentLocale = useMemo(() => localeMap[i18n.language] || enUS, [i18n.language]);

  useEffect(() => {
    fetchInterventions();
    getQuestionnaire();
  }, []);

  const getQuestionnaire = async () => {
    try {
      const { data: res } = await apiClient.get(
        `/patients/get-questions/Healthstatus/${localStorage.getItem('id')}/`
      );
      const language = i18n.language || 'en';
      if (!res.questions[0]) return;

      const formattedQuestions = res.questions.map((q) => ({
        questionKey: q.questionKey,
        label:
          q.translations.find((t) => t.language === language)?.text ||
          q.translations[0]?.text ||
          '',
        options: q.possibleAnswers || [],
        type: q.answerType,
      }));

      setFeedbackQuestions(formattedQuestions);
      setShowHealthPopup(true);
    } catch (error) {
      console.error('Error fetching health questionnaire:', error);
    }
  };

  const fetchInterventions = async () => {
    try {
      const { data } = await apiClient.get(
        `/patients/rehabilitation-plan/patient/${localStorage.getItem('id')}/`
      );
      setRecommendations(data || []);
    } catch (error) {
      console.error('Failed to load interventions', error);
    }
  };

  const handleMarkAsDone = async (interventionId) => {
    try {
      const res = await apiClient.post('interventions/complete/', {
        patient_id: localStorage.getItem('id'),
        intervention_id: interventionId,
      });

      if (res.status === 200) {
        const updated = recommendations.map((rec) =>
          rec.intervention_id === interventionId
            ? {
                ...rec,
                completion_dates: [...rec.completion_dates, new Date().toISOString()],
              }
            : rec
        );
        setRecommendations(updated);
        setFeedbackItem(interventionId);

        const { data: res } = await apiClient.get(
          `/patients/get-questions/Intervention/${localStorage.getItem('id')}/`
        );
        const language = i18n.language || 'en';

        const formattedQuestions = res.questions.map((q) => ({
          questionKey: q.questionKey,
          label:
            q.translations.find((t) => t.language === language)?.text ||
            q.translations[0]?.text ||
            '',
          options: q.possibleAnswers || [],
          type: q.answerType,
        }));

        setFeedbackQuestions(formattedQuestions);
        setShowFeedbackPopup(true);
      }
    } catch (error) {
      console.error('Error marking as done', error);
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
        >
          {t('Ididit')}
        </Button>
      );
    }
    if (isPast(date)) {
      return isCompletedOn ? (
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
      <Col
        key={dateKey}
        xs={12}
        sm={isWeekView ? 6 : 12}
        md={isWeekView ? 4 : 12}
        style={
          isWeekView
            ? { flex: '0 0 14.28%', maxWidth: '14.28%' }
            : { flex: '0 0 100%', maxWidth: '100%' }
        }
        className="mb-3"
      >
        <h6 className="text-center">{format(date, 'EEE dd.MM', { locale: currentLocale })}</h6>
        {filtered.map((rec) => (
          <Card
            key={rec.intervention_id}
            className="mb-3"
            onClick={() => setSelectedItem(rec)}
            style={{ cursor: 'pointer' }}
          >
            <Card.Body>
              <Card.Title>{rec.intervention_title}</Card.Title>
              <Card.Text className="text-muted">
                <div>
                  {rec.description.length > 50
                    ? `${rec.description.slice(0, 50)}...`
                    : rec.description}
                </div>
                <div>
                  {t('Duration')}: {rec.duration} {t('minutes')}
                </div>
              </Card.Text>
              {rec.preview_img && <img src={rec.preview_img} alt="" className="img-fluid" />}
            </Card.Body>
            <Card.Footer className="text-center">{renderStatus(rec, date)}</Card.Footer>
          </Card>
        ))}
      </Col>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const weekNumber = format(start, 'I');

    return (
      <>
        <h5 className="text-center mb-3">
          {format(weekDates[0], 'dd.MM', { locale: currentLocale })} -{' '}
          {format(weekDates[6], 'dd.MM', { locale: currentLocale })} ({t('Week')} {weekNumber})
        </h5>
        <Row className="g-3">{weekDates.map((date) => renderDayColumn(date, true))}</Row>
      </>
    );
  };

  const renderDayView = () => (
    <>
      <h5 className="text-center mb-3">
        {format(selectedDate, 'EEEE, dd.MM.yyyy', { locale: currentLocale })}
      </h5>
      <Row className="g-3">{renderDayColumn(selectedDate, false)}</Row>
    </>
  );

  const handleNavigate = (direction) => {
    const modifier = direction === 'next' ? 1 : -1;
    const delta = viewMode === 'day' ? 1 : 7;
    setSelectedDate(addDays(selectedDate, delta * modifier));
  };

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <Button onClick={() => handleNavigate('prev')}>{t('Previous')}</Button>
        <ToggleButtonGroup type="radio" name="viewMode" value={viewMode} onChange={setViewMode}>
          <ToggleButton id="day" value="day" variant="outline-primary">
            {t('Day')}
          </ToggleButton>
          <ToggleButton id="week" value="week" variant="outline-primary">
            {t('Week')}
          </ToggleButton>
        </ToggleButtonGroup>
        <Button onClick={() => handleNavigate('next')}>{t('Next')}</Button>
      </div>

      {viewMode === 'week' ? renderWeekView() : renderDayView()}

      {selectedItem && !showFeedbackPopup && (
        <PatientInterventionPopUp
          show={true}
          item={selectedItem}
          handleClose={() => setSelectedItem(null)}
        />
      )}
      {showFeedbackPopup && (
        <FeedbackPopup
          show={true}
          interventionId={feedbackItem || ''}
          questions={feedbackQuestions || []}
          onClose={() => setShowFeedbackPopup(false)}
        />
      )}
      {showHealthPopup && (
        <FeedbackPopup
          show={true}
          interventionId={''}
          questions={feedbackQuestions}
          onClose={() => setShowHealthPopup(false)}
        />
      )}
    </div>
  );
};

export default InterventionList;
