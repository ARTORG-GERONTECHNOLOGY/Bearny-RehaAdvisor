import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';

import type { Intervention } from '@/types';
import StarRating, { getRatingFromDateEntry } from './StarRating';
import { getDateFnsLocale, LOCALE_MAP } from '@/utils/dateLocale';

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

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date, options) => startOfWeek(date, { weekStartsOn: 1, ...options }),
  getDay,
  locales: LOCALE_MAP,
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
  onSelectFeedback?: (it: Intervention, datetime?: string) => void;
}

const InterventionCalendar: React.FC<Props> = ({
  patientData,
  titleMap = {},
  onSelectIntervention,
  onSelectFeedback,
}) => {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = getDateFnsLocale(i18n.language);
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

  const eventPropGetter = (event: CalendarEvent) => {
    const status = event.resource?.status;
    if (status === 'completed') return { className: 'rehaEvent rehaEvent--completed' };
    if (status === 'missed') return { className: 'rehaEvent rehaEvent--missed' };
    if (status === 'today') return { className: 'rehaEvent rehaEvent--today' };
    if (status === 'upcoming') return { className: 'rehaEvent rehaEvent--upcoming' };
    return { className: 'rehaEvent' };
  };

  const sortedEvents = useMemo(() => {
    // Match the built-in agenda: 30-day window starting from `date`
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    return [...events]
      .filter((ev) => ev.start >= start && ev.start < end)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, date]);

  return (
    <div
      className={`rehaCalendar__body${view === Views.AGENDA ? ' rehaCalendar__body--agenda' : ''}`}
    >
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

      {view === Views.AGENDA && (
        <div className="overflow-y-auto max-h-full">
          <table className="w-full border-collapse text-sm mt-2">
            <thead>
              {(() => {
                const th =
                  'px-3 py-2 text-left font-semibold bg-gray-50 border-b-2 border-gray-200 align-middle';
                return (
                  <tr>
                    <th className={th}>{t('Date')}</th>
                    <th className={th}>{t('Time')}</th>
                    <th className={th}>{t('Event')}</th>
                    <th className={th}>{t('Rating')}</th>
                  </tr>
                );
              })()}
            </thead>
            <tbody>
              {sortedEvents.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                    {t('No entries found.')}
                  </td>
                </tr>
              )}
              {sortedEvents.map((ev) => {
                const rating = getRatingFromDateEntry(ev.resource.dateEntry);
                const status = ev.resource.status || '';
                const rowBg =
                  status === 'completed'
                    ? 'bg-green-500/10'
                    : status === 'missed'
                      ? 'bg-red-500/10'
                      : status === 'today'
                        ? 'bg-blue-500/10'
                        : '';
                return (
                  <tr
                    key={ev.id}
                    className={`cursor-pointer hover:bg-gray-500/5 ${rowBg}`}
                    onClick={() => onSelectIntervention?.(ev.resource.intervention)}
                  >
                    <td className="px-3 py-2 border-b border-chartMuted align-middle">
                      {(() => {
                        const s = format(ev.start, 'EEE, dd.MM.yyyy', { locale: dateFnsLocale });
                        return s.charAt(0).toUpperCase() + s.slice(1);
                      })()}
                    </td>
                    <td className="px-3 py-2 border-b border-chartMuted align-middle whitespace-nowrap tabular-nums">
                      {format(ev.start, 'HH:mm')} – {format(ev.end, 'HH:mm')}
                    </td>
                    <td className="px-3 py-2 border-b border-chartMuted align-middle">
                      {ev.title}
                    </td>
                    <td
                      className="px-3 py-2 border-b border-chartMuted align-middle"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectFeedback?.(
                          ev.resource.intervention,
                          ev.resource.dateEntry.datetime
                        );
                      }}
                    >
                      {rating !== null ? (
                        <StarRating value={rating} />
                      ) : (
                        <span className="text-chartMuted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InterventionCalendar;
