import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
let mockInterventionId = 'int-1';
let mockSearchParams = new URLSearchParams('date=2026-03-16');

jest.mock('mobx-react-lite', () => ({
  observer: (component: any) => component,
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ interventionId: mockInterventionId }),
    useSearchParams: () => [mockSearchParams],
  };
});

jest.mock('react-bootstrap', () => ({
  OverlayTrigger: function OverlayTrigger({ children }: any) {
    return <>{children}</>;
  },
  Tooltip: function Tooltip({ children }: any) {
    return <span>{children}</span>;
  },
  Tab: Object.assign(
    function Tab({ children }: any) {
      return <>{children}</>;
    },
    {
      Container: function TabContainer({ children }: any) {
        return <>{children}</>;
      },
      Content: function TabContent({ children }: any) {
        return <>{children}</>;
      },
      Pane: function TabPane({ children }: any) {
        return <>{children}</>;
      },
    }
  ),
  Nav: Object.assign(
    function Nav({ children }: any) {
      return <>{children}</>;
    },
    {
      Item: function NavItem({ children }: any) {
        return <>{children}</>;
      },
      Link: function NavLink({ children, onClick }: any) {
        return <button onClick={onClick}>{children}</button>;
      },
    }
  ),
}));

jest.mock('react-icons/fa', () => ({
  FaLock: function FaLock() {
    return <span data-testid="fa-lock" />;
  },
}));

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: jest.requireActual('@/__mocks__/components/Layout').default,
}));

jest.mock(
  '@/components/common/ErrorAlert',
  () =>
    function ErrorAlert({ message, onClose }: any) {
      return (
        <div>
          <span>{message}</span>
          <button onClick={onClose}>close-error</button>
        </div>
      );
    }
);

jest.mock(
  '@/components/PatientPage/FeedbackPopup',
  () =>
    function FeedbackPopup(props: any) {
      return <div data-testid="feedback-popup">{props.interventionId}</div>;
    }
);

jest.mock('@/components/common/PlayableMedia', () => ({
  PlayableMedia: function PlayableMedia({ label, m }: any) {
    return (
      <div data-testid="playable-media">
        {label}:{m.media_type}
      </div>
    );
  },
}));

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn(async (text: string) => ({
    translatedText: text,
    detectedSourceLanguage: '',
  })),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(async () => {}),
    isAuthenticated: true,
    userType: 'Patient',
    id: 'patient-1',
    getStoredUserId: jest.fn(function (this: { id: string }) {
      return this.id || localStorage.getItem('id') || '';
    }),
  },
}));

jest.mock('@/stores/patientInterventionsStore', () => ({
  patientInterventionsStore: {
    items: [],
    fetchPlan: jest.fn(async () => {}),
    isCompletedOn: jest.fn(() => false),
    toggleCompleted: jest.fn(async () => ({ completed: false, dateKey: '2026-03-16' })),
  },
}));

jest.mock('@/stores/patientQuestionnairesStore', () => ({
  patientQuestionnairesStore: {
    showFeedbackPopup: false,
    feedbackInterventionId: '',
    feedbackDateKey: '',
    feedbackQuestions: [],
    openInterventionFeedback: jest.fn(async () => {}),
    closeFeedback: jest.fn(),
  },
}));

jest.mock('@/stores/interventionsLibraryStore', () => ({
  patientInterventionsLibraryStore: {
    visibleItemsForPatient: [],
    fetchAll: jest.fn(async () => {}),
  },
}));

const mockApiPost = jest.fn().mockResolvedValue({});
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockApiPost(...args),
    get: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import PatientInterventionDetail from '@/pages/PatientInterventionDetail';
import authStore from '@/stores/authStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';
import { translateText } from '@/utils/translate';

const buildRec = (overrides: any = {}) => ({
  intervention_id: 'int-1',
  intervention_title: 'Morning Stretch',
  description: 'Daily movement routine',
  dates: ['2026-03-16'],
  intervention: {
    _id: 'int-1',
    aim: 'Exercise',
    duration_bucket: '5-10 min',
    topic: ['mobility'],
    media: [
      {
        kind: 'external',
        media_type: 'video',
        url: 'https://example.com/video.mp4',
        title: 'Video A',
      },
      {
        kind: 'external',
        media_type: 'website',
        url: 'https://example.com/page',
        title: 'Page A',
      },
      {
        kind: 'external',
        media_type: 'website',
        url: 'https://example.com/page',
        title: 'Page A duplicate',
      },
    ],
  },
  ...overrides,
});

describe('PatientInterventionDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    localStorage.clear();
    localStorage.setItem('id', 'patient-1');

    mockInterventionId = 'int-1';
    mockSearchParams = new URLSearchParams('date=2026-03-16');

    (authStore as any).isAuthenticated = true;
    (authStore as any).userType = 'Patient';

    (patientInterventionsStore as any).items = [buildRec()];
    (patientInterventionsStore as any).isCompletedOn.mockReturnValue(false);

    (patientQuestionnairesStore as any).showFeedbackPopup = false;
    (patientQuestionnairesStore as any).feedbackInterventionId = '';
    (patientQuestionnairesStore as any).feedbackDateKey = '';
    (patientQuestionnairesStore as any).feedbackQuestions = [];

    (patientInterventionsLibraryStore as any).visibleItemsForPatient = [];
  });

  it('redirects to root when user is not authenticated as a patient', async () => {
    (authStore as any).isAuthenticated = false;

    render(<PatientInterventionDetail />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows not-found state when no matching intervention exists', async () => {
    (patientInterventionsStore as any).items = [];
    (patientInterventionsLibraryStore as any).visibleItemsForPatient = [];

    render(<PatientInterventionDetail />);

    expect(await screen.findByText('Intervention not found.')).toBeInTheDocument();
  });

  it('renders intervention content and deduplicated open links', async () => {
    render(<PatientInterventionDetail />);

    expect(await screen.findByText('Morning Stretch')).toBeInTheDocument();
    expect(screen.getByText('Daily movement routine')).toBeInTheDocument();
    expect(screen.getByText('Exercise')).toBeInTheDocument();

    // Only renderable media types are shown inline (video, audio, streaming, pdf, image).
    expect(screen.getAllByTestId('playable-media')).toHaveLength(1);

    // Video is excluded from Open link buttons (already shown by embedded player).
    // The duplicate website URL is also removed — only one link remains.
    const openLinks = screen.getAllByRole('link', { name: /Open link:/i });
    expect(openLinks).toHaveLength(1);
    expect(openLinks[0]).toHaveAttribute('href', 'https://example.com/page');
  });

  it('video and audio media types do not get Open link buttons', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Exercise',
          media: [
            {
              kind: 'external',
              media_type: 'video',
              url: 'https://example.com/vid.mp4',
              title: 'Vid',
            },
            {
              kind: 'external',
              media_type: 'audio',
              url: 'https://example.com/aud.mp3',
              title: 'Aud',
            },
            {
              kind: 'external',
              media_type: 'streaming',
              url: 'https://spotify.com/track/1',
              title: 'Stream',
            },
          ],
        },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.queryAllByRole('link', { name: /Open link:/i })).toHaveLength(0);
  });

  it('toggles completion and opens intervention feedback when marked done', async () => {
    (patientInterventionsStore as any).toggleCompleted.mockResolvedValue({
      completed: true,
      dateKey: '2026-03-16',
    });

    render(<PatientInterventionDetail />);

    const markDoneButton = await screen.findByRole('button', { name: /Mark as done/i });
    fireEvent.click(markDoneButton);

    await waitFor(() => {
      expect((patientInterventionsStore as any).toggleCompleted).toHaveBeenCalled();
    });

    expect((patientInterventionsStore as any).toggleCompleted).toHaveBeenCalledWith(
      'patient-1',
      expect.objectContaining({ intervention_id: 'int-1' }),
      expect.any(Date)
    );

    expect((patientQuestionnairesStore as any).openInterventionFeedback).toHaveBeenCalledWith(
      'patient-1',
      'int-1',
      '2026-03-16',
      'en'
    );
  });

  it('renders without crashing when intervention aim is null ("Benvenuti in Fase III" case)', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention_title: 'Benvenuti in Fase III',
        intervention: {
          _id: 'int-1',
          aim: null,
          media: [],
        },
      }),
    ];

    render(<PatientInterventionDetail />);

    expect(await screen.findByText('Benvenuti in Fase III')).toBeInTheDocument();
    // aim badge renders without throwing
    expect(screen.queryByText('Exercise')).not.toBeInTheDocument();
  });

  it('renders without crashing when intervention aim is undefined', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          // aim intentionally omitted
          media: [],
        },
      }),
    ];

    render(<PatientInterventionDetail />);

    expect(await screen.findByText('Morning Stretch')).toBeInTheDocument();
  });

  it('posts intervention view duration to backend on unmount', async () => {
    (patientInterventionsStore as any).items = [buildRec()];

    const { unmount } = render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    // Advance real time so seconds_viewed > 0 (component reads Date.now())
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);

    unmount();

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringContaining('/patients/vitals/intervention-view/'),
        expect.objectContaining({
          intervention_id: 'int-1',
          seconds_viewed: expect.any(Number),
        })
      );
    });

    jest.restoreAllMocks();
  });

  // --- Tests for the Sentry removeChild fix ---

  it('shows private lock icon when intervention is marked private', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: { _id: 'int-1', aim: 'Exercise', media: [], is_private: true },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getByTestId('fa-lock')).toBeInTheDocument();
  });

  it('does not show lock icon when intervention is not private', async () => {
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.queryByTestId('fa-lock')).not.toBeInTheDocument();
  });

  it('displays translated title when translation returns different text', async () => {
    (translateText as jest.Mock).mockImplementation(async (text: string) => {
      if (text === 'Morning Stretch') {
        return { translatedText: 'Morgenstreckung', detectedSourceLanguage: 'en' };
      }
      return { translatedText: text, detectedSourceLanguage: '' };
    });

    render(<PatientInterventionDetail />);

    await waitFor(() => {
      expect(screen.getByText('Morgenstreckung')).toBeInTheDocument();
    });
  });

  it('displays translated description when translation returns different text', async () => {
    (translateText as jest.Mock).mockImplementation(async (text: string) => {
      if (text === 'Daily movement routine') {
        return { translatedText: 'Tägliche Bewegungsroutine', detectedSourceLanguage: 'en' };
      }
      return { translatedText: text, detectedSourceLanguage: '' };
    });

    render(<PatientInterventionDetail />);

    await waitFor(() => {
      expect(screen.getByText('Tägliche Bewegungsroutine')).toBeInTheDocument();
    });
  });

  it('alive guard: resolving translation after unmount does not throw', async () => {
    // Simulate slow translation — resolve it only after component unmounts.
    // The alive guard in the useEffect should prevent stale setState calls.
    const resolvers: Array<(v: any) => void> = [];
    (translateText as jest.Mock).mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve))
    );

    const { unmount } = render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    unmount();

    // Resolve all pending translation promises after unmount — must not throw.
    await act(async () => {
      for (const resolve of resolvers) {
        resolve({ translatedText: 'Translated text', detectedSourceLanguage: 'en' });
      }
    });
  });

  // --- Behavior change aim tests (issue #413) ---

  it('shows "Mark as viewed" button for behavior change interventions', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: { _id: 'int-1', aim: 'Behavior change', media: [] },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getByRole('button', { name: /Mark as viewed/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark as done/i })).not.toBeInTheDocument();
  });

  it('shows "Mark as done" button for non-behavior-change interventions', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: { _id: 'int-1', aim: 'Education', media: [] },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getByRole('button', { name: /Mark as done/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark as viewed/i })).not.toBeInTheDocument();
  });

  it('shows "Viewed" for a completed behavior change intervention', async () => {
    (patientInterventionsStore as any).isCompletedOn.mockReturnValue(true);
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: { _id: 'int-1', aim: 'Behavior change', media: [] },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getByRole('button', { name: /Viewed/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Done/i })).not.toBeInTheDocument();
  });

  it('shows "Done" for a completed non-behavior-change intervention', async () => {
    (patientInterventionsStore as any).isCompletedOn.mockReturnValue(true);
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: { _id: 'int-1', aim: 'Exercise', media: [] },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Viewed/i })).not.toBeInTheDocument();
  });

  it('behavior change "Mark as viewed" still toggles completion and opens feedback', async () => {
    (patientInterventionsStore as any).toggleCompleted.mockResolvedValue({
      completed: true,
      dateKey: '2026-03-16',
    });
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: { _id: 'int-1', aim: 'Behavior change', media: [] },
      }),
    ];

    render(<PatientInterventionDetail />);

    const markViewedButton = await screen.findByRole('button', { name: /Mark as viewed/i });
    fireEvent.click(markViewedButton);

    await waitFor(() => {
      expect((patientInterventionsStore as any).toggleCompleted).toHaveBeenCalled();
    });

    expect((patientQuestionnairesStore as any).openInterventionFeedback).toHaveBeenCalledWith(
      'patient-1',
      'int-1',
      '2026-03-16',
      'en'
    );
  });

  it('shows an error and stops loading when there is no patient id', async () => {
    // The mock's getStoredUserId() falls back to `this.id` before localStorage,
    // so both sources must be cleared — and `id` restored after, since it's a
    // shared field on the singleton mock reused by every other test.
    localStorage.removeItem('id');
    const originalId = (authStore as any).id;
    (authStore as any).id = '';

    render(<PatientInterventionDetail />);

    expect(await screen.findByText('Patient not found.')).toBeInTheDocument();

    (authStore as any).id = originalId;
  });

  it('falls back to the library store when no patientInterventionsStore record matches', async () => {
    (patientInterventionsStore as any).items = [];
    (patientInterventionsLibraryStore as any).visibleItemsForPatient = [
      {
        _id: 'int-1',
        title: 'Library Item Title',
        description: 'From the library',
        aims: ['Education'],
        media: [],
      },
    ];

    render(<PatientInterventionDetail />);

    expect(await screen.findByText('Library Item Title')).toBeInTheDocument();
    expect(screen.getByText('From the library')).toBeInTheDocument();
  });

  it('renders a PDF via an iframe and an image via an img tag', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media: [
            { kind: 'external', media_type: 'pdf', url: 'https://example.com/doc.pdf', title: 'Doc' },
          ],
        },
      }),
    ];

    const { rerender } = render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByTitle('Doc')).toBeInTheDocument();

    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media: [
            { kind: 'external', media_type: 'image', url: 'https://example.com/pic.png', title: 'Pic' },
          ],
        },
      }),
    ];
    mockInterventionId = 'int-1';
    rerender(<PatientInterventionDetail />);
    await waitFor(() => expect(screen.getByAltText('Pic')).toBeInTheDocument());
  });

  it('renders a tabbed view when there are multiple renderable media items', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Exercise',
          media: [
            { kind: 'external', media_type: 'video', url: 'https://example.com/v.mp4', title: 'Vid' },
            { kind: 'external', media_type: 'audio', url: 'https://example.com/a.mp3', title: 'Aud' },
          ],
        },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getAllByTestId('playable-media')).toHaveLength(2);
    // Nav.Link tab buttons for each media item
    expect(screen.getByRole('button', { name: 'Vid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aud' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aud' }));
  });

  it('falls back to legacy link/media_file fields when no media array is present', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          link: 'https://youtube.com/watch?v=abc',
          media: [],
        },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getAllByTestId('playable-media')).toHaveLength(1);
  });

  it('treats a non-URL legacy media_file as a file-kind media item', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media_file: 'uploads/notes.pdf',
          media: [],
        },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    // Guessed as a "pdf" file-kind media item from the extension; since the file
    // path isn't a full URL, no iframe renders, but the media badge reflects it.
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('skips description translation when there is no description', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({ description: '', intervention: { _id: 'int-1', aim: 'Education', media: [] } }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    // translateText should only have been called for the title, not an empty description
    const descCalls = (translateText as jest.Mock).mock.calls.filter(([text]) => text === '');
    expect(descCalls).toHaveLength(0);
  });

  it('falls back to raw title/description when translation throws', async () => {
    (translateText as jest.Mock).mockRejectedValue(new Error('translate down'));

    render(<PatientInterventionDetail />);

    expect(await screen.findByText('Morning Stretch')).toBeInTheDocument();
    expect(screen.getByText('Daily movement routine')).toBeInTheDocument();
  });

  it('shows the feedback popup when the questionnaire store requests it', async () => {
    (patientQuestionnairesStore as any).showFeedbackPopup = true;
    (patientQuestionnairesStore as any).feedbackInterventionId = 'int-1';

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getByTestId('feedback-popup')).toHaveTextContent('int-1');
  });

  it('logs and swallows an error if opening feedback fails after marking complete', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (patientInterventionsStore as any).toggleCompleted.mockResolvedValue({
      completed: true,
      dateKey: '2026-03-16',
    });
    (patientQuestionnairesStore as any).openInterventionFeedback.mockRejectedValue(
      new Error('feedback failed')
    );

    render(<PatientInterventionDetail />);
    const markDoneButton = await screen.findByRole('button', { name: /Mark as done/i });
    fireEvent.click(markDoneButton);

    await waitFor(() => {
      expect((patientQuestionnairesStore as any).closeFeedback).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('shows a duration badge and scrolls to media on badge click', async () => {
    const scrollSpy = jest.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Exercise',
          duration: 15,
          media: [
            { kind: 'external', media_type: 'video', url: 'https://example.com/v.mp4', title: 'Vid' },
          ],
        },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    expect(screen.getByText('15min')).toBeInTheDocument();

    const mediaBadge = screen.getByRole('button', { name: /Video/i });
    fireEvent.click(mediaBadge);
    expect(scrollSpy).toHaveBeenCalled();

    fireEvent.keyDown(mediaBadge, { key: 'Enter' });
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });
});
