// src/components/RehaTablePage/InterventionCalendar.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, momentLocalizer, Views, EventProps } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { parseISO, format, isSameDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { de, fr, enGB, it } from 'date-fns/locale';
import moment from 'moment';
import { translateText } from '../../utils/translate';
import { Spinner, Button, ButtonGroup } from 'react-bootstrap';

const localeMap: any = { de, fr, en: enGB, it };

type DateEntry = {
  datetime: string;
  status?: 'completed' | 'missed' | 'upcoming' | string;
  feedback?: any[];
};

type InterventionLike = {
  _id: string;
  title: string;
  duration: number;
  benefitFor?: any; // string[] or JSON-stringified array etc.
  dates: DateEntry[];
};

type Props = {
  interventions: InterventionLike[];
  onSelectEvent?: (event: any) => void;
};

type TitleMap = Record<string, { text: string; from: string | null; original: string }>;

type CalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  status: 'completed' | 'missed' | 'upcoming' | 'unknown';
  statusLabel: string;
  feedbackCount: number;
  _id: string;

  benefitKey: string;
  benefitLabel: string; // translated label
  rawBenefit: string;

  isToday: boolean;
  originalTitle?: string;
};

const normalizeLang = (lang?: string) => (lang || 'en').split('-')[0];

/** Status palette (color-blind friendly / Google-ish neutrals) */
const STATUS_STYLE = {
  completed: { bg: '#9AA0A6', text: '#202124', borderStyle: 'solid' as const, opacity: 0.92, icon: '✓' },
  missed: { bg: '#5F6368', text: '#FFFFFF', borderStyle: 'dashed' as const, opacity: 0.95, icon: '⚠' },
  upcoming: { bg: '#DADCE0', text: '#3C4043', borderStyle: 'solid' as const, opacity: 1, icon: '⏳' },
  unknown: { bg: '#E8EAED', text: '#3C4043', borderStyle: 'solid' as const, opacity: 1, icon: '•' },
};

const TODAY_HIGHLIGHT_BG = '#E8F0FE';

/**
 * Benefit palette (color-blind friendly accents).
 * IMPORTANT: keys here are normalized by normalizeBenefitKey().
 */
const BENEFIT_COLORS: Record<string, string> = {
  mobility: '#1B9E77',
  musclekraft: '#7570B3',
  strength: '#7570B3',
  balance: '#66A61E',
  endurance: '#E6AB02',
  education: '#A6761D',
  relaxation: '#80B1D3',
  sleep: '#80B1D3',
  schlaf: '#80B1D3',
  'mental health': '#D95F02',
  default: '#BDC1C6',
};

const prettifyStatus = (s: 'completed' | 'missed' | 'upcoming' | 'unknown', t: (k: string) => string) => {
  if (s === 'completed') return t('Completed');
  if (s === 'missed') return t('Missed');
  if (s === 'upcoming') return t('Upcoming');
  return t('Unknown');
};

const normalizeBenefitKey = (benefitFor: any): { benefitKey: string; rawBenefit: string } => {
  let raw = '';
  const takeFirst = (arr: any[]) => (arr.length ? String(arr[0] ?? '') : '');

  if (Array.isArray(benefitFor)) raw = takeFirst(benefitFor);
  else if (typeof benefitFor === 'string') raw = benefitFor;
  else raw = '';

  // Handle JSON-stringified arrays like '["Mental health"]'
  let cleaned = raw.trim();
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) cleaned = takeFirst(parsed).trim();
    } catch {
      // ignore
    }
  }

  const key = cleaned.toLowerCase().replace(/\s+/g, ' ').trim();

  // A few common mappings in your dataset
  if (key.includes('muskelkraft')) return { benefitKey: 'musclekraft', rawBenefit: cleaned || '' };
  if (key.includes('mobility') || key.includes('mobil')) return { benefitKey: 'mobility', rawBenefit: cleaned || '' };
  if (key.includes('balance') || key.includes('gleichgewicht')) return { benefitKey: 'balance', rawBenefit: cleaned || '' };
  if (key.includes('endurance') || key.includes('fitness') || key.includes('kardiorespirator'))
    return { benefitKey: 'endurance', rawBenefit: cleaned || '' };
  if (key.includes('sleep') || key.includes('schlaf')) return { benefitKey: 'sleep', rawBenefit: cleaned || '' };
  if (key.includes('mental')) return { benefitKey: 'mental health', rawBenefit: cleaned || '' };

  return { benefitKey: key || 'default', rawBenefit: cleaned || '' };
};

const normalizeStatus = (s?: string): 'completed' | 'missed' | 'upcoming' | 'unknown' => {
  const v = String(s || '').toLowerCase().trim();
  if (v === 'completed' || v === 'done') return 'completed';
  if (v === 'missed') return 'missed';
  if (v === 'upcoming' || v === 'scheduled' || v === 'future') return 'upcoming';
  return 'unknown';
};

const shouldShowOriginalLang = (original: string, translated: string, from: string | null) => {
  if (!from) return false;
  const a = (original || '').trim();
  const b = (translated || '').trim();
  if (!a || !b) return false;
  return a.toLowerCase() !== b.toLowerCase();
};

const clampTitle = (s: string, max = 46) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

type ColorMode = 'status' | 'benefit';

/**
 * Mode behavior:
 * - Color by Status: main BG=status, side stripe=benefit
 * - Color by Benefit: main BG=benefit, side stripe=status
 */
const InterventionCalendar: React.FC<Props> = ({ interventions, onSelectEvent }) => {
  const { i18n, t } = useTranslation();
  const currentLang = normalizeLang(i18n.language || 'en');
  const currentLocale = localeMap[currentLang] || enGB;
  const localizer = momentLocalizer(moment);

  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<any>(Views.AGENDA);
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});
  const [loading, setLoading] = useState(true);

  // Toggle for coloring
  const [colorMode, setColorMode] = useState<ColorMode>('status');

  useEffect(() => {
    let cancelled = false;

    const translateTitles = async () => {
      setLoading(true);
      const result: TitleMap = {};

      for (const i of interventions || []) {
        const original = i?.title || '';
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(original, currentLang);
          const finalText = (translatedText || original).trim();
          result[i._id] = { text: finalText, from: detectedSourceLanguage || null, original };
        } catch {
          result[i._id] = { text: original, from: null, original };
        }
      }

      if (!cancelled) {
        setTranslatedTitles(result);
        setLoading(false);
      }
    };

    translateTitles();
    return () => {
      cancelled = true;
    };
  }, [interventions, currentLang]);

  /** Translate benefit label using your translations map (i18next) */
  const getBenefitLabel = (rawBenefit: string) => {
    const cleaned = (rawBenefit || '').trim();
    if (!cleaned) return '—';

    const exact = t(cleaned);
    if (exact && exact !== cleaned) return exact;

    const lower = cleaned.toLowerCase();
    const lowerT = t(lower);
    if (lowerT && lowerT !== lower) return lowerT;

    const ns = `Benefit.${cleaned}`;
    const nsT = t(ns);
    if (nsT && nsT !== ns) return nsT;

    return cleaned;
  };

  const events: CalendarEvent[] = useMemo(() => {
    const today = new Date();

    return (interventions || []).flatMap((intervention) => {
      const titleInfo = translatedTitles[intervention._id];
      const translatedTitle = titleInfo?.text || intervention.title;
      const originalTitle = titleInfo?.original || intervention.title;
      const showLang = shouldShowOriginalLang(originalTitle, translatedTitle, titleInfo?.from || null);
      const langSuffix = showLang ? ` (${t('Original language:')} ${titleInfo?.from})` : '';

      const { benefitKey, rawBenefit } = normalizeBenefitKey(intervention.benefitFor);
      const benefitLabel = getBenefitLabel(rawBenefit);

      const durMin = Number(intervention.duration || 0);
      const durationMs = Math.max(1, durMin) * 60000;

      return (intervention.dates || []).map((entry) => {
        const baseDate = parseISO(entry.datetime);
        const status = normalizeStatus(entry.status);

        return {
          title: translatedTitle + langSuffix,
          start: baseDate,
          end: new Date(baseDate.getTime() + durationMs),
          status,
          statusLabel: prettifyStatus(status, t),
          feedbackCount: Array.isArray(entry.feedback) ? entry.feedback.length : 0,
          _id: intervention._id,
          benefitKey,
          benefitLabel,
          rawBenefit,
          isToday: isSameDay(baseDate, today),
          originalTitle: showLang ? originalTitle : undefined,
        };
      });
    });
  }, [interventions, translatedTitles, t]);

  // Build benefit legend dynamically from visible events
  const benefitLegendItems = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string }>();

    for (const e of events) {
      const key = e.benefitKey || 'default';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: e.benefitLabel || '—',
          color: BENEFIT_COLORS[key] || BENEFIT_COLORS.default,
        });
      }
    }

    // If there are none, show default
    if (map.size === 0) {
      map.set('default', { key: 'default', label: t('Benefit'), color: BENEFIT_COLORS.default });
    }

    // Sort: put default last, otherwise alphabetically by label
    const arr = Array.from(map.values());
    return arr.sort((a, b) => {
      if (a.key === 'default') return 1;
      if (b.key === 'default') return -1;
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [events, t]);

  const handleNavigate = (newDate: Date) => setDate(newDate);

  const calendarMessages = {
    today: t('Calendar.today'),
    previous: t('Calendar.previous'),
    next: t('Calendar.next'),
    month: t('Calendar.month'),
    week: t('Calendar.week'),
    day: t('Calendar.day'),
    agenda: t('Calendar.agenda'),
    showMore: (count: number) => t('Calendar.showMore', { count }),
  };

  const getEventColors = (event: CalendarEvent) => {
    const s = (STATUS_STYLE as any)[event.status] || STATUS_STYLE.unknown;
    const benefit = BENEFIT_COLORS[event.benefitKey] || BENEFIT_COLORS.default;

    if (colorMode === 'status') {
      return {
        mainBg: event.isToday ? TODAY_HIGHLIGHT_BG : s.bg,
        mainText: event.isToday ? '#202124' : s.text,
        stripe: benefit,
        borderStyle: s.borderStyle,
        icon: s.icon,
      };
    }

    const darkText = '#202124';
    const lightText = '#FFFFFF';

    const isDark = (hex: string) => {
      const h = hex.replace('#', '');
      if (h.length !== 6) return false;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum < 140;
    };

    const mainBg = event.isToday ? TODAY_HIGHLIGHT_BG : benefit;
    const mainText = event.isToday ? darkText : isDark(benefit) ? lightText : darkText;

    return {
      mainBg,
      mainText,
      stripe: s.bg,
      borderStyle: s.borderStyle,
      icon: s.icon,
    };
  };

  const buildHoverText = (event: CalendarEvent) => {
    const parts = [
      event.title,
      `${t('Status')}: ${event.statusLabel}`,
      `${t('Benefit')}: ${event.benefitLabel || '—'}`,
    ];
    if (event.feedbackCount) parts.push(`${t('Feedback')}: ${event.feedbackCount}`);
    return parts.join(' • ');
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    const c = getEventColors(event);
    return {
      style: {
        backgroundColor: c.mainBg,
        color: c.mainText,
        borderLeft: `5px solid ${c.stripe}`,
        borderTop: '1px solid rgba(0,0,0,0.06)',
        borderRight: '1px solid rgba(0,0,0,0.06)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        borderStyle: c.borderStyle,
        borderRadius: '8px',
        padding: '4px 6px',
        margin: '2px 0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      } as React.CSSProperties,
    };
  };

  const renderMonthEvent = ({ event }: { event: CalendarEvent }) => {
    const c = getEventColors(event);

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: c.mainBg,
          color: c.mainText,
          borderLeft: `4px solid ${c.stripe}`,
          borderRadius: 6,
          padding: '2px 6px',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          border: '1px solid rgba(0,0,0,0.08)',
        }}
        title={buildHoverText(event)}
      >
        <span aria-hidden="true" style={{ fontWeight: 800 }}>
          {c.icon}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{clampTitle(event.title)}</span>
      </div>
    );
  };

  const EventWithIcon: React.FC<EventProps<CalendarEvent>> = ({ event }) => {
    const c = getEventColors(event);
    return (
      <div title={buildHoverText(event)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden="true" style={{ fontWeight: 800 }}>
          {c.icon}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</span>
      </div>
    );
  };

  // Bold current day headers + highlight current day cells
  const dayPropGetter = (d: Date) => {
    const today = new Date();
    if (isSameDay(d, today)) {
      return {
        className: 'rbc-day-today-strong',
        style: { backgroundColor: '#F8FAFF' },
      };
    }
    return {};
  };

  const formats = {
    dayFormat: (d: Date) => format(d, 'PP', { locale: currentLocale }),
    dayHeaderFormat: (d: Date) => {
      const s = format(d, 'PPPP', { locale: currentLocale });
      return isSameDay(d, new Date()) ? `★ ${s}` : s;
    },
    agendaDateFormat: (d: Date) => format(d, 'PP', { locale: currentLocale }),
    agendaTimeFormat: (d: Date) => format(d, 'p', { locale: currentLocale }),
    timeGutterFormat: (d: Date) => format(d, 'p', { locale: currentLocale }),
    eventTimeRangeFormat: () => '',
    agendaHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${format(start, 'P', { locale: currentLocale })} – ${format(end, 'P', { locale: currentLocale })}`,
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" role="status" />
        <p className="mt-3">{t('Loading translations...')}</p>
      </div>
    );
  }

  return (
    <div style={{ height: '80vh', position: 'relative' }}>
      <style>{`
        .floating-toggle {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 1000;
          display: none;
        }
        @media (max-width: 768px) {
          .floating-toggle { display: block; }
        }

        .rbc-day-today-strong .rbc-date-cell,
        .rbc-day-today-strong .rbc-header,
        .rbc-day-today-strong .rbc-button-link {
          font-weight: 800 !important;
        }

        .rbc-today { background: #F8FAFF !important; }

        .calendar-toolbar-row{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          margin-bottom:10px;
          flex-wrap:wrap;
        }

        .calendar-legend-wrap{
          display:flex;
          flex-direction:column;
          gap:8px;
          align-items:flex-end;
        }
        @media (max-width: 768px) {
          .calendar-legend-wrap{ align-items:flex-start; width:100%; }
        }

        .calendar-legend{
          display:flex;
          align-items:center;
          gap:10px;
          font-size:.85rem;
          color:#5f6368;
          flex-wrap:wrap;
        }
        .legend-title{
          font-weight:700;
          color:#3c4043;
          margin-right:4px;
        }
        .legend-pill{
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:3px 8px;
          border:1px solid rgba(0,0,0,0.08);
          border-radius:999px;
          background:#fff;
        }
        .legend-dot{
          width:10px;
          height:10px;
          border-radius:3px;
          display:inline-block;
        }

        .legend-grid{
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        }
      `}</style>

      {/* Toggle + legends */}
      <div className="calendar-toolbar-row">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="text-muted small">{t('Color by')}</span>
          <ButtonGroup>
            <Button
              size="sm"
              variant={colorMode === 'status' ? 'dark' : 'outline-dark'}
              onClick={() => setColorMode('status')}
              title={t('Main color shows status; side stripe shows benefit')}
            >
              {t('Status')}
            </Button>
            <Button
              size="sm"
              variant={colorMode === 'benefit' ? 'dark' : 'outline-dark'}
              onClick={() => setColorMode('benefit')}
              title={t('Main color shows benefit; side stripe shows status')}
            >
              {t('Benefit')}
            </Button>
          </ButtonGroup>
        </div>

        <div className="calendar-legend-wrap">
          {/* STATUS LEGEND */}
          <div className="calendar-legend" aria-label={t('Status legend')}>
            <span className="legend-title">{t('Status')}:</span>

            <span className="legend-pill" title={t('Completed')}>
              <span className="legend-dot" style={{ background: STATUS_STYLE.completed.bg }} />
              ✓ {t('Completed')}
            </span>

            <span className="legend-pill" title={t('Missed')}>
              <span className="legend-dot" style={{ background: STATUS_STYLE.missed.bg }} />
              ⚠ {t('Missed')}
            </span>

            <span className="legend-pill" title={t('Upcoming')}>
              <span className="legend-dot" style={{ background: STATUS_STYLE.upcoming.bg }} />
              ⏳ {t('Upcoming')}
            </span>
          </div>

          {/* BENEFIT LEGEND */}
          <div className="calendar-legend" aria-label={t('Benefit legend')}>
            <span className="legend-title">{t('Benefit')}:</span>

            <div className="legend-grid">
              {benefitLegendItems.map((b) => (
                <span
                  key={b.key}
                  className="legend-pill"
                  title={`${t('Benefit')}: ${b.label}`}
                >
                  <span className="legend-dot" style={{ background: b.color }} />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Calendar
        localizer={localizer}
        events={events}
        date={date}
        onNavigate={handleNavigate}
        views={['month', 'week', 'day', 'agenda']}
        view={view}
        onView={(v) => setView(v)}
        startAccessor="start"
        endAccessor="end"
        onSelectEvent={onSelectEvent}
        style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '10px' }}
        eventPropGetter={eventStyleGetter}
        dayPropGetter={dayPropGetter as any}
        messages={calendarMessages}
        components={{
          month: { event: renderMonthEvent as any },
          event: EventWithIcon as any,
        }}
        formats={formats as any}
      />

      {/* Mobile: week/agenda toggle */}
      <div className="floating-toggle">
        <Button
          variant="dark"
          size="sm"
          onClick={() => setView((prev: any) => (prev === 'week' ? 'agenda' : 'week'))}
        >
          {view === 'week' ? t('Switch to Agenda') : t('Switch to Week')}
        </Button>
      </div>
    </div>
  );
};

export default InterventionCalendar;
