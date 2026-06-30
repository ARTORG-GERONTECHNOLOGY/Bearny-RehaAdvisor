import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import PatientFilters from '@/components/TherapistPatientPage/PatientFilters';
import { TherapistPatientsStore } from '@/stores/therapistPatientsStore';
import '@testing-library/jest-dom';

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1', userType: 'Therapist', isAuthenticated: true },
}));

const sexOptions = ['Male', 'Female'];
const durationOptions = ['< 30 days', '30-60 days'];

describe('PatientFilters', () => {
  let store: TherapistPatientsStore;

  beforeEach(() => {
    store = new TherapistPatientsStore();
  });

  const renderComponent = () =>
    render(
      <I18nextProvider i18n={i18n}>
        <PatientFilters store={store} sexOptions={sexOptions} durationOptions={durationOptions} />
      </I18nextProvider>
    );

  it('renders search, date and select filters', () => {
    renderComponent();
    expect(screen.getByPlaceholderText('Search by name, ID or username')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by Birth Date')).toBeInTheDocument();
    expect(screen.getByText('Filter by Sex')).toBeInTheDocument();
    expect(screen.getByText('Filter by Duration')).toBeInTheDocument();
    expect(screen.getByText('Filter by Disease')).toBeInTheDocument();
  });

  it('updates the store when typing a search term', () => {
    renderComponent();
    const input = screen.getByPlaceholderText('Search by name, ID or username');
    fireEvent.change(input, { target: { value: 'Anna' } });
    expect(store.searchTerm).toBe('Anna');
  });

  it('updates the store when changing the birthdate filter', () => {
    renderComponent();
    const input = screen.getByLabelText('Filter by Birth Date');
    fireEvent.change(input, { target: { value: '1990-01-01' } });
    expect(store.birthdateFilter).toBe('1990-01-01');
  });

  it('updates the store when selecting a sex filter', () => {
    renderComponent();
    fireEvent.change(screen.getByDisplayValue('Filter by Sex'), { target: { value: 'Male' } });
    expect(store.sexFilter).toBe('Male');
  });

  it('updates the store when selecting a duration filter', () => {
    renderComponent();
    fireEvent.change(screen.getByDisplayValue('Filter by Duration'), {
      target: { value: '< 30 days' },
    });
    expect(store.durationFilter).toBe('< 30 days');
  });

  it('updates the store when changing the sort option', () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'created' } });
    expect(store.sortBy).toBe('created');
  });

  it('toggles the show completed switch', () => {
    renderComponent();
    const toggle = screen.getByLabelText('Show completed');
    expect(store.showCompleted).toBe(false);
    fireEvent.click(toggle);
    expect(store.showCompleted).toBe(true);
  });

  it('resets filters when clicking the reset button', () => {
    store.setSearchTerm('Anna');
    store.setSexFilter('Male');
    store.setShowCompleted(true);

    renderComponent();
    fireEvent.click(screen.getByText('Reset filters'));

    expect(store.searchTerm).toBe('');
    expect(store.sexFilter).toBe('');
    expect(store.showCompleted).toBe(false);
  });
});
