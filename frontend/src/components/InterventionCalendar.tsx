import React, { useMemo, useState } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { parseISO, format } from 'date-fns';
import { Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { de, fr, enGB, it } from 'date-fns/locale';
import moment from 'moment';
import 'moment/locale/fr';
import 'moment/locale/de';
import 'moment/locale/it';


const localeMap = {
  de: de,
  fr: fr,
  en: enGB,
  it: it
  // Add more as needed
};




interface InterventionCalendarProps {
  interventions: any[];
  onSelectEvent: (event: any) => void;
}

const InterventionCalendar: React.FC<InterventionCalendarProps> = ({
  interventions,
  onSelectEvent
}) => {
  const { i18n } = useTranslation();

  // Only allow the supported locales
  const supportedLocales = ['en', 'fr', 'de', 'it'];
  const localeToUse = supportedLocales.includes(i18n.language) ? i18n.language : 'en';
  const [date, setDate] = useState(new Date());
  const handleNavigate = (newDate) => {
    setDate(newDate);
  };
  
  moment.locale(localeToUse);
  const localizer = momentLocalizer(moment);
  const [view, setView] = useState(Views.AGENDA);
  const { t } = useTranslation();
  const currentLang = t.language || 'en';
  const currentLocale = localeMap[currentLang] || enGB;
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
      date={date} // ← required for navigation
      onNavigate={handleNavigate} // ← handle date changes
      views={['month', 'week', 'day', 'agenda']}
      view={view}
      onView={(v) => setView(v)}
      startAccessor="start"
      endAccessor="end"
      onSelectEvent={onSelectEvent}
      style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '10px' }}
      eventPropGetter={eventStyleGetter}
      messages={calendarMessages}
      formats={{
        dayFormat: (date) => format(date, 'PP', { locale: currentLocale }),
        dayHeaderFormat: (date) => format(date, 'PPPP', { locale: currentLocale }),
        agendaDateFormat: (date) => format(date, 'PP', { locale: currentLocale }),
        agendaTimeFormat: (date) => format(date, 'p', { locale: currentLocale }),
        timeGutterFormat: (date) => format(date, 'p', { locale: currentLocale }),
        agendaHeaderFormat: ({ start, end }) =>
          `${format(start, 'P', { locale: currentLocale })} – ${format(end, 'P', { locale: currentLocale })}`,
      }}
    />

    </div>
  );
};

export default InterventionCalendar;
