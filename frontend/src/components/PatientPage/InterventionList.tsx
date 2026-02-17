import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Card, Row, Col, ToggleButtonGroup, ToggleButton, Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { startOfWeek, addDays, format, isToday, isPast, endOfWeek } from 'date-fns';
import { enUS, de, fr, it } from 'date-fns/locale';

import authStore from '../../stores/authStore';
import PatientInterventionPopUp from './PatientInterventionPopUp';
import FeedbackPopup from './FeedbackPopup';
import PatientQuestionaire from './PatientQuestionaire';

import { patientUiStore } from '../../stores/patientUiStore';
import { patientInterventionsStore, PatientRec } from '../../stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '../../stores/patientQuestionnairesStore';

const InterventionList: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const patientId = useMemo(() => localStorage.getItem('id') || authStore.id, []);

  const [selectedItem, setSelectedItem] = useState<PatientRec | null>(null);

  const localeMap: Record<string, any> = { en: enUS, de, fr, it };
  const currentLocale = useMemo(
    () => localeMap[(i18n.language || 'en').slice(0, 2)] || enUS,
    [i18n.language]
  );

  useEffect(() => {
    if (!patientId) return;

    patientInterventionsStore.fetchPlan(patientId, i18n.language);
    patientQuestionnairesStore.checkInitialQuestionnaire(patientId);
    patientQuestionnairesStore.loadHealthQuestionnaire(patientId, i18n.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const openFeedbackFor = async (interventionId: string, dateKey: string) => {
    await patientQuestionnairesStore.openInterventionFeedback(
      patientId,
      interventionId,
      dateKey,
      i18n.language
    );
  };

  const handleToggleCompleted = async (rec: PatientRec, date: Date) => {
    try {
      const res = await patientInterventionsStore.toggleCompleted(patientId, rec, date);
      if (res.completed) {
        await openFeedbackFor(rec.intervention_id, res.dateKey);
      }
    } catch (err) {
      console.error('Toggle completed failed:', err);
    }
  };

  const renderStatus = (rec: PatientRec, date: Date) => {
    const completed = patientInterventionsStore.isCompletedOn(rec, date);

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

  const sortDayItems = (items: PatientRec[], date: Date) => {
    return [...items].sort((a, b) => {
      const aDone = patientInterventionsStore.isCompletedOn(a, date);
      const bDone = patientInterventionsStore.isCompletedOn(b, date);
      if (aDone === bDone) {
        const at = a.translated_title || a.intervention_title || '';
        const bt = b.translated_title || b.intervention_title || '';
        return at.localeCompare(bt);
      }
      return aDone ? 1 : -1;
    });
  };

  const getTimeForDay = (rec: PatientRec, dateKey: string) => {
    const matching = (rec.dates || []).find((d) => String(d).startsWith(dateKey));
    if (!matching) return '';
    const dt = new Date(matching);
    if (Number.isNaN(dt.getTime())) return '';
    return format(dt, 'HH:mm');
  };

  const openRec = useCallback((rec: PatientRec) => setSelectedItem(rec), []);

  const onCardKeyDown = (e: React.KeyboardEvent, rec: PatientRec) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRec(rec);
    }
  };

  const renderDayColumn = (date: Date, isWeekView = false) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const listForDay = patientInterventionsStore.items.filter((rec) =>
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
                patientUiStore.setSelectedDate(date);
                patientUiStore.setViewMode('day');
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
          const completed = patientInterventionsStore.isCompletedOn(rec, date);
          const title = rec.translated_title || rec.intervention_title;
          const timeStr = getTimeForDay(rec, dateKey);

          if (isWeekView) {
            const aria = `${title}. ${t('Time')}: ${timeStr || t('Unknown')}. ${
              typeof rec.duration === 'number'
                ? `${t('Duration')}: ${rec.duration} ${t('min')}.`
                : ''
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

                    <span className="sr-only">
                      {completed ? t('Done') : isPast(date) ? t('Missed') : t('Upcoming')}
                    </span>
                  </Card.Body>
                </div>
              </Card>
            );
          }

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
                    <img
                      src={rec.preview_img}
                      alt={t('Preview') || 'Preview'}
                      className="preview-img"
                    />
                  ) : (
                    <div className="preview-placeholder">{t('preview')}</div>
                  )}
                </div>

                <Card.Body>
                  <Card.Title style={{ fontSize: '1rem' }}>
                    {title}{' '}
                    {rec.titleLang && (
                      <small className="text-muted">
                        {'\n'} ({t('Original language:')} {rec.titleLang})
                      </small>
                    )}
                  </Card.Title>

                  <Card.Text style={{ fontSize: '0.9rem' }}>
                    {(rec.translated_description || '').slice(0, 80)}
                    {(rec.translated_description || '').length > 80 ? '…' : ''}
                    {rec.descLang && (
                      <span className="text-muted ms-2">
                        {'\n'} ({t('Original language:')} {rec.descLang})
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
    const start = startOfWeek(patientUiStore.selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(patientUiStore.selectedDate, { weekStartsOn: 1 });
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const weekNumber = format(start, 'I');

    return (
      <>
        <h5 className="text-center mb-3 week-title" aria-live="polite">
          {format(start, 'dd.MM', { locale: currentLocale })} –{' '}
          {format(end, 'dd.MM', { locale: currentLocale })} ({t('Week')} {weekNumber})
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

  const renderDayView = () => {
    const short = format(patientUiStore.selectedDate, 'EEE dd.MM.yyyy', { locale: currentLocale });
    const label = isToday(patientUiStore.selectedDate) ? `${short} (${t('Today')})` : short;

    return (
      <>
        <h5 className="text-center mb-3" aria-live="polite">
          {label}
        </h5>
        <Row className="g-3">
          <Col>{renderDayColumn(patientUiStore.selectedDate)}</Col>
        </Row>
      </>
    );
  };

  const handleNavigate = (dir: 'prev' | 'next') => {
    const delta = patientUiStore.viewMode === 'day' ? 1 : 7;
    patientUiStore.setSelectedDate(
      addDays(patientUiStore.selectedDate, dir === 'next' ? delta : -delta)
    );
  };

  const isViewingToday =
    patientUiStore.viewMode === 'day'
      ? isToday(patientUiStore.selectedDate)
      : format(startOfWeek(patientUiStore.selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd') ===
        format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  return (
    <div className="p-3">
      {patientInterventionsStore.error && (
        <div className="alert alert-danger mb-3" role="alert" aria-live="assertive">
          <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
            <span>{patientInterventionsStore.error}</span>
            {patientInterventionsStore.errorDetails && (
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={() => {
                  // keep minimal; you can also store "showDetails" in ui store if you want
                  alert(patientInterventionsStore.errorDetails);
                }}
              >
                {t('Show details')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <Button
          onClick={() => handleNavigate('prev')}
          aria-label={t('Previous')}
          title={t('Go back')}
        >
          {t('Previous')}
        </Button>

        <ToggleButtonGroup
          type="radio"
          name="viewMode"
          value={patientUiStore.viewMode}
          onChange={(v) => patientUiStore.setViewMode(v)}
          aria-label={t('Change view mode')}
        >
          <ToggleButton id="day" value="day" variant="outline-primary" aria-label={t('Day view')}>
            {t('Day')}
          </ToggleButton>
          <ToggleButton
            id="week"
            value="week"
            variant="outline-primary"
            aria-label={t('Week view')}
          >
            {t('Week')}
          </ToggleButton>
        </ToggleButtonGroup>

        <Button
          onClick={() => handleNavigate('next')}
          aria-label={t('Next')}
          title={t('Go forward')}
        >
          {t('Next')}
        </Button>
      </div>

      <div className="d-flex justify-content-center align-items-center mb-3">
        <Button
          variant={isViewingToday ? 'primary' : 'outline-primary'}
          onClick={() => patientUiStore.goToday()}
          aria-label={t('Go to today')}
          title={t('Go to today')}
          className="today-btn"
        >
          {t('Today')}
        </Button>
      </div>

      {patientUiStore.viewMode === 'week' ? renderWeekView() : renderDayView()}

      {/* Popups */}
      {selectedItem && !patientQuestionnairesStore.showFeedbackPopup && (
        <PatientInterventionPopUp
          show
          item={selectedItem}
          handleClose={() => setSelectedItem(null)}
        />
      )}

      {patientQuestionnairesStore.showFeedbackPopup && (
        <FeedbackPopup
          show
          interventionId={patientQuestionnairesStore.feedbackInterventionId || ''}
          questions={patientQuestionnairesStore.feedbackQuestions}
          date={patientQuestionnairesStore.feedbackDateKey}
          onClose={() => patientQuestionnairesStore.closeFeedback()}
        />
      )}

      {patientQuestionnairesStore.showHealthPopup && (
        <FeedbackPopup
          show
          interventionId=""
          questions={patientQuestionnairesStore.healthQuestions}
          date={format(patientUiStore.selectedDate, 'yyyy-MM-dd')}
          onClose={() => patientQuestionnairesStore.closeHealth()}
        />
      )}

      {patientQuestionnairesStore.showInitialPopup && (
        <PatientQuestionaire
          patient_id={localStorage.getItem('id') as any}
          show
          handleClose={() => patientQuestionnairesStore.closeInitial()}
        />
      )}

      <style>{`
        .today-btn { border-radius: .75rem; padding: .55rem 1rem; font-weight: 700; min-width: 140px; }

        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

        .week-title { font-weight: 700; }
        .week-grid { display: grid; gap: 12px; align-items: start; }
        @media (min-width: 992px) { .week-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); } }
        @media (min-width: 576px) and (max-width: 991.98px) { .week-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 575.98px) {
          .week-grid { grid-auto-flow: column; grid-auto-columns: minmax(240px, 80vw); overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; }
          .week-grid-cell { scroll-snap-align: start; }
        }

        .day-col.is-today { outline: 2px solid rgba(13,110,253,.35); outline-offset: 4px; border-radius: 12px; }
        .day-heading-btn { width: 100%; display: flex; justify-content: center; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,.08); background: #fff; font-weight: 700; cursor: pointer; }
        .day-heading-btn.today { border-color: rgba(13,110,253,.45); }
        .day-heading-btn:focus { outline: 3px solid rgba(13,110,253,.45); outline-offset: 2px; }

        .empty-day { padding: 10px 12px; border-radius: 10px; border: 1px dashed rgba(0,0,0,.12); background: rgba(0,0,0,.02); margin-bottom: 8px; text-align: center; }

        .day-card { position: relative; overflow: hidden; }
        .day-card:focus { outline: 3px solid rgba(13,110,253,.45); outline-offset: 2px; }
        .card-inner.is-completed { filter: grayscale(1); opacity: .72; }

        .done-strip {
          position: absolute; top: 8px; left: 8px; right: 8px;
          z-index: 3; background: #e8f5e9; color: #1b5e20;
          border: 1px solid #c8e6c9; border-radius: 12px;
          padding: 6px 10px; text-align: center; font-weight: 700;
          box-shadow: 0 1px 2px rgba(0,0,0,.06); pointer-events: none;
        }
        .done-strip .check { font-weight: 900; margin-right: .35rem; }

        .preview-slot { width: 100%; height: 160px; background: #f1f3f4; display: flex; align-items: center; justify-content: center; border-top-left-radius: .375rem; border-top-right-radius: .375rem; overflow: hidden; }
        .preview-img { width: 100%; height: 100%; object-fit: cover; }
        .preview-placeholder { color: #9aa0a6; font-size: .9rem; }

        .day-card.compact { min-height: auto; cursor: pointer; }
        .day-card.compact .card-body { padding: 8px 10px; }

        .meta-inline { display: inline-flex; align-items: center; gap: 6px; }
        .meta-icon { font-size: .95rem; opacity: .85; }

        .action-btn { font-size: 1.05rem; padding: .65rem 1.15rem; border-radius: .75rem; }
        .footer-meta { background: #f8f9fa; border-top: 1px solid rgba(0,0,0,0.05); }
      `}</style>
    </div>
  );
});

export default InterventionList;
