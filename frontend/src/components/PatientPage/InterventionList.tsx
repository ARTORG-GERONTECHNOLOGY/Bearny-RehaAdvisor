import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Card, Row, Col, ToggleButtonGroup, ToggleButton, Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { startOfWeek, addDays, format, isToday, isPast, endOfWeek } from 'date-fns';
import { enUS, de, fr, it } from 'date-fns/locale';

import {
  getBadgeVariantFromIntervention,
  getMediaTypeLabelFromIntervention,
  getTagColor,
} from '../../utils/interventions';

import authStore from '../../stores/authStore';
import PatientInterventionPopUp from './PatientInterventionPopUp';
import FeedbackPopup from './FeedbackPopup';
import PatientQuestionaire from './PatientQuestionaire';

import { patientUiStore } from '../../stores/patientUiStore';
import { patientInterventionsStore, PatientRec } from '../../stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '../../stores/patientQuestionnairesStore';
import { generateTagColors, getTaxonomyTags } from '../../utils/interventions';
// ---------- helpers ----------
const asStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

const normalizeDayKey = (v: unknown): string => {
  if (v == null) return '';

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    const dd = String(v.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const s = asStr(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.length >= 10) return s.slice(0, 10);
  return '';
};

// pull “library-style tags” from plan item (NOTE: patient payload nests meta under rec.intervention)
const getMetaTags = (rec: any): string[] => {
  const out: string[] = [];
  const src = rec?.intervention ?? rec ?? {};

  const aim = asStr(src?.benefitFor || src?.aim).trim();
  if (aim) out.push(aim);

  out.push(...asArr<string>(src?.topic).map(asStr));
  out.push(...asArr<string>(src?.lc9).map(asStr));
  out.push(...asArr<string>(src?.where).map(asStr));
  out.push(...asArr<string>(src?.setting).map(asStr));
  out.push(...asArr<string>(src?.keywords).map(asStr));

  const ct = asStr(rec?.content_type || src?.content_type).trim();
  if (ct) out.push(ct);

  return uniq(out);
};

const InterventionList: React.FC = observer(() => {
  const { t, i18n } = useTranslation();

  // ✅ DO NOT memo; authStore.id can be set after auth check
  const patientId = localStorage.getItem('id') || authStore.id || '';

  const [selectedItem, setSelectedItem] = useState<PatientRec | null>(null);

  // key = `${interventionId}__${yyyy-MM-dd}`
  const [busyKey, setBusyKey] = useState<string | null>(null);


  const localeMap: Record<string, any> = { en: enUS, de, fr, it };
  const currentLocale = useMemo(
    () => localeMap[(i18n.language || 'en').slice(0, 2)] || enUS,
    [i18n.language]
  );
  const tagColors = useMemo(() => generateTagColors(getTaxonomyTags()), []);
  useEffect(() => {
    if (!patientId) return;

    patientInterventionsStore.fetchPlan(patientId, i18n.language);
    patientQuestionnairesStore.checkInitialQuestionnaire(patientId);
    patientQuestionnairesStore.loadHealthQuestionnaire(patientId, i18n.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, i18n.language]);

  const openFeedbackFor = useCallback(
    async (interventionId: string, dateKey: string) => {
      try {
        await patientQuestionnairesStore.openInterventionFeedback(
          patientId,
          interventionId,
          dateKey,
          i18n.language
        );
      } catch (e) {
        console.error('[openFeedbackFor] failed:', e);
        try {
          patientQuestionnairesStore.closeFeedback();
        } catch {}
      }
    },
    [patientId, i18n.language]
  );

  const handleToggleCompleted = async (rec: PatientRec, date: Date) => {
    if (!patientId) return;

    const dateKey = format(date, 'yyyy-MM-dd');
    const lockKey = `${rec.intervention_id}__${dateKey}`;

    if (busyKey === lockKey) return;
    setBusyKey(lockKey);

    try {
      setSelectedItem(null);

      const res = await patientInterventionsStore.toggleCompleted(patientId, rec, date);

      setBusyKey(null);

      if (res?.completed) {
        void openFeedbackFor(rec.intervention_id, res.dateKey);
      }
    } catch (err) {
      console.error('Toggle completed failed:', err);
      setBusyKey(null);
    }
  };

  const renderStatus = (rec: PatientRec, date: Date) => {
    const completed = patientInterventionsStore.isCompletedOn(rec, date);
    const dateKey = format(date, 'yyyy-MM-dd');
    const lockKey = `${rec.intervention_id}__${dateKey}`;
    const isBusy = busyKey === lockKey;

    if (isToday(date) || (isPast(date) && !isToday(date))) {
      return completed ? (
        <div className="d-flex justify-content-center">
          <Button
            className="action-btn"
            variant="outline-secondary"
            disabled={isBusy}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleCompleted(rec, date);
            }}
            aria-label={t('Undo')}
            title={t('Uncheck / undo')}
          >
            {isBusy ? t('Saving...') : t('Undo')}
          </Button>
        </div>
      ) : (
        <Button
          className="action-btn"
          variant={isToday(date) ? 'primary' : 'outline-primary'}
          disabled={isBusy}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleCompleted(rec, date);
          }}
          aria-label={t('Ididit')}
          title={t('Mark as completed')}
        >
          {isBusy ? t('Saving...') : t('Ididit')}
        </Button>
      );
    }

    return completed ? <Badge bg="success">{t('Done')}</Badge> : <Badge bg="info">{t('Upcoming')}</Badge>;
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
    const matching = (rec.dates || []).find((d) => normalizeDayKey(d) === dateKey);
    if (!matching) return '';
    const dt = new Date(String(matching));
    if (Number.isNaN(dt.getTime())) return '';
    return format(dt, 'HH:mm');
  };

  const openRec = useCallback((rec: PatientRec) => {
    if (patientQuestionnairesStore.showFeedbackPopup) patientQuestionnairesStore.closeFeedback();
    if (patientQuestionnairesStore.showHealthPopup) patientQuestionnairesStore.closeHealth();
    setSelectedItem(rec);
  }, []);

  const onCardKeyDown = (e: React.KeyboardEvent, rec: PatientRec) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRec(rec);
    }
  };

  const renderMetaTagsRow = (rec: any) => {
    const tags = getMetaTags(rec);
    if (!tags.length) return null;

    return (
      <div className="meta-tag-row" aria-label={t('Tags')}>
        {tags.slice(0, 6).map((x, idx) => {
          const bg = getTagColor(tagColors, x) || '#6f2dbd';
          return (
            <span
              key={`${x}-${idx}`}
              className="meta-pill"
              title={x}
              style={{ backgroundColor: bg, color: '#fff' }}
            >
              {t(x, { defaultValue: x })}
            </span>
          );
        })}
        {tags.length > 6 ? <span className="meta-pill meta-pill--more">+{tags.length - 6}</span> : null}
      </div>
    );
  };

  const renderDayColumn = (date: Date, isWeekView = false) => {
    const dateKey = format(date, 'yyyy-MM-dd');

    const listForDay = patientInterventionsStore.items.filter((rec) =>
      (rec.dates || []).some((d) => normalizeDayKey(d) === dateKey)
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

          // media-type badge colors (same as therapist list)
          const src = (rec as any)?.intervention ?? (rec as any);
          const mediaVariant = getBadgeVariantFromIntervention(src);
          const mediaLabel = getMediaTypeLabelFromIntervention(src);

          if (isWeekView) {
            return (
              <Card
                key={`${rec.intervention_id}-${dateKey}-compact`}
                className={`mb-2 day-card compact ${completed ? 'is-completed' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => openRec(rec)}
                onKeyDown={(e) => onCardKeyDown(e, rec)}
                aria-label={`${title}. ${t('Time')}: ${timeStr || '—'}.`}
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
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div className="text-truncate fw-semibold small">{title}</div>
                      <Badge bg={mediaVariant as any} aria-label={t('Media type')}>
                        {t(mediaLabel, { defaultValue: mediaLabel })}
                      </Badge>
                    </div>

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

                    {renderMetaTagsRow(rec as any)}
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
                    <img src={rec.preview_img} alt={t('Preview') || 'Preview'} className="preview-img" />
                  ) : (
                    <div className="preview-placeholder">{t('preview')}</div>
                  )}
                </div>

                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <Card.Title style={{ fontSize: '1rem' }}>{title}</Card.Title>
                    <Badge bg={mediaVariant as any} aria-label={t('Media type')}>
                      {t(mediaLabel, { defaultValue: mediaLabel })}
                    </Badge>
                  </div>

                  <Card.Text style={{ fontSize: '0.9rem' }}>
                    {(rec.translated_description || '').slice(0, 120)}
                    {(rec.translated_description || '').length > 120 ? '…' : ''}
                  </Card.Text>

                  {renderMetaTagsRow(rec as any)}
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
          {format(start, 'dd.MM', { locale: currentLocale })} – {format(end, 'dd.MM', { locale: currentLocale })} (
          {t('Week')} {weekNumber})
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
    patientUiStore.setSelectedDate(addDays(patientUiStore.selectedDate, dir === 'next' ? delta : -delta));
  };

  const isViewingToday =
    patientUiStore.viewMode === 'day'
      ? isToday(patientUiStore.selectedDate)
      : format(startOfWeek(patientUiStore.selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd') ===
        format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const safeInterventionQuestions = Array.isArray(patientQuestionnairesStore.feedbackQuestions)
    ? patientQuestionnairesStore.feedbackQuestions
    : [];
  const safeHealthQuestions = Array.isArray(patientQuestionnairesStore.healthQuestions)
    ? patientQuestionnairesStore.healthQuestions
    : [];

  const closeFeedback = () => {
    patientQuestionnairesStore.closeFeedback();
    setBusyKey(null);
  };

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <Button onClick={() => handleNavigate('prev')} aria-label={t('Previous')} title={t('Go back')}>
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
          <ToggleButton id="week" value="week" variant="outline-primary" aria-label={t('Week view')}>
            {t('Week')}
          </ToggleButton>
        </ToggleButtonGroup>

        <Button onClick={() => handleNavigate('next')} aria-label={t('Next')} title={t('Go forward')}>
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
        <PatientInterventionPopUp show item={selectedItem} handleClose={() => setSelectedItem(null)} />
      )}

      {patientQuestionnairesStore.showFeedbackPopup && (
        <FeedbackPopup
          show
          interventionId={patientQuestionnairesStore.feedbackInterventionId || ''}
          questions={safeInterventionQuestions}
          date={patientQuestionnairesStore.feedbackDateKey}
          onClose={closeFeedback}
        />
      )}

      {patientQuestionnairesStore.showHealthPopup && (
        <FeedbackPopup
          show
          interventionId=""
          questions={safeHealthQuestions}
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

        .preview-slot { width: 100%; height: 160px; background: #f1f3f4; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .preview-img { width: 100%; height: 100%; object-fit: cover; }
        .preview-placeholder { color: #9aa0a6; font-size: .9rem; }

        .meta-inline { display: inline-flex; align-items: center; gap: 6px; }
        .meta-icon { font-size: .95rem; opacity: .85; }

        .action-btn { font-size: 1.05rem; padding: .65rem 1.15rem; border-radius: .75rem; }
        .footer-meta { background: #f8f9fa; border-top: 1px solid rgba(0,0,0,0.05); }

        /* tags */
        .meta-tag-row{
          display:flex;
          flex-wrap:wrap;
          gap: 8px;
          margin-top: 10px;
          position: relative;
          z-index: 1;
        }
        .meta-pill{
          display:inline-flex;
          align-items:center;
          padding: 6px 10px;
          border-radius: 10px;
          font-weight: 700;
          font-size: .85rem;
          line-height: 1;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .meta-pill--more{
          background: #e9ecef !important;
          color: #212529 !important;
        }
      `}</style>
    </div>
  );
});

export default InterventionList;