import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { parseISO, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { de, fr, enGB, it } from 'date-fns/locale';
import moment from 'moment';
import { translateText } from '../../utils/translate'; // make sure this path is correct

const localeMap = { de, fr, en: enGB, it };

const InterventionCalendar = ({ interventions, onSelectEvent }) => {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language || 'en';
  const currentLocale = localeMap[currentLang] || enGB;
  const localizer = momentLocalizer(moment);
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState(Views.AGENDA);
  const [translatedTitles, setTranslatedTitles] = useState({});

  // Translate all titles on mount or when interventions change
  useEffect(() => {
    const translateTitles = async () => {
      const result = {};
      for (const i of interventions) {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(i.title);
          result[i._id] = {
            text: translatedText,
            from: detectedSourceLanguage,
          };
        } catch {
          result[i._id] = { text: i.title, from: null };
        }
      }
      setTranslatedTitles(result);
    };

    translateTitles();
  }, [interventions]);

  const events = useMemo(() => {
    const evts = [];
    interventions.forEach((intervention) => {
      const titleInfo = translatedTitles[intervention._id];
      const translatedTitle = titleInfo?.text || intervention.title;
      const langSuffix = titleInfo?.from ? ` (${t('Original language:')} ${titleInfo.from})` : '';

      intervention.dates.forEach((entry) => {
        const baseDate = parseISO(entry.datetime);
        evts.push({
          title: translatedTitle,
          start: baseDate,
          end: new Date(baseDate.getTime() + intervention.duration * 60000),
          status: entry.status,
          feedback: entry.feedback,
          _id: intervention._id,
        });
      });
    });
    return evts;
  }, [interventions, translatedTitles, t]);

  const handleNavigate = (newDate) => setDate(newDate);

  const calendarMessages = {
    today: t('Calendar.today'),
    previous: t('Calendar.previous'),
    next: t('Calendar.next'),
    month: t('Calendar.month'),
    week: t('Calendar.week'),
    day: t('Calendar.day'),
    agenda: t('Calendar.agenda'),
    showMore: (count) => t('Calendar.showMore', { count }),
  };

  const renderMonthEvent = ({ event }) => (
    <div
      style={{
        backgroundColor:
          event.status === 'completed'
            ? '#28a745'
            : event.status === 'missed'
              ? '#dc3545'
              : event.status === 'upcoming'
                ? '#FFA500'
                : '#007bff',
        color: 'white',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={event.title}
    >
      {event.title}
    </div>
  );

  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor:
        event.status === 'completed'
          ? '#28a745'
          : event.status === 'missed'
            ? '#dc3545'
            : event.status === 'upcoming'
              ? '#FFA500'
              : '#007bff',
      color: 'white',
      borderRadius: '5px',
      padding: '4px',
      margin: '2px 0',
    },
  });

  return (
    <div style={{ height: '80vh' }}>
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
        messages={calendarMessages}
        components={{
          month: {
            event: renderMonthEvent,
          },
        }}
        formats={{
          dayFormat: (date) => format(date, 'PP', { locale: currentLocale }),
          dayHeaderFormat: (date) => format(date, 'PPPP', { locale: currentLocale }),
          agendaDateFormat: (date) => format(date, 'PP', { locale: currentLocale }),
          agendaTimeFormat: (date) => format(date, 'p', { locale: currentLocale }),
          timeGutterFormat: (date) => format(date, 'p', { locale: currentLocale }),
          eventTimeRangeFormat: () => '',
          agendaHeaderFormat: ({ start, end }) =>
            `${format(start, 'P', { locale: currentLocale })} – ${format(end, 'P', { locale: currentLocale })}`,
        }}
      />
    </div>
  );
};

export default InterventionCalendar;
