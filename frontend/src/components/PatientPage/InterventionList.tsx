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

type Rec = {
  intervention_id: string;
  intervention_title: string;
  description?: string;
  dates: string[];                 // ISO strings
  duration?: number;
  preview_img?: string;
  completion_dates?: string[];     // ISO strings when completed
  translated_title?: string;
  translated_description?: string;
  titleLang?: string;
  descLang?: string;
};

const InterventionList = () => {
  const { t, i18n } = useTranslation();
  const [recommendations, setRecommendations] = useState<Rec[]>([]);
  const [selectedItem, setSelectedItem] = useState<Rec | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<string | null>(null);
  const [feedbackQuestions, setFeedbackQuestions] = useState<any[]>([]);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [showHealthPopup, setShowHealthPopup] = useState(false);
  const [showPatientPopup, setShowPatientPopup] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const localeMap: Record<string, Locale> = { en: enUS, de, fr, it };
  const currentLocale = useMemo(
    () => localeMap[(i18n.language || 'en').slice(0,2)] || enUS,
    [i18n.language]
  );

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

      const lang = (i18n.language || 'en').slice(0,2);
      const formatted = res.questions.map((q: any) => ({
        questionKey: q.questionKey,
        label: q.translations.find((t: any) => t.language === lang)?.text || q.translations[0]?.text || '',
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
      const lang = (i18n.language || 'en').slice(0,2);

      const translated: Rec[] = await Promise.all(
        (data || []).map(async (rec: Rec) => {
          const t1 = await translateText(rec.intervention_title, lang);
          const t2 = await translateText(rec.description || '', lang);
          return {
            ...rec,
            translated_title: t1.translatedText,
            translated_description: t2.translatedText,
            titleLang: t1.detectedSourceLanguage,
            descLang: t2.detectedSourceLanguage,
          };
        })
      );
      setRecommendations(translated);
    } catch (err) {
      console.error('Failed to load interventions:', err);
    }
  };

  const isCompletedOn = (rec: Rec, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return (rec.completion_dates || []).some((d) => d.startsWith(dateStr));
  };

  /** NEW: toggle completion (mark done / unmark) for a specific date */
  const handleToggleCompleted = async (rec: Rec, date: Date) => {
    const patientId = localStorage.getItem('id');
    if (!patientId) return;

    const dateKey = format(date, 'yyyy-MM-dd');
    const already = isCompletedOn(rec, date);

    try {
      if (!already) {
        // mark done
        await apiClient.post('interventions/complete/', {
          patient_id: patientId,
          intervention_id: rec.intervention_id,
          date: dateKey, // optional (BE can default to today)
        });

        // optimistic UI update
        setRecommendations((prev) =>
          prev.map((r) =>
            r.intervention_id === rec.intervention_id
              ? { ...r, completion_dates: [...(r.completion_dates || []), new Date().toISOString()] }
              : r
          )
        );

        // only ask feedback when marking TODAY (keep your prior behavior)
        if (isToday(date)) {
          setFeedbackItem(rec.intervention_id);
          const { data: res } = await apiClient.get(
            `/patients/get-questions/Intervention/${patientId}/${rec.intervention_id}/`
          );

          const lang = (i18n.language || 'en').slice(0,2);
          const formatted = res.questions.map((q: any) => ({
            questionKey: q.questionKey,
            label: q.translations.find((t: any) => t.language === lang)?.text || q.translations[0]?.text || '',
            options: q.possibleAnswers || [],
            type: q.answerType,
          }));

          setFeedbackQuestions(formatted);
          setShowFeedbackPopup(true);
        }
      } else {
        // unmark (NEW)
        await apiClient.post('interventions/uncomplete/', {
          patient_id: patientId,
          intervention_id: rec.intervention_id,
          date: dateKey,
        });

        // optimistic UI update: remove any completion entry for that calendar day
        setRecommendations((prev) =>
          prev.map((r) =>
            r.intervention_id === rec.intervention_id
              ? {
                  ...r,
                  completion_dates: (r.completion_dates || []).filter(
                    (d) => !d.startsWith(dateKey)
                  ),
                }
              : r
          )
        );
      }
    } catch (err) {
      console.error('Toggle completed failed:', err);
    }
  };

  const renderStatus = (rec: Rec, date: Date) => {
    const completed = isCompletedOn(rec, date);

    if (isToday(date)) {
      return completed ? (
        <div className="d-flex justify-content-center gap-2">
          <Badge bg="success">{t('Done')}</Badge>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleCompleted(rec, date);
            }}
            title={t('Uncheck / undo')}
          >
            {t('Undo')}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleCompleted(rec, date);
          }}
          title={t('Click when completed')}
        >
          {t('Ididit')}
        </Button>
      );
    }

    if (isPast(date)) {
      return completed ? (
        <Badge bg="success">{t('Done')}</Badge>
      ) : (
        <Badge bg="secondary">{t('Missed')}</Badge>
      );
    }

    return completed ? (
      <Badge bg="success">{t('Done')}</Badge>
    ) : (
      <Badge bg="info">{t('Upcoming')}</Badge>
    );
  };

  /** Sort within a day: not-done first, then done at the bottom. */
  const sortDayItems = (items: Rec[], date: Date) => {
    return [...items].sort((a, b) => {
      const aDone = isCompletedOn(a, date);
      const bDone = isCompletedOn(b, date);
      if (aDone === bDone) {
        // stable-ish secondary by title
        const at = a.translated_title || a.intervention_title || '';
        const bt = b.translated_title || b.intervention_title || '';
        return at.localeCompare(bt);
      }
      return aDone ? 1 : -1; // done → after not-done
    });
  };

  const renderDayColumn = (date: Date, isWeekView = false) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const listForDay = recommendations.filter((rec) =>
      (rec.dates || []).some((d) => d.startsWith(dateKey))
    );
    const sorted = sortDayItems(listForDay, date);

    return (
      <div key={dateKey} className="day-col">
        <h6 className="text-center mb-2">{format(date, 'EEE dd.MM', { locale: currentLocale })}</h6>
        {sorted.map((rec) => {
          const completed = isCompletedOn(rec, date);
          return (
            <Card
              key={`${rec.intervention_id}-${dateKey}`}
              className="mb-3 day-card"
              onClick={() => setSelectedItem(rec)}
              style={{
                cursor: 'pointer',
                minHeight: 300,
                filter: completed ? 'grayscale(1)' : undefined,
                opacity: completed ? 0.6 : 1,
              }}
            >
              {rec.preview_img && (
                <img
                  src={rec.preview_img}
                  alt="preview"
                  style={{ width: '100%', height: 160, objectFit: 'cover' }}
                />
              )}
              <Card.Body>
                <Card.Title style={{ fontSize: '1rem' }}>
                  {rec.translated_title || rec.intervention_title}{' '}
                  {rec.titleLang && (
                    <small className="text-muted">
                      ({t('Original language:')} {rec.titleLang})
                    </small>
                  )}
                </Card.Title>
                <Card.Text style={{ fontSize: '0.9rem' }}>
                  {(rec.translated_description || '').slice(0, 80)}{(rec.translated_description || '').length > 80 ? '…' : ''}
                  {rec.descLang && (
                    <span className="text-muted ms-2">
                      ({t('Original language:')} {rec.descLang})
                    </span>
                  )}
                  {typeof rec.duration === 'number' && (
                    <div className="mt-1">
                      {t('Duration')}: {rec.duration} {t('minutes')}
                    </div>
                  )}
                </Card.Text>
              </Card.Body>
              <Card.Footer className="text-center">{renderStatus(rec, date)}</Card.Footer>
            </Card>
          );
        })}
      </div>
    );
  };

  /** NEW: Week view as a 7-column grid (no horizontal scroll) */
  const renderWeekView = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const weekNumber = format(start, 'I');
    return (
      <>
        <h5 className="text-center mb-3">
          {format(weekDates[0], 'dd.MM')} – {format(weekDates[6], 'dd.MM')} ({t('Week')} {weekNumber})
        </h5>
        <div className="week-grid">
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
      <Row className="g-3">
        <Col>{renderDayColumn(selectedDate)}</Col>
      </Row>
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
          patient_id={localStorage.getItem('id') as any}
          show
          handleClose={() => setShowPatientPopup(false)}
        />
      )}

      {/* Inline styles to keep this self-contained */}
      <style>{`
        /* Week view: always 7 equal columns, no horizontal scrolling */
        .week-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 12px;
        }

        .day-col {
          min-width: 0; /* important for grid children */
        }

        /* Make cards compact enough for 7 columns */
        .day-card img {
          border-top-left-radius: .375rem;
          border-top-right-radius: .375rem;
        }

        @media (max-width: 992px) {
          .week-grid {
            gap: 8px;
          }
          .day-card {
            min-height: 260px;
          }
          .day-card img {
            height: 120px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default InterventionList;
