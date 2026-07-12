import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InterventionCalendar from '@/components/RehaTablePage/InterventionCalendar';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// react-big-calendar is not configured for Jest; replace with a stub that still
// invokes the props InterventionCalendar passes in (eventPropGetter, dayPropGetter,
// onSelectEvent, onEventDrop, draggableAccessor, onNavigate, onView), exposing
// enough via buttons/data attributes to exercise and assert on that wiring.
jest.mock('react-big-calendar', () => {
  const Views = { MONTH: 'month', WEEK: 'week', DAY: 'day', AGENDA: 'agenda' };
  const Calendar = (props: any) => {
    const firstEvent = props.events?.[0];
    const eventProps = firstEvent ? props.eventPropGetter?.(firstEvent) : undefined;
    const dayProps = props.dayPropGetter?.(new Date());
    return (
      <div data-testid="mock-calendar">
        <div data-testid="event-count">{props.events?.length ?? 0}</div>
        <div data-testid="event-classname">{eventProps?.className}</div>
        <div data-testid="day-classname">{dayProps?.className ?? ''}</div>
        <div data-testid="draggable">
          {firstEvent ? String(props.draggableAccessor?.(firstEvent)) : ''}
        </div>
        <div data-testid="resizable">{String(props.resizable)}</div>
        <div data-testid="resizable-accessor">{String(props.resizableAccessor?.())}</div>

        {firstEvent && (
          <button onClick={() => props.onSelectEvent?.(firstEvent)}>select event</button>
        )}
        {firstEvent && (
          <button
            onClick={() =>
              props.onEventDrop?.({
                event: firstEvent,
                start: new Date(firstEvent.start.getTime() + 60 * 60_000),
                end: new Date(firstEvent.end.getTime() + 60 * 60_000),
              })
            }
          >
            drop event
          </button>
        )}
        <button onClick={() => props.onNavigate?.(new Date('2030-06-15T00:00:00'))}>
          navigate
        </button>
        <button onClick={() => props.onView?.('month')}>switch to month</button>
      </div>
    );
  };
  const dateFnsLocalizer = () => ({});
  return { Calendar, dateFnsLocalizer, Views };
});

jest.mock('react-big-calendar/lib/addons/dragAndDrop', () => (Calendar: any) => Calendar);

jest.mock('react-big-calendar/lib/css/react-big-calendar.css', () => {});
jest.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => {});

const starAnswer = (key: number) => ({
  key: String(key),
  translations: [{ language: 'en', text: `${'★'.repeat(key)}${'☆'.repeat(5 - key)} (${key}/5)` }],
});

const TODAY = new Date();
TODAY.setHours(10, 0, 0, 0);

const makeIntervention = (
  datetime: Date,
  withRating: number | null = null,
  overrides: Record<string, any> = {}
) => ({
  _id: 'itv-1',
  title: 'Balance Training',
  duration: 30,
  dates: [
    {
      datetime: datetime.toISOString(),
      status: 'completed',
      feedback: withRating !== null ? [{ answer: [starAnswer(withRating)] }] : [],
      ...overrides,
    },
  ],
});

const makePatientData = (
  datetime: Date,
  withRating: number | null = null,
  overrides: Record<string, any> = {}
) => ({
  interventions: [makeIntervention(datetime, withRating, overrides)],
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

  it('selects the intervention via Enter/Space on the row', () => {
    const onSelectIntervention = jest.fn();
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={onSelectIntervention}
        onSelectFeedback={jest.fn()}
      />
    );
    const row = screen.getByText('Balance Training').closest('[role="button"]')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelectIntervention).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(row, { key: ' ' });
    expect(onSelectIntervention).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated keys on the row', () => {
    const onSelectIntervention = jest.fn();
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={onSelectIntervention}
        onSelectFeedback={jest.fn()}
      />
    );
    const row = screen.getByText('Balance Training').closest('[role="button"]')!;
    fireEvent.keyDown(row, { key: 'Tab' });
    expect(onSelectIntervention).not.toHaveBeenCalled();
  });

  it('ignores an intervention whose dates entry has an unparsable datetime', () => {
    render(
      <InterventionCalendar
        patientData={
          { interventions: [{ _id: 'itv-2', title: 'Bad Date', dates: [{ datetime: 'not-a-date' }] }] } as any
        }
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.queryByText('Bad Date')).not.toBeInTheDocument();
    expect(screen.getByText('No entries found.')).toBeInTheDocument();
  });

  it('falls back gracefully when patientData.interventions is missing', () => {
    render(
      <InterventionCalendar
        patientData={{} as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByText('No entries found.')).toBeInTheDocument();
  });

  it('uses the translated title from titleMap when available', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        titleMap={{ 'itv-1': { title: 'Gleichgewichtstraining', lang: 'de' } }}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByText('Gleichgewichtstraining')).toBeInTheDocument();
  });
});

describe('InterventionCalendar big-calendar wiring', () => {
  it('colors a completed event and marks it non-draggable', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'completed' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByTestId('event-classname')).toHaveTextContent('!bg-ok/10 !text-ok');
    expect(screen.getByTestId('draggable')).toHaveTextContent('false');
  });

  it('colors a missed event', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'missed' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByTestId('event-classname')).toHaveTextContent('!bg-pink/20 !text-pink');
  });

  it('colors a today event and marks it draggable', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'today' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByTestId('event-classname')).toHaveTextContent('!bg-yellow/15 !text-yellow');
    expect(screen.getByTestId('draggable')).toHaveTextContent('true');
  });

  it('colors an upcoming event and marks it draggable', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'upcoming' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByTestId('event-classname')).toHaveTextContent(
      '!bg-chartMuted/50 !text-zinc-500'
    );
    expect(screen.getByTestId('draggable')).toHaveTextContent('true');
  });

  it('applies no status color for an unknown status', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'weird' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByTestId('event-classname')).not.toHaveTextContent('!bg-');
  });

  it('highlights the current day via dayPropGetter', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByTestId('day-classname')).toHaveTextContent('!bg-yellow/10');
  });

  it('disables resizing entirely', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByTestId('resizable')).toHaveTextContent('false');
    expect(screen.getByTestId('resizable-accessor')).toHaveTextContent('false');
  });

  it('calls onSelectIntervention when an event is selected on the calendar', () => {
    const onSelectIntervention = jest.fn();
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={onSelectIntervention}
        onSelectFeedback={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('select event'));
    expect(onSelectIntervention).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'itv-1' })
    );
  });

  it('reschedules a draggable event via onRescheduleEvent and clears the pending move', async () => {
    const onRescheduleEvent = jest.fn().mockResolvedValue(true);
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'today' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
        onRescheduleEvent={onRescheduleEvent}
      />
    );

    fireEvent.click(screen.getByText('drop event'));

    await screen.findByTestId('mock-calendar');
    expect(onRescheduleEvent).toHaveBeenCalledWith(
      'itv-1',
      TODAY.toISOString(),
      expect.any(Date)
    );
  });

  it('does not reschedule a non-draggable (completed) event on drop', () => {
    const onRescheduleEvent = jest.fn();
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'completed' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
        onRescheduleEvent={onRescheduleEvent}
      />
    );

    fireEvent.click(screen.getByText('drop event'));
    expect(onRescheduleEvent).not.toHaveBeenCalled();
  });

  it('swallows an error from onRescheduleEvent without crashing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onRescheduleEvent = jest.fn().mockRejectedValue(new Error('network down'));
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY, null, { status: 'today' }) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
        onRescheduleEvent={onRescheduleEvent}
      />
    );

    fireEvent.click(screen.getByText('drop event'));
    await screen.findByTestId('mock-calendar');

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to reschedule intervention:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('navigating changes the agenda window (event moves out of view)', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByText('Balance Training')).toBeInTheDocument();

    fireEvent.click(screen.getByText('navigate'));

    expect(screen.queryByText('Balance Training')).not.toBeInTheDocument();
    expect(screen.getByText('No entries found.')).toBeInTheDocument();
  });

  it('switching the view away from Agenda hides the agenda table', () => {
    render(
      <InterventionCalendar
        patientData={makePatientData(TODAY) as any}
        onSelectIntervention={jest.fn()}
        onSelectFeedback={jest.fn()}
      />
    );
    expect(screen.getByText('Balance Training')).toBeInTheDocument();

    fireEvent.click(screen.getByText('switch to month'));

    expect(screen.queryByText('Balance Training')).not.toBeInTheDocument();
  });
});
