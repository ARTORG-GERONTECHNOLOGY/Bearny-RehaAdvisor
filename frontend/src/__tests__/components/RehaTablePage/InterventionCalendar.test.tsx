import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InterventionCalendar from '@/components/RehaTablePage/InterventionCalendar';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// react-big-calendar is not configured for Jest; replace with a no-op stub
// that still lets the agenda table render (the component renders it when
// view === AGENDA, which is the default).
jest.mock('react-big-calendar', () => {
  const Views = { MONTH: 'month', WEEK: 'week', DAY: 'day', AGENDA: 'agenda' };
  const Calendar = () => null;
  const dateFnsLocalizer = () => ({});
  return { Calendar, dateFnsLocalizer, Views };
});

jest.mock('react-big-calendar/lib/css/react-big-calendar.css', () => {});

const starAnswer = (key: number) => ({
  key: String(key),
  translations: [{ language: 'en', text: `${'★'.repeat(key)}${'☆'.repeat(5 - key)} (${key}/5)` }],
});

const TODAY = new Date();
TODAY.setHours(10, 0, 0, 0);

const makeIntervention = (datetime: Date, withRating: number | null = null) => ({
  _id: 'itv-1',
  title: 'Balance Training',
  duration: 30,
  dates: [
    {
      datetime: datetime.toISOString(),
      status: 'completed',
      feedback: withRating !== null ? [{ answer: [starAnswer(withRating)] }] : [],
    },
  ],
});

const makePatientData = (datetime: Date, withRating: number | null = null) => ({
  interventions: [makeIntervention(datetime, withRating)],
});

describe('InterventionCalendar agenda table', () => {
  it('renders the event row in the agenda table', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByText('Balance Training')).toBeInTheDocument();
  });

  it('shows "—" in the rating cell when there is no star feedback', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders SVG stars when star feedback is present', () => {
    const { container } = render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, 4) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    // StarRating renders `max` (5) SVG stars
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5);
  });

  it('calls onSelectFeedback with the intervention and datetime when the rating cell is clicked', () => {
    const onSelectFeedback = jest.fn();
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, 3) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={onSelectFeedback}
      />
    );

    // The rating cell contains the star rating aria-label
    const ratingCell = screen.getByLabelText('3/5').closest('td')!;
    fireEvent.click(ratingCell);

    expect(onSelectFeedback).toHaveBeenCalledTimes(1);
    const [intervention, datetime] = onSelectFeedback.mock.calls[0];
    expect(intervention._id).toBe('itv-1');
    expect(datetime).toBe(TODAY.toISOString());
  });

  it('does not call onSelectFeedback when the row (not rating cell) is clicked', () => {
    const onSelectFeedback = jest.fn();
    const onSelectIntervention = jest.fn();
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, 3) as any}
        onSelectIntervention={onSelectIntervention}
        onSelectFeedback={onSelectFeedback}
      />
    );

    fireEvent.click(screen.getByText('Balance Training'));

    expect(onSelectIntervention).toHaveBeenCalledTimes(1);
    expect(onSelectFeedback).not.toHaveBeenCalled();
  });

  it('shows the empty state message when no events fall in the 30-day window', () => {
    const past = new Date('2020-01-01T10:00:00');
    render(
      <InterventionCalendar
        patientData={makePatientData(past) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByText('No entries found.')).toBeInTheDocument();
  });
});
