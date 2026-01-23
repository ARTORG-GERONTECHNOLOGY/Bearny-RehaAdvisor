import React, { useMemo, useState } from 'react';
import { Button, ButtonGroup, Badge } from 'react-bootstrap';
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

type ColorMode = 'status' | 'benefit';

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
    benefitKey?: string;
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

// deterministic “bucket” for benefit → css var
const hashBucket = (s: string, buckets = 10) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % buckets;
};

interface Props {
  patientData: PatientPlan;
  titleMap?: TitleMap;
  onSelectIntervention?: (it: Intervention) => void;
}

const InterventionCalendar: React.FC<Props> = ({ patientData, titleMap = {}, onSelectIntervention }) => {
  const [view, setView] = useState<View>(Views.AGENDA);
  const [date, setDate] = useState<Date>(new Date());
  const [colorMode, setColorMode] = useState<ColorMode>('status');

  const events: CalendarEvent[] = useMemo(() => {
    const planItems = Array.isArray(patientData?.interventions) ? patientData.interventions : [];
    const out: CalendarEvent[] = [];

    for (const it of planItems as any[]) {
      const dates: DateEntry[] = Array.isArray(it?.dates) ? it.dates : [];
      const durationMinRaw = Number(it?.duration);
      const durationMin = Number.isFinite(durationMinRaw) && durationMinRaw > 0 ? durationMinRaw : 30;

      const displayTitle = titleMap[it._id]?.title || it.title;

      // benefitFor can be array or string in your system; normalize
      const benefitArr: string[] = Array.isArray(it?.benefitFor)
        ? it.benefitFor.map(String)
        : it?.benefitFor
          ? [String(it.benefitFor)]
          : [];

      // Use first benefit as primary key for coloring
      const benefitKey = benefitArr[0] || 'benefit_unknown';

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
            benefitKey,
          },
        });
      }
    }

    return out;
  }, [patientData, titleMap]);

  // legend content
  const legend = useMemo(() => {
    if (colorMode === 'status') {
      return (
        <div className="rehaLegend">
          <span className="rehaLegend__label">Status:</span>
          <span className="rehaLegend__item rehaLegend__item--completed">✓ Abgeschlossen</span>
          <span className="rehaLegend__item rehaLegend__item--missed">✕ Verpasst</span>
          <span className="rehaLegend__item rehaLegend__item--today">● Heute</span>
          <span className="rehaLegend__item rehaLegend__item--upcoming">○ Bevorstehend</span>
        </div>
      );
    }

    // benefit legend: show distinct benefits in range (cap)
    const keys = Array.from(new Set(events.map((e) => e.resource.benefitKey).filter(Boolean))) as string[];
    const shown = keys.slice(0, 8);

    return (
      <div className="rehaLegend">
        <span className="rehaLegend__label">Benefit:</span>
        {shown.map((k) => {
          const b = hashBucket(k, 10);
          return (
            <span key={k} className={`rehaLegend__item rehaLegend__item--benefit`} style={{ ['--benefit-bucket' as any]: b }}>
              {k === 'benefit_unknown' ? 'Unknown' : k}
            </span>
          );
        })}
        {keys.length > shown.length ? <span className="rehaLegend__more">…</span> : null}
      </div>
    );
  }, [colorMode, events]);

  const eventPropGetter = (event: CalendarEvent) => {
    if (colorMode === 'status') {
      const status = event.resource?.status;
      if (status === 'completed') return { className: 'rehaEvent rehaEvent--completed' };
      if (status === 'missed') return { className: 'rehaEvent rehaEvent--missed' };
      if (status === 'today') return { className: 'rehaEvent rehaEvent--today' };
      if (status === 'upcoming') return { className: 'rehaEvent rehaEvent--upcoming' };
      return { className: 'rehaEvent' };
    }

    const key = event.resource?.benefitKey || 'benefit_unknown';
    const bucket = hashBucket(key, 10);
    return {
      className: 'rehaEvent rehaEvent--benefit',
      style: { ['--benefit-bucket' as any]: bucket },
    };
  };

  return (
    <div className="rehaCalendar">
      <div className="rehaCalendar__topbar">
        <div className="rehaCalendar__controls">
          <span className="me-2">Color by</span>
          <ButtonGroup size="sm" aria-label="Color mode">
            <Button
              variant={colorMode === 'status' ? 'dark' : 'outline-dark'}
              onClick={() => setColorMode('status')}
            >
              Status
            </Button>
            <Button
              variant={colorMode === 'benefit' ? 'dark' : 'outline-dark'}
              onClick={() => setColorMode('benefit')}
            >
              Benefit
            </Button>
          </ButtonGroup>
        </div>

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
