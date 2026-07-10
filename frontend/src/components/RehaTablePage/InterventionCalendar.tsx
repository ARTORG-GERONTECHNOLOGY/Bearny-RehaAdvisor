import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';

import type { Intervention } from '@/types';
import StarRating, { getRatingFromDateEntry } from './StarRating';
import { getDateFnsLocale, LOCALE_MAP } from '@/utils/dateLocale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

  // Colors mirror the status legend
  const eventPropGetter = (event: CalendarEvent) => {
    const status = event.resource?.status;
    const base = '!rounded-lg';
    if (status === 'completed') return { className: `${base} !bg-ok/5 !text-ok` };
    if (status === 'missed') return { className: `${base} !bg-pink/5 !text-pink` };
    if (status === 'today') return { className: `${base} !bg-yellow/5 !text-yellow` };
    if (status === 'upcoming') return { className: `${base} !bg-chartMuted/5 !text-zinc-500` };
    return { className: base };
  };

  // RBC today's cell/column highlight color
  const dayPropGetter = (day: Date) => {
    const isToday = day.toDateString() === new Date().toDateString();
    return isToday ? { className: '!bg-yellow/5' } : {};
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
        dayPropGetter={dayPropGetter}
        onSelectEvent={(ev) => {
          if (onSelectIntervention) onSelectIntervention(ev.resource.intervention);
        }}
      />

      {view === Views.AGENDA && (
        <div className="overflow-y-auto max-h-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Date')}</TableHead>
                <TableHead>{t('Time')}</TableHead>
                <TableHead>{t('Event')}</TableHead>
                <TableHead>{t('Rating')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEvents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-zinc-500">
                    {t('No entries found.')}
                  </TableCell>
                </TableRow>
              )}
              {sortedEvents.map((ev) => {
                const rating = getRatingFromDateEntry(ev.resource.dateEntry);
                const status = ev.resource.status || '';
                const rowBg =
                  status === 'completed'
                    ? 'bg-ok/5 text-ok'
                    : status === 'missed'
                      ? 'bg-pink/5 text-pink'
                      : status === 'today'
                        ? 'bg-yellow/5 text-yellow'
                        : '';
                return (
                  <TableRow
                    key={ev.id}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer ${rowBg}`}
                    onClick={() => onSelectIntervention?.(ev.resource.intervention)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectIntervention?.(ev.resource.intervention);
                      }
                    }}
                  >
                    <TableCell>
                      {(() => {
                        const s = format(ev.start, 'EEE, dd.MM.yyyy', { locale: dateFnsLocale });
                        return s.charAt(0).toUpperCase() + s.slice(1);
                      })()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {format(ev.start, 'HH:mm')} – {format(ev.end, 'HH:mm')}
                    </TableCell>
                    <TableCell>{ev.title}</TableCell>
                    <TableCell
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default InterventionCalendar;
