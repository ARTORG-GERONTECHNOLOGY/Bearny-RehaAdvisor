import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddPatient from '../../pages/AddPatient';
import '@testing-library/jest-dom';
jest.mock('../../api/client', () => require('../../__mocks__/api/client'));
jest.mock('../../stores/authStore', () => ({
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
jest.mock('../../components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('../../components/common/Footer', () => () => <div>Mock Footer</div>);

jest.mock('../../hooks/useAuthGuard', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key, // return translation key
  }),
}));

describe('AddPatient Page', () => {
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
