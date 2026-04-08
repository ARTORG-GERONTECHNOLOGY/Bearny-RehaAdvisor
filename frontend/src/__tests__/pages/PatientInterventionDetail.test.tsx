import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('react-bootstrap', () => ({
  OverlayTrigger: ({ children }: any) => <>{children}</>,
  Tooltip: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('react-icons/fa', () => ({
  FaLock: () => <span data-testid="fa-lock" />,
}));

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: require('@/__mocks__/components/Layout').default,
}));

jest.mock('@/components/common/ErrorAlert', () => ({ message, onClose }: any) => (
  <div>
    <span>{message}</span>
    <button onClick={onClose}>close-error</button>
  </div>
));

jest.mock('@/components/PatientPage/FeedbackPopup', () => (props: any) => (
  <div data-testid="feedback-popup">{props.interventionId}</div>
));

jest.mock('@/components/common/PlayableMedia', () => ({
  PlayableMedia: ({ label, m }: any) => (
    <div data-testid="playable-media">
      {label}:{m.media_type}
    </div>
  ),
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

import PatientInterventionDetail from '@/pages/PatientInterventionDetail';
import authStore from '@/stores/authStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';

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

    // Open links include video + website, with duplicate website URL removed.
    const openLinks = screen.getAllByRole('link', { name: /Open link:/i });
    expect(openLinks).toHaveLength(2);
    expect(openLinks[0]).toHaveAttribute('href', 'https://example.com/video.mp4');
    expect(openLinks[1]).toHaveAttribute('href', 'https://example.com/page');
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
});
