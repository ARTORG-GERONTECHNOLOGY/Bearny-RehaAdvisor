import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddPatient from '@/pages/AddPatient';
import '@testing-library/jest-dom';
import apiClient from '@/api/client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    id: 'therapist123',
    userType: 'Therapist',
  },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: jest.fn(),
    },
  }),
}));

jest.mock('@/components/common/Header', () => {
  const MockHeader = () => <div>Mock Header</div>;
  MockHeader.displayName = 'MockHeader';
  return MockHeader;
});

jest.mock('@/components/common/Footer', () => {
  const MockFooter = () => <div>Mock Footer</div>;
  MockFooter.displayName = 'MockFooter';
  return MockFooter;
});

jest.mock('@/hooks/useAuthGuard', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('AddPatient Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock apiClient methods to return resolved promises
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        clinics: [],
        projects: [],
      },
    });
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <AddPatient />
      </MemoryRouter>
    );

    // Match the raw translation key used in <h2>{t('AddaNewPatient')}</h2>
    expect(screen.getByText('AddaNewPatient')).toBeInTheDocument();
  });
});
