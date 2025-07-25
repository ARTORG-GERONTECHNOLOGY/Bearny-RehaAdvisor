// InterventionCalendar.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { parseISO, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { de, fr, enGB, it } from 'date-fns/locale';
import moment from 'moment';
import { translateText } from '../../utils/translate';
import { Button, Spinner } from 'react-bootstrap';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const localeMap = { de, fr, en: enGB, it };

const InterventionCalendar = ({ interventions, onSelectEvent }) => {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language || 'en';
  const currentLocale = localeMap[currentLang] || enGB;
  const localizer = momentLocalizer(moment);
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState(Views.AGENDA);
  const [translatedTitles, setTranslatedTitles] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const translateTitles = async () => {
      setLoading(true);
      const result = {};
      for (const i of interventions) {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(i.title, currentLang);
          result[i._id] = { text: translatedText, from: detectedSourceLanguage };
        } catch {
          result[i._id] = { text: i.title, from: null };
        }
      }
      setTranslatedTitles(result);
      setLoading(false);
    };

    translateTitles();
  }, [interventions, currentLang]);

  const events = useMemo(() => {
    return interventions.flatMap((intervention) => {
      const titleInfo = translatedTitles[intervention._id];
      const translatedTitle = titleInfo?.text || intervention.title;
      const langSuffix = titleInfo?.from ? ` (${t('Original language:')} ${titleInfo.from})` : '';

      return intervention.dates.map((entry) => {
        const baseDate = parseISO(entry.datetime);
        return {
          title: translatedTitle + langSuffix,
          start: baseDate,
          end: new Date(baseDate.getTime() + intervention.duration * 60000),
          status: entry.status,
          feedback: entry.feedback,
          _id: intervention._id,
        };
      });
    });
  }, [interventions, translatedTitles, t]);

  const handleNavigate = (newDate) => setDate(newDate);

  const exportToCSV = () => {
    const data = events.map((e) => ({
      title: e.title,
      start: format(e.start, 'yyyy-MM-dd HH:mm'),
      end: format(e.end, 'yyyy-MM-dd HH:mm'),
      status: e.status,
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, 'interventions_export.csv');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Intervention Schedule', 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Title', 'Start', 'End', 'Status']],
      body: events.map((e) => [
        e.title,
        format(e.start, 'yyyy-MM-dd HH:mm'),
        format(e.end, 'yyyy-MM-dd HH:mm'),
        e.status,
      ]),
    });
    doc.save('interventions_export.pdf');
  };

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
      {/* Inline CSS for Floating Button */}
      <style>{`
        .floating-toggle {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 1000;
          display: none;
        }

        @media (max-width: 768px) {
          .floating-toggle {
            display: block;
          }
        }
      `}</style>

      {/* Export Buttons */}
      <div className="d-flex justify-content-end gap-2 mb-2">
        <Button size="sm" variant="outline-primary" onClick={exportToCSV}>
          📤 {t('Export CSV')}
        </Button>
        <Button size="sm" variant="outline-danger" onClick={exportToPDF}>
          🧾 {t('Export PDF')}
        </Button>
      </div>

      {/* Main Calendar */}
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
        components={{ month: { event: renderMonthEvent } }}
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

      {/* Floating View Toggle Button (Mobile) */}
      <div className="floating-toggle">
        <Button
          variant="dark"
          size="sm"
          onClick={() => setView((prev) => (prev === 'week' ? 'agenda' : 'week'))}
        >
          {view === 'week' ? t('Switch to Agenda') : t('Switch to Week')}
        </Button>
      </div>
    </div>
  );
};

export default InterventionCalendar;
