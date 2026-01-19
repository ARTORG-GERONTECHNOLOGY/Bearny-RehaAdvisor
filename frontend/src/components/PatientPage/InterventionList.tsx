// src/components/PatientPage/InterventionList.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import {
  startOfWeek,
  addDays,
  format,
  isToday,
  isPast,
  endOfWeek,
} from 'date-fns';
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
  dates: string[];
  duration?: number;
  preview_img?: string;
  completion_dates?: string[];
  translated_title?: string;
  translated_description?: string;
  titleLang?: string;
  descLang?: string;
  notes?: string;
};

type Props = {
  selectedDate: Date;
  onDateChange: (d: Date) => void;
};

const InterventionList: React.FC<Props> = ({ selectedDate, onDateChange }) => {
  const { t, i18n } = useTranslation();
  const [recommendations, setRecommendations] = useState<Rec[]>([]);
  const [selectedItem, setSelectedItem] = useState<Rec | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<string | null>(null);
  const [feedbackQuestions, setFeedbackQuestions] = useState<any[]>([]);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [showHealthPopup, setShowHealthPopup] = useState(false);
  const [showPatientPopup, setShowPatientPopup] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  // Error handling
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const localeMap: Record<string, any> = { en: enUS, de, fr, it };
  const currentLocale = useMemo(
    () => localeMap[(i18n.language || 'en').slice(0, 2)] || enUS,
    [i18n.language]
  );

  useEffect(() => {
    fetchInterventions();
    getInitialQuestionnaire();
    getHealthQuestionnaire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getHealthQuestionnaire = async () => {
    try {
      const { data: res } = await apiClient.get(
        `/patients/get-questions/Healthstatus/${localStorage.getItem('id')}/`
      );
      if (!res.questions?.length) return;

      const lang = (i18n.language || 'en').slice(0, 2);
      const formatted = res.questions.map((q: any) => ({
        questionKey: q.questionKey,
        label:
          q.translations.find((tt: any) => tt.language === lang)?.text ||
          q.translations[0]?.text ||
          '',
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

      const lang = (i18n.language || 'en').slice(0, 2);

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
      setError(null);
      setErrorDetails(null);
      setShowErrorDetails(false);
    } catch (err: any) {
      console.error('Failed to load interventions:', err);
      const backend = err?.response?.data;
      setError(backend?.error || err?.message || t('An unexpected error occurred.'));
      setErrorDetails(backend?.details || null);
    }
  };

  const isCompletedOn = (rec: Rec, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return (rec.completion_dates || []).some((d) => String(d).startsWith(dateStr));
  };

  // ✅ ensure FE state contains only ONE entry per calendar day
  const upsertCompletionDate = (dates: string[] | undefined, dateKey: string) => {
    const base = Array.isArray(dates) ? dates : [];
    const withoutDay = base.filter((d) => !String(d).startsWith(dateKey));
    // canonical day marker (stable + unique)
    const canonical = `${dateKey}T00:00:00.000Z`;
    return [...withoutDay, canonical];
  };

  const handleToggleCompleted = async (rec: Rec, date: Date) => {
    const patientId = localStorage.getItem('id');
    if (!patientId) return;

    const dateKey = format(date, 'yyyy-MM-dd');
    const already = isCompletedOn(rec, date);

    try {
      if (!already) {
        await apiClient.post('interventions/complete/', {
          patient_id: patientId,
          intervention_id: rec.intervention_id,
          date: dateKey,
        });

        setRecommendations((prev) =>
          prev.map((r) =>
            r.intervention_id === rec.intervention_id
              ? {
                  ...r,
                  completion_dates: upsertCompletionDate(r.completion_dates, dateKey),
                }
              : r
          )
        );

        if (isToday(date)) {
          setFeedbackItem(rec.intervention_id);
          const { data: res } = await apiClient.get(
            `/patients/get-questions/Intervention/${patientId}/${rec.intervention_id}/`
          );

          const lang = (i18n.language || 'en').slice(0, 2);
          const formatted = res.questions.map((q: any) => ({
            questionKey: q.questionKey,
            label:
              q.translations.find((tt: any) => tt.language === lang)?.text ||
              q.translations[0]?.text ||
              '',
            options: q.possibleAnswers || [],
            type: q.answerType,
          }));

          setFeedbackQuestions(formatted);
          setShowFeedbackPopup(true);
        }
      } else {
        await apiClient.post('interventions/uncomplete/', {
          patient_id: patientId,
          intervention_id: rec.intervention_id,
          date: dateKey,
        });

        setRecommendations((prev) =>
          prev.map((r) =>
            r.intervention_id === rec.intervention_id
              ? {
                  ...r,
                  completion_dates: (r.completion_dates || []).filter(
                    (d) => !String(d).startsWith(dateKey)
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
        <div className="d-flex justify-content-center">
          <Button
            className="action-btn"
            variant="outline-secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleCompleted(rec, date);
            }}
            aria-label={t('Undo')}
            title={t('Uncheck / undo')}
          >
            {t('Undo')}
          </Button>
        </div>
      ) : (
        <Button
          className="action-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleCompleted(rec, date);
          }}
          aria-label={t('Ididit')}
          title={t('Click when completed')}
        >
          {t('Ididit')}
        </Button>
      );
    }

    if (isPast(date) && !isToday(date)) {
      return completed ? (
        <div className="d-flex justify-content-center">
          <Button
            className="action-btn"
            variant="outline-secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleCompleted(rec, date);
            }}
            aria-label={t('Undo')}
            title={t('Uncheck / undo')}
          >
            {t('Undo')}
          </Button>
        </div>
      ) : (
        <Button
          className="action-btn"
          variant="outline-primary"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleCompleted(rec, date);
          }}
          aria-label={t('Ididit')}
          title={t('Mark as completed')}
        >
          {t('Ididit')}
        </Button>
      );
    }

    return completed ? (
      <Badge bg="success">{t('Done')}</Badge>
    ) : (
      <Badge bg="info">{t('Upcoming')}</Badge>
    );
  };

  const sortDayItems = (items: Rec[], date: Date) => {
    return [...items].sort((a, b) => {
      const aDone = isCompletedOn(a, date);
      const bDone = isCompletedOn(b, date);
      if (aDone === bDone) {
        const at = a.translated_title || a.intervention_title || '';
        const bt = b.translated_title || b.intervention_title || '';
        return at.localeCompare(bt);
      }
      return aDone ? 1 : -1;
    });
  };

  const getTimeForDay = (rec: Rec, dateKey: string) => {
    const matchingDateStr = (rec.dates || []).find((d) => String(d).startsWith(dateKey));
    if (!matchingDateStr) return '';
    const dt = new Date(matchingDateStr);
    if (Number.isNaN(dt.getTime())) return '';
    return format(dt, 'HH:mm');
  };

  const openRec = useCallback((rec: Rec) => setSelectedItem(rec), []);
  const onCardKeyDown = (e: React.KeyboardEvent, rec: Rec) => {
    // Make cards behave like accessible buttons
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRec(rec);
    }
  };

  const renderDayColumn = (date: Date, isWeekView = false) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const listForDay = recommendations.filter((rec) =>
      (rec.dates || []).some((d) => String(d).startsWith(dateKey))
    );
    const sorted = sortDayItems(listForDay, date);
    const today = isToday(date);

    const dayLabel = format(date, 'EEE dd.MM', { locale: currentLocale });
    const dayFullLabel = format(date, 'EEEE, dd.MM.yyyy', { locale: currentLocale });

    return (
      <section
        key={dateKey}
        className={`day-col ${today ? 'is-today' : ''}`}
        aria-label={isWeekView ? dayFullLabel : undefined}
      >
        {isWeekView && (
          <div className="day-col-header">
            <button
              type="button"
              className={`day-heading-btn ${today ? 'today' : ''}`}
              onClick={() => {
                onDateChange(date);
                setViewMode('day');
              }}
              aria-label={t('Open day view for {{day}}', { day: dayFullLabel })}
              aria-current={today ? 'date' : undefined}
            >
              <span className="day-heading-text">{dayLabel}</span>
            </button>
          </div>
        )}

        {sorted.length === 0 && isWeekView && (
          <div className="empty-day" aria-label={t('No interventions')}>
            <span className="text-muted small">{t('No interventions')}</span>
          </div>
        )}

        {sorted.map((rec) => {
          const completed = isCompletedOn(rec, date);
          const title = rec.translated_title || rec.intervention_title;
          const timeStr = getTimeForDay(rec, dateKey);

          // WEEK VIEW CARD (compact)
          if (isWeekView) {
            const aria = `${title}. ${t('Time')}: ${timeStr || t('Unknown')}. ${
              typeof rec.duration === 'number' ? `${t('Duration')}: ${rec.duration} ${t('min')}.` : ''
            } ${completed ? t('Done') : ''}`;

            return (
              <Card
                key={`${rec.intervention_id}-${dateKey}-compact`}
                className={`mb-2 day-card compact ${completed ? 'is-completed' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => openRec(rec)}
                onKeyDown={(e) => onCardKeyDown(e, rec)}
                aria-label={aria}
                title={title}
              >
                {completed && (
                  <div className="done-strip" aria-hidden="true">
                    <span className="check" aria-hidden="true">
                      ✓
                    </span>
                  </div>
                )}

                <div className={`card-inner ${completed ? 'is-completed' : ''}`}>
                  <Card.Body className="py-2 px-2">
                    <div className="text-truncate fw-semibold small">{title}</div>

                    <div className="d-flex justify-content-between align-items-center mt-2 small text-muted">
                      <span className="meta-inline">
                        <span className="meta-icon" aria-hidden="true">
                          🕒
                        </span>
                        <span aria-label={t('Time')}>{timeStr || '—'}</span>
                      </span>

                      {typeof rec.duration === 'number' && (
                        <span className="meta-inline">
                          <span className="meta-icon" aria-hidden="true">
                            ⏱️
                          </span>
                          <span aria-label={t('Duration')}>{rec.duration}</span> {t('min')}
                        </span>
                      )}
                    </div>

                    {/* SR-only status */}
                    <span className="sr-only">
                      {completed ? t('Done') : isPast(date) ? t('Missed') : t('Upcoming')}
                    </span>
                  </Card.Body>
                </div>
              </Card>
            );
          }

          // DAY VIEW CARD (full)
          return (
            <Card
              key={`${rec.intervention_id}-${dateKey}`}
              className="mb-3 day-card"
              role="button"
              tabIndex={0}
              onClick={() => openRec(rec)}
              onKeyDown={(e) => onCardKeyDown(e, rec)}
              style={{ cursor: 'pointer', minHeight: 300 }}
              aria-label={`${title}. ${dayFullLabel}.`}
            >
              {completed && (
                <div className="done-strip" aria-live="polite">
                  <span className="check" aria-hidden="true">
                    ✓
                  </span>{' '}
                  {isToday(date) ? t('Completed today') : t('Completed')}
                </div>
              )}

              <div className={`card-inner ${completed ? 'is-completed' : ''}`}>
                <div className="preview-slot">
                  {rec.preview_img ? (
                    <img src={rec.preview_img} alt={t('Preview') || 'Preview'} className="preview-img" />
                  ) : (
                    <div className="preview-placeholder">{t('preview')}</div>
                  )}
                </div>

                <Card.Body>
                  <Card.Title style={{ fontSize: '1rem' }}>
                    {title}{' '}
                    {rec.titleLang && (
                      <small className="text-muted">
                        ({t('Original language:')} {rec.titleLang})
                      </small>
                    )}
                  </Card.Title>

                  <Card.Text style={{ fontSize: '0.9rem' }}>
                    {(rec.translated_description || '').slice(0, 80)}
                    {(rec.translated_description || '').length > 80 ? '…' : ''}
                    {rec.descLang && (
                      <span className="text-muted ms-2">
                        ({t('Original language:')} {rec.descLang})
                      </span>
                    )}
                  </Card.Text>
                </Card.Body>

                <Card.Footer className="d-flex justify-content-between align-items-center px-2 py-2 footer-meta">
                  <div className="d-flex align-items-center gap-2 text-muted small">
                    <span className="meta-inline">
                      <span className="meta-icon" aria-hidden="true">
                        🕒
                      </span>
                      <span aria-label={t('Time')}>{timeStr || '—'}</span>
                    </span>
                  </div>

                  <div>{renderStatus(rec, date)}</div>

                  {typeof rec.duration === 'number' ? (
                    <div className="d-flex align-items-center gap-2 text-muted small">
                      <span className="meta-inline">
                        <span className="meta-icon" aria-hidden="true">
                          ⏱️
                        </span>
                        <span aria-label={t('Duration')}>{rec.duration}</span> {t('min')}
                      </span>
                    </div>
                  ) : (
                    <div style={{ width: '40px' }} />
                  )}
                </Card.Footer>
              </div>
            </Card>
          );
        })}
      </section>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const weekNumber = format(start, 'I');

    return (
      <>
        <h5 className="text-center mb-3 week-title" aria-live="polite">
          {format(start, 'dd.MM', { locale: currentLocale })} – {format(end, 'dd.MM', { locale: currentLocale })}{' '}
          ({t('Week')} {weekNumber})
        </h5>

        <div className="week-grid" role="grid" aria-label={t('Weekly interventions grid')}>
          {weekDates.map((date) => (
            <div key={format(date, 'yyyy-MM-dd')} role="gridcell" className="week-grid-cell">
              {renderDayColumn(date, true)}
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderDayView = () => (
    <>
      <h5 className="text-center mb-3" aria-live="polite">
        {format(selectedDate, 'EEEE, dd.MM.yyyy', { locale: currentLocale })}
      </h5>
      <Row className="g-3">
        <Col>{renderDayColumn(selectedDate)}</Col>
      </Row>
    </>
  );

  const handleNavigate = (dir: 'prev' | 'next') => {
    const delta = viewMode === 'day' ? 1 : 7;
    onDateChange(addDays(selectedDate, dir === 'next' ? delta : -delta));
  };

  return (
    <div className="p-3">
      {/* ERROR BANNER */}
      {error && (
        <div className="alert alert-danger mb-3" role="alert" aria-live="assertive">
          <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
            <span>{error}</span>
            {errorDetails && (
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={() => setShowErrorDetails((prev) => !prev)}
                aria-expanded={showErrorDetails}
              >
                {showErrorDetails ? t('Hide details') : t('Show details')}
              </button>
            )}
          </div>

          {showErrorDetails && errorDetails && (
            <pre className="bg-light p-2 mt-2 border rounded small" style={{ whiteSpace: 'pre-wrap' }}>
              {errorDetails}
            </pre>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <Button onClick={() => handleNavigate('prev')} aria-label={t('Previous')} title={t('Go back')}>
          {t('Previous')}
        </Button>

        <ToggleButtonGroup
          type="radio"
          name="viewMode"
          value={viewMode}
          onChange={setViewMode}
          aria-label={t('Change view mode')}
        >
          <ToggleButton id="day" value="day" variant="outline-primary" aria-label={t('Day view')}>
            {t('Day')}
          </ToggleButton>
          <ToggleButton id="week" value="week" variant="outline-primary" aria-label={t('Week view')}>
            {t('Week')}
          </ToggleButton>
        </ToggleButtonGroup>

        <Button onClick={() => handleNavigate('next')} aria-label={t('Next')} title={t('Go forward')}>
          {t('Next')}
        </Button>
      </div>

      {viewMode === 'week' ? renderWeekView() : renderDayView()}

      {/* Popups */}
      {selectedItem && !showFeedbackPopup && (
        <PatientInterventionPopUp show item={selectedItem} handleClose={() => setSelectedItem(null)} />
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
        <FeedbackPopup show interventionId="" questions={feedbackQuestions} onClose={() => setShowHealthPopup(false)} />
      )}

      {showPatientPopup && (
        <PatientQuestionaire
          patient_id={localStorage.getItem('id') as any}
          show
          handleClose={() => setShowPatientPopup(false)}
        />
      )}

      <style>{`
        /* Screen-reader only utility */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* WEEK GRID — responsive + standardized */
        .week-title { font-weight: 700; }
        .week-grid {
          display: grid;
          gap: 12px;
          align-items: start;
        }

        /* Large screens: 7 columns */
        @media (min-width: 992px) {
          .week-grid {
            grid-template-columns: repeat(7, minmax(0, 1fr));
          }
        }

        /* Medium: 3 columns */
        @media (min-width: 576px) and (max-width: 991.98px) {
          .week-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        /* Small: horizontal scroll with snap */
        @media (max-width: 575.98px) {
          .week-grid {
            grid-auto-flow: column;
            grid-auto-columns: minmax(240px, 80vw);
            overflow-x: auto;
            padding-bottom: 8px;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
          }
          .week-grid-cell {
            scroll-snap-align: start;
          }
        }

        .week-grid-cell { min-width: 0; }

        .day-col { min-width: 0; }
        .day-col.is-today {
          outline: 2px solid rgba(13,110,253,.35);
          outline-offset: 4px;
          border-radius: 12px;
        }

        .day-col-header { margin-bottom: 6px; }
        .day-heading-btn {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0,0,0,.08);
          background: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .day-heading-btn.today { border-color: rgba(13,110,253,.45); }
        .day-heading-btn:focus {
          outline: 3px solid rgba(13,110,253,.45);
          outline-offset: 2px;
        }
        .day-heading-text { white-space: nowrap; }

        .empty-day {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px dashed rgba(0,0,0,.12);
          background: rgba(0,0,0,.02);
          margin-bottom: 8px;
          text-align: center;
        }

        /* CARDS */
        .day-card { position: relative; overflow: hidden; }
        .day-card:focus {
          outline: 3px solid rgba(13,110,253,.45);
          outline-offset: 2px;
        }

        .card-inner.is-completed { filter: grayscale(1); opacity: .72; }

        .done-strip {
          position: absolute;
          top: 8px; left: 8px; right: 8px;
          z-index: 3;
          background: #e8f5e9;
          color: #1b5e20;
          border: 1px solid #c8e6c9;
          border-radius: 12px;
          padding: 6px 10px;
          text-align: center;
          font-weight: 700;
          box-shadow: 0 1px 2px rgba(0,0,0,.06);
          pointer-events: none;
        }
        .done-strip .check { font-weight: 900; margin-right: .35rem; }

        .preview-slot {
          width: 100%;
          height: 160px;
          background: #f1f3f4;
          display: flex;
          align-items: center;
          justify-content: center;
          border-top-left-radius: .375rem;
          border-top-right-radius: .375rem;
          overflow: hidden;
        }
        .preview-img { width: 100%; height: 100%; object-fit: cover; }
        .preview-placeholder { color: #9aa0a6; font-size: .9rem; }

        .day-card.compact { min-height: auto; cursor: pointer; }
        .day-card.compact .card-body { padding: 8px 10px; }

        .meta-inline { display: inline-flex; align-items: center; gap: 6px; }
        .meta-icon { font-size: .95rem; opacity: .85; }

        /* Buttons */
        .action-btn {
          font-size: 1.05rem;
          padding: .65rem 1.15rem;
          border-radius: .75rem;
        }

        .footer-meta {
          background: #f8f9fa;
          border-top: 1px solid rgba(0,0,0,0.05);
        }
      `}</style>
    </div>
  );
};

export default InterventionList;
