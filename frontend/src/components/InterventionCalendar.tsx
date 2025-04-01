import React, { useMemo, useState } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { parseISO, format } from 'date-fns';
import moment from 'moment';
import { Button } from 'react-bootstrap';
import { t} from 'i18next';

const localizer = momentLocalizer(moment);

interface InterventionCalendarProps {
  interventions: any[];
  onSelectEvent: (event: any) => void;
}

const InterventionCalendar: React.FC<InterventionCalendarProps> = ({
  interventions,
  onSelectEvent
}) => {
  const [view, setView] = useState(Views.AGENDA);

  const events = useMemo(() => {
    const allEvents = [];

    interventions.forEach((intervention) => {
      intervention.dates.forEach((entry: any) => {
        const baseDate = parseISO(entry.datetime);
        allEvents.push({
          title: intervention.title,
          start: baseDate,
          end: new Date(baseDate.getTime() + intervention.duration * 60 * 1000),
          status: entry.status,
          feedback: entry.feedback,
          _id: intervention._id,
        });
      });
    });

    return allEvents;
  }, [interventions]);

  const eventStyleGetter = (event: any) => {
    let backgroundColor = '#d3d3d3';
    if (event.status === 'completed') backgroundColor = '#28a745';
    if (event.status === 'missed') backgroundColor = '#dc3545';
    if (event.status === 'upcoming') backgroundColor = '#FFA500';
    if (event.status === 'today') backgroundColor = '#007bff';

    return {
      style: {
        backgroundColor,
        color: 'white',
        borderRadius: '5px',
        padding: '4px',
        margin: '2px 0',
        height: 'auto'
      }
    };
  };

  return (
    <div style={{ height: '80vh' }}>
      <Calendar
        localizer={localizer}
        events={events}
        views={['month', 'week', 'day', 'agenda']}
        view={view}
        onView={(v) => setView(v)}
        startAccessor="start"
        endAccessor="end"
        onSelectEvent={onSelectEvent}
        style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '10px' }}
        eventPropGetter={eventStyleGetter}
        formats={{
          dayFormat: (date, culture, localizer) => format(date, 'yyyy-MM-dd'),
          dayHeaderFormat: (date, culture, localizer) => format(date, 'yyyy-MM-dd'),
          agendaDateFormat: (date, culture, localizer) => format(date, 'yyyy-MM-dd'),
          agendaTimeFormat: (date, culture, localizer) => format(date, 'HH:mm'),
          timeGutterFormat: (date, culture, localizer) => format(date, 'HH:mm'),
          agendaHeaderFormat: ({ start, end }, culture, localizer) =>
            `${format(start, 'yyyy-MM-dd')} – ${format(end, 'yyyy-MM-dd')}`,
        }}
      />
    </div>
  );
};

export default InterventionCalendar;
