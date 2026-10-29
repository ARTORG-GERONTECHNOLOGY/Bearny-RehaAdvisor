import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockNavigate = jest.fn();
let mockInterventionId = 'int-1';
let mockSearchParams = new URLSearchParams('date=2026-03-16');

jest.mock('mobx-react-lite', () => ({
  observer: (component: any) => component,
}));

jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ interventionId: mockInterventionId }),
    useSearchParams: () => [mockSearchParams],
  };
});

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
    rescheduleOccurrence: jest.fn(async () => '2026-03-20T00:00:00+00:00'),
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
    fetchStatus: jest.fn(async () => {}),
    lastCompletedOf: jest.fn(() => null),
    lastLibraryCompletedOf: jest.fn(() => null),
    setLibraryCompleted: jest.fn(async () => {}),
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

  describe('view logging', () => {
    const viewPosts = () =>
      mockApiPost.mock.calls.filter(([url]) => String(url).includes('/intervention-view/'));
    const advance = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
    };

    beforeEach(() => {
      jest.useFakeTimers();
      mockApiPost.mockImplementation((_url: string, body: any) =>
        Promise.resolve(body?.log_id ? {} : { data: { id: 'log-1' } })
      );
      (patientInterventionsStore as any).items = [buildRec()];
    });

    afterEach(() => {
      jest.useRealTimers();
      mockApiPost.mockReset().mockResolvedValue({});
    });

    const renderDetail = async () => {
      const utils = render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');
      return utils;
    };

    it('logs the visit as opened once the page has been open for 2 seconds', async () => {
      await renderDetail();
      await advance(1_900);
      expect(viewPosts()).toHaveLength(0);

      await advance(100);
      expect(viewPosts()).toEqual([
        [
          expect.stringContaining('/patients/vitals/intervention-view/'),
          { intervention_id: 'int-1', date: '2026-03-16' },
        ],
      ]);
    });

    it("logs a library open against today's plan session when there is one", async () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      mockSearchParams = new URLSearchParams('');
      (patientInterventionsStore as any).items = [buildRec({ dates: [`${today}T09:00:00`] })];

      await renderDetail();
      await advance(2_000);

      expect(viewPosts()[0][1]).toEqual({ intervention_id: 'int-1', date: today });
    });

    it('keeps a visit that changes ?date= (reschedule from this page) as one row', async () => {
      const { rerender, unmount } = await renderDetail();
      await advance(3_000);
      mockSearchParams = new URLSearchParams('date=2026-03-20');
      rerender(<PatientInterventionDetail />);
      await advance(5_000);
      unmount();
      await advance(0);

      expect(viewPosts().map(([, body]) => body)).toEqual([
        { intervention_id: 'int-1', date: '2026-03-16' },
        { log_id: 'log-1', seconds_viewed: 8 },
      ]);
    });

    it('adds the duration to that same row when leaving', async () => {
      const { unmount } = await renderDetail();
      await advance(10_000);
      unmount();
      await advance(0);

      expect(viewPosts()).toHaveLength(2);
      expect(viewPosts()[1][1]).toEqual({ log_id: 'log-1', seconds_viewed: 10 });
    });

    it('does not log a visit shorter than 2 seconds', async () => {
      const { unmount } = await renderDetail();
      await advance(1_500);
      unmount();
      await advance(5_000);
      expect(viewPosts()).toHaveLength(0);
    });

    it('leaves the duration out when the open could not be logged', async () => {
      mockApiPost.mockRejectedValue(new Error('offline'));
      const { unmount } = await renderDetail();
      await advance(5_000);
      unmount();
      await advance(0);
      expect(viewPosts()).toHaveLength(1);
    });
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

  it('outlines "Mark as done" in green until done, then fills it', async () => {
    (patientInterventionsStore as any).items = [buildRec()];
    const { unmount } = render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    const open = screen.getByRole('button', { name: /Mark as done/i });
    expect(open).toHaveClass('border-brand', 'text-brand');
    expect(open).not.toHaveClass('bg-brand');
    unmount();

    (patientInterventionsStore as any).isCompletedOn.mockReturnValue(true);
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByRole('button', { name: /Done/i })).toHaveClass('bg-brand');
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
            {
              kind: 'external',
              media_type: 'pdf',
              url: 'https://example.com/doc.pdf',
              title: 'Doc',
            },
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
            {
              kind: 'external',
              media_type: 'image',
              url: 'https://example.com/pic.png',
              title: 'Pic',
            },
          ],
        },
      }),
    ];
    mockInterventionId = 'int-1';
    rerender(<PatientInterventionDetail />);
    await waitFor(() => expect(screen.getByAltText('Pic')).toBeInTheDocument());
  });

  it('renders a tabbed view when there are multiple renderable media items', async () => {
    const user = userEvent.setup();
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Exercise',
          media: [
            {
              kind: 'external',
              media_type: 'video',
              url: 'https://example.com/v.mp4',
              title: 'Vid',
            },
            {
              kind: 'external',
              media_type: 'audio',
              url: 'https://example.com/a.mp3',
              title: 'Aud',
            },
          ],
        },
      }),
    ];

    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');

    // Only the active tab's media is mounted
    expect(screen.getAllByTestId('playable-media')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Vid' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Aud' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Aud' }));

    await waitFor(() => expect(screen.getAllByTestId('playable-media')).toHaveLength(1));
    expect(screen.getByRole('tab', { name: 'Aud' })).toHaveAttribute('aria-selected', 'true');
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

  it('guesses media type/provider from a SoundCloud legacy link', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          link: 'https://soundcloud.com/artist/track',
          media: [],
        },
      }),
    ];
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByTestId('playable-media')).toHaveTextContent(':audio');
  });

  it('guesses media type/provider from a Vimeo legacy link', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          link: 'https://vimeo.com/12345',
          media: [],
        },
      }),
    ];
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByTestId('playable-media')).toHaveTextContent(':video');
  });

  it('guesses audio/video media types from a legacy link file extension', async () => {
    const cases: [string, string][] = [
      ['https://cdn.example.com/track.mp3', 'audio'],
      ['https://cdn.example.com/clip.mp4', 'video'],
    ];

    for (const [link, expectedType] of cases) {
      (patientInterventionsStore as any).items = [
        buildRec({
          intervention: { _id: 'int-1', aim: 'Education', link, media: [] },
        }),
      ];
      const { unmount } = render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');
      expect(screen.getByTestId('playable-media')).toHaveTextContent(`:${expectedType}`);
      unmount();
    }
  });

  it('guesses pdf/image media types from a legacy link file extension', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          link: 'https://cdn.example.com/doc.pdf',
          media: [],
        },
      }),
    ];
    const { unmount } = render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByText('PDF')).toBeInTheDocument();
    unmount();

    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          link: 'https://cdn.example.com/pic.png',
          media: [],
        },
      }),
    ];
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByText('Image')).toBeInTheDocument();
  });

  it('treats an http(s) legacy media_file as an external media item', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media_file: 'https://cdn.example.com/recording.mp3',
          media: [],
        },
      }),
    ];
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByTestId('playable-media')).toHaveTextContent(':audio');
  });

  it('guesses a video file-kind media type from a legacy media_file path extension', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media_file: 'uploads/clip.mp4',
          media: [],
        },
      }),
    ];
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('shows an "App" media badge for a single app-type media item', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media: [{ kind: 'external', media_type: 'app', url: 'https://example.com/app' }],
        },
      }),
    ];
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByText('App')).toBeInTheDocument();
  });

  it('resolves the embed_url for a Spotify streaming media item', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media: [
            {
              kind: 'external',
              media_type: 'streaming',
              provider: 'spotify',
              url: 'https://open.spotify.com/track/abc',
              embed_url: 'https://open.spotify.com/embed/track/abc',
            },
          ],
        },
      }),
    ];
    render(<PatientInterventionDetail />);
    await screen.findByText('Morning Stretch');
    expect(screen.getByTestId('playable-media')).toHaveTextContent(':streaming');
  });

  it('normalizes a single (non-array) media object into a one-item media list', async () => {
    (patientInterventionsStore as any).items = [
      buildRec({
        intervention: {
          _id: 'int-1',
          aim: 'Education',
          media: { kind: 'external', media_type: 'video', url: 'https://example.com/v.mp4' },
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
            {
              kind: 'external',
              media_type: 'video',
              url: 'https://example.com/v.mp4',
              title: 'Vid',
            },
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

  // --- Reschedule button + sheet (issue #426) ---

  describe('reschedule', () => {
    // Pin "now" just before the fixture session: the backend refuses sessions whose time has passed.
    const occurrence = new Date('2026-03-16').getTime();

    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true }).setSystemTime(occurrence - 60_000);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows the Reschedule button when the occurrence is not completed', async () => {
      render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');

      expect(screen.getByRole('button', { name: 'Reschedule' })).toBeInTheDocument();
    });

    it('hides the Reschedule button once the occurrence is completed', async () => {
      (patientInterventionsStore as any).isCompletedOn.mockReturnValue(true);

      render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');

      expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    });

    it('hides the Reschedule button once the occurrence time has passed', async () => {
      jest.setSystemTime(occurrence + 60_000);

      render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');

      expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    });

    it('does not show the Reschedule button when the URL date does not match an assigned date', async () => {
      mockSearchParams = new URLSearchParams('date=2026-04-01');

      render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');

      expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    });

    it('opens the reschedule sheet with a date picker when clicked', async () => {
      render(<PatientInterventionDetail />);

      const rescheduleButton = await screen.findByRole('button', { name: 'Reschedule' });
      fireEvent.click(rescheduleButton);

      expect(screen.getByLabelText('Date')).toBeInTheDocument();
    });

    it('submits a new date, calls rescheduleOccurrence with the original occurrence, and navigates to the updated date', async () => {
      render(<PatientInterventionDetail />);

      const rescheduleButton = await screen.findByRole('button', { name: 'Reschedule' });
      fireEvent.click(rescheduleButton);

      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-20' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect((patientInterventionsStore as any).rescheduleOccurrence).toHaveBeenCalledWith(
          'patient-1',
          expect.objectContaining({ intervention_id: 'int-1' }),
          '2026-03-16',
          expect.any(Date)
        );
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/patient-intervention/int-1?date=2026-03-20', {
          replace: true,
        });
      });
    });

    it('does not navigate when rescheduling fails', async () => {
      (patientInterventionsStore as any).rescheduleOccurrence.mockRejectedValueOnce(
        new Error('A session already exists on that day.')
      );

      render(<PatientInterventionDetail />);
      const rescheduleButton = await screen.findByRole('button', { name: 'Reschedule' });
      fireEvent.click(rescheduleButton);

      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-20' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('A session already exists on that day.')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('2026-03-20'));
    });
  });

  describe('library completion (opened without a plan session)', () => {
    const todayKey = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const libraryStore = patientInterventionsLibraryStore as any;

    beforeEach(() => {
      mockSearchParams = new URLSearchParams('');
      libraryStore.lastCompletedOf.mockReturnValue(null);
      libraryStore.lastLibraryCompletedOf.mockReturnValue(null);
    });

    it('loads the library status for the patient', async () => {
      render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');
      expect(libraryStore.fetchStatus).toHaveBeenCalledWith('patient-1');
    });

    it('marks it done for today from the library and asks for library feedback', async () => {
      render(<PatientInterventionDetail />);

      fireEvent.click(await screen.findByRole('button', { name: /Mark as done/i }));

      await waitFor(() => {
        expect(libraryStore.setLibraryCompleted).toHaveBeenCalledWith(
          'patient-1',
          'int-1',
          todayKey(),
          true,
          expect.objectContaining({ _id: 'int-1' })
        );
      });
      expect((patientInterventionsStore as any).toggleCompleted).not.toHaveBeenCalled();
      expect((patientQuestionnairesStore as any).openInterventionFeedback).toHaveBeenCalledWith(
        'patient-1',
        'int-1',
        todayKey(),
        'en',
        'library'
      );
    });

    it('shows Done when completed today and undoes it without asking for feedback', async () => {
      libraryStore.lastCompletedOf.mockReturnValue(todayKey());
      libraryStore.lastLibraryCompletedOf.mockReturnValue(todayKey());
      render(<PatientInterventionDetail />);

      const done = await screen.findByRole('button', { name: /Done/ });
      expect(done).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByText(/Last done/)).not.toBeInTheDocument();
      fireEvent.click(done);

      await waitFor(() => {
        expect(libraryStore.setLibraryCompleted).toHaveBeenCalledWith(
          'patient-1',
          'int-1',
          todayKey(),
          false,
          expect.objectContaining({ _id: 'int-1' })
        );
      });
      expect((patientQuestionnairesStore as any).openInterventionFeedback).not.toHaveBeenCalled();
    });

    it('shows when it was last done on an earlier day', async () => {
      libraryStore.lastCompletedOf.mockReturnValue('2026-10-24');
      render(<PatientInterventionDetail />);

      expect(await screen.findByText('Last done: 24 Oct 2026')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Mark as done/i })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('shows a plan completion as last done but leaves the library button open', async () => {
      // Done today in the plan, never from the library.
      libraryStore.lastCompletedOf.mockReturnValue(todayKey());
      render(<PatientInterventionDetail />);

      expect(await screen.findByText(/^Last done: /)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Mark as done/i })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('looks up the status by the intervention id when it has no external_id', async () => {
      render(<PatientInterventionDetail />);
      await screen.findByText('Morning Stretch');
      expect(libraryStore.lastCompletedOf).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'int-1' })
      );
      expect(libraryStore.lastLibraryCompletedOf).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'int-1' })
      );
    });

    it('shows Done on the English version after it was completed in German', async () => {
      mockInterventionId = 'int-en';
      (patientInterventionsStore as any).items = [];
      libraryStore.visibleItemsForPatient = [
        { _id: 'int-en', external_id: 'EXT-1', title: 'Breathing', aims: ['Exercise'], media: [] },
      ];
      // The status is keyed by external_id, whichever language version was completed.
      libraryStore.lastLibraryCompletedOf.mockImplementation((item: { external_id?: string }) =>
        item.external_id === 'EXT-1' ? todayKey() : null
      );

      render(<PatientInterventionDetail />);

      expect(await screen.findByRole('button', { name: /Done/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('tells the patient when saving a library completion fails', async () => {
      libraryStore.setLibraryCompleted.mockRejectedValueOnce(new Error('offline'));
      render(<PatientInterventionDetail />);

      fireEvent.click(await screen.findByRole('button', { name: /Mark as done/i }));

      expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
      expect((patientQuestionnairesStore as any).openInterventionFeedback).not.toHaveBeenCalled();
    });

    it('tells the patient when saving a plan completion fails', async () => {
      mockSearchParams = new URLSearchParams('date=2026-03-16');
      (patientInterventionsStore as any).toggleCompleted.mockRejectedValueOnce(
        new Error('offline')
      );
      render(<PatientInterventionDetail />);

      fireEvent.click(await screen.findByRole('button', { name: /Mark as done/i }));

      expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    });

    it('shows no completion button for a plan link whose session has moved', async () => {
      // The plan only has a session on 2026-03-16; this link still points at the old day.
      mockSearchParams = new URLSearchParams('date=2026-03-20');
      render(<PatientInterventionDetail />);

      await screen.findByText('Morning Stretch');
      expect(screen.queryByRole('button', { name: /Mark as done/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Done/ })).not.toBeInTheDocument();
      expect(libraryStore.setLibraryCompleted).not.toHaveBeenCalled();
    });

    it("completes today's plan session when opened without a date and the plan has one today", async () => {
      (patientInterventionsStore as any).items = [buildRec({ dates: [`${todayKey()}T09:00:00`] })];
      (patientInterventionsStore as any).toggleCompleted.mockResolvedValueOnce({
        completed: true,
        dateKey: todayKey(),
      });
      render(<PatientInterventionDetail />);

      const markDone = await screen.findByRole('button', { name: /Mark as done/i });
      expect(screen.getAllByRole('button', { name: /Mark as done|Done/i })).toHaveLength(1);
      fireEvent.click(markDone);

      await waitFor(() => {
        expect((patientInterventionsStore as any).toggleCompleted).toHaveBeenCalled();
      });
      expect(libraryStore.setLibraryCompleted).not.toHaveBeenCalled();
      expect((patientQuestionnairesStore as any).openInterventionFeedback).toHaveBeenCalledWith(
        'patient-1',
        'int-1',
        todayKey(),
        'en'
      );
    });

    it('shows when it was last done on a library open of a plan session day', async () => {
      (patientInterventionsStore as any).items = [buildRec({ dates: [`${todayKey()}T09:00:00`] })];
      libraryStore.lastCompletedOf.mockReturnValue('2026-10-24');
      render(<PatientInterventionDetail />);

      expect(await screen.findByText('Last done: 24 Oct 2026')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Mark as done/i })).toHaveLength(1);
    });

    it("hides last done once today's plan session is done", async () => {
      (patientInterventionsStore as any).items = [buildRec({ dates: [`${todayKey()}T09:00:00`] })];
      (patientInterventionsStore as any).isCompletedOn.mockReturnValue(true);
      libraryStore.lastCompletedOf.mockReturnValue(todayKey());
      render(<PatientInterventionDetail />);

      expect(await screen.findByRole('button', { name: /Done/ })).toBeInTheDocument();
      expect(screen.queryByText(/Last done/)).not.toBeInTheDocument();
    });

    it('keeps the plan button for a plan session and offers no library completion', async () => {
      mockSearchParams = new URLSearchParams('date=2026-03-16');
      libraryStore.lastCompletedOf.mockReturnValue('2026-10-24');
      render(<PatientInterventionDetail />);

      const markDone = await screen.findByRole('button', { name: /Mark as done/i });
      expect(screen.getAllByRole('button', { name: /Mark as done/i })).toHaveLength(1);
      expect(screen.queryByText(/Last done/)).not.toBeInTheDocument();

      fireEvent.click(markDone);

      await waitFor(() => {
        expect((patientInterventionsStore as any).toggleCompleted).toHaveBeenCalled();
      });
      expect(libraryStore.setLibraryCompleted).not.toHaveBeenCalled();
    });
  });
});
