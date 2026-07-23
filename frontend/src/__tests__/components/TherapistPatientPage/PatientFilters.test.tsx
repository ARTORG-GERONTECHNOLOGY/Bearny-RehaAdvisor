import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import PatientFilters from '@/components/TherapistPatientPage/PatientFilters';
import { TherapistPatientsStore } from '@/stores/therapistPatientsStore';
import '@testing-library/jest-dom';

beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1', userType: 'Therapist', isAuthenticated: true },
}));

jest.mock('@/stores/appModeStore', () => ({
  appModeStore: {
    mode: 'study',
    loaded: true,
    showManualCreate: false,
    showRedcapImport: true,
    showRedcapTab: true,
    hidePiiFields: true,
    showStudyGroup: true,
    fetchMode: jest.fn(),
  },
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

  it('updates the store when selecting a sex filter', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole('combobox', { name: 'Filter by Sex' }));
    await user.click(await screen.findByRole('option', { name: 'Male' }));
    expect(store.sexFilter).toBe('Male');
  });

  it('updates the store when selecting a duration filter', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole('combobox', { name: 'Filter by Duration' }));
    await user.click(await screen.findByRole('option', { name: '< 30 days' }));
    expect(store.durationFilter).toBe('< 30 days');
  });

  it('clears the sex filter when selecting the neutral option again', async () => {
    const user = userEvent.setup();
    store.setSexFilter('Male');
    renderComponent();
    await user.click(screen.getByRole('combobox', { name: 'Filter by Sex' }));
    await user.click(await screen.findByRole('option', { name: 'Filter by Sex' }));
    expect(store.sexFilter).toBe('');
  });

  it('updates the store when changing the sort option', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }));
    await user.click(await screen.findByRole('option', { name: 'Newest created' }));
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
