import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import de from 'date-fns/locale/de';
import enUS from 'date-fns/locale/en-US';

import type { Intervention } from '../../types';

type TitleMap = Record<string, { title: string; lang: string | null }>;
type PatientPlan = { interventions: Intervention[] } & Record<string, any>;

type DateEntry = {
  datetime: string;
  status?: 'completed' | 'missed' | 'today' | 'upcoming' | string;
  feedback?: any[];
  video?: any;
};

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    interventionId: string;
    intervention: any;
    dateEntry: DateEntry;
    status?: string;
  };
};

const locales: Record<string, Locale> = { en: enUS, de };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date, options) => startOfWeek(date, { weekStartsOn: 1, ...options }),
  getDay,
  locales,
});

const safeDate = (v: string): Date | null => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

interface Props {
  patientData: PatientPlan;
  titleMap?: TitleMap;
  onSelectIntervention?: (it: Intervention) => void;
}

const InterventionCalendar: React.FC<Props> = ({
  patientData,
  titleMap = {},
  onSelectIntervention,
}) => {
  const { t } = useTranslation();
  const [view, setView] = useState<View>(Views.AGENDA);
  const [date, setDate] = useState<Date>(new Date());

  const events: CalendarEvent[] = useMemo(() => {
    const planItems = Array.isArray(patientData?.interventions) ? patientData.interventions : [];
    const out: CalendarEvent[] = [];

    for (const it of planItems as any[]) {
      const dates: DateEntry[] = Array.isArray(it?.dates) ? it.dates : [];
      const durationMinRaw = Number(it?.duration);
      const durationMin =
        Number.isFinite(durationMinRaw) && durationMinRaw > 0 ? durationMinRaw : 30;

      const displayTitle = titleMap[it._id]?.title || it.title;

      // normalize dates
      for (const d of dates) {
        const start = safeDate(d.datetime);
        if (!start) continue;

        out.push({
          id: `${it._id}__${d.datetime}`,
          title: displayTitle,
          start,
          end: addMinutes(start, durationMin),
          resource: {
            interventionId: it._id,
            intervention: it,
            dateEntry: d,
            status: d.status,
          },
        });
      }
    }

    return out;
  }, [patientData, titleMap]);

  // legend content
  const legend = useMemo(
    () => (
      <div className="rehaLegend">
        <span className="rehaLegend__label">{t('Status')}:</span>
        <span className="rehaLegend__item rehaLegend__item--completed">✓ {t('Completed')}</span>
        <span className="rehaLegend__item rehaLegend__item--missed">✕ {t('Missed')}</span>
        <span className="rehaLegend__item rehaLegend__item--today">● {t('today')}</span>
        <span className="rehaLegend__item rehaLegend__item--upcoming">○ {t('Upcoming')}</span>
      </div>
    ),
    [t]
  );

  const eventPropGetter = (event: CalendarEvent) => {
    const status = event.resource?.status;
    if (status === 'completed') return { className: 'rehaEvent rehaEvent--completed' };
    if (status === 'missed') return { className: 'rehaEvent rehaEvent--missed' };
    if (status === 'today') return { className: 'rehaEvent rehaEvent--today' };
    if (status === 'upcoming') return { className: 'rehaEvent rehaEvent--upcoming' };
    return { className: 'rehaEvent' };
  };

  return (
    <div className="rehaCalendar">
      <div className="rehaCalendar__topbar">
        <div className="rehaCalendar__legendWrap">{legend}</div>
      </div>

      <div className="rehaCalendar__body">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={(v) => setView(v)}
          date={date}
          onNavigate={(d) => setDate(d)}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          popup
          eventPropGetter={eventPropGetter}
          onSelectEvent={(ev) => {
            if (onSelectIntervention) onSelectIntervention(ev.resource.intervention);
          }}
        />
      </div>
    </div>
  );
};

export default InterventionCalendar;
