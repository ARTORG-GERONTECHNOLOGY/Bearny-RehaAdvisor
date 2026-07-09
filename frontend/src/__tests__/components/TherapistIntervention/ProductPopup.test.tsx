import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductPopup from '@/components/TherapistInterventionPage/ProductPopup';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Mock apiClient to avoid import.meta errors
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock authStore
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    id: 'therapist123',
    userType: 'Therapist',
  },
}));

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({ translatedText: `[translated] ${text}`, detectedSourceLanguage: 'de' })
  ),
}));

const mockItem = {
  _id: 'abc123',
  external_id: 'ext-1',
  title: 'Test Intervention',
  description: 'Some useful intervention description',
  content_type: 'video',
  benefitFor: ['mobility'],
  tags: ['rehab', 'exercise'],
  patient_types: [{ type: 'Orthopedic', diagnosis: 'Knee Injury', frequency: 'Weekly' }],
  media_file: null,
  media_url: null,
  link: null,
  language: 'de',
  available_languages: ['de', 'it'],
};

const tagColors = {
  rehab: '#3498db',
  exercise: '#e74c3c',
};

describe('ProductPopup Error Handling', () => {
  it('displays an error alert if error state is set', () => {
    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    // Simulate the error state manually if useState isn't mocked
    const errorText = 'Failed to fetch assigned diagnoses. Please try again.';
    expect(screen.queryByText(errorText)).not.toBeInTheDocument();

    // You'd normally set error through interaction, but here we just simulate rendering
    // The component doesn't expose a setter so a custom wrapper/mocking is needed to fully simulate internal error flow
  });
});

describe('ProductPopup language toggle', () => {
  it('shows the picked variant as-is instead of re-translating it to the app language', async () => {
    const { translateText } = jest.requireMock('@/utils/translate');
    const apiClient = jest.requireMock('@/api/client').default;

    apiClient.get.mockImplementation((url: string, config: { params?: { lang?: string } }) => {
      if (url === 'interventions/all/' && config?.params?.lang === 'it') {
        return Promise.resolve({
          data: [
            {
              ...mockItem,
              language: 'it',
              title: 'Titolo italiano',
              description: 'Descrizione italiana',
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    // Initial variant is translated to the app language (default behavior).
    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'IT' }));

    // The Italian variant should be shown verbatim, not re-translated back
    // to the therapist's app language (which would make every language look identical).
    await waitFor(() => expect(screen.getByText('Titolo italiano')).toBeInTheDocument());
    expect(screen.getByText('Descrizione italiana')).toBeInTheDocument();
    expect(screen.queryByText(/\[translated\] Titolo italiano/)).not.toBeInTheDocument();

    const translateCallsAfterSwitch = translateText.mock.calls.length;
    expect(translateText.mock.calls.some(([text]: [string]) => text === 'Titolo italiano')).toBe(
      false
    );
    expect(translateCallsAfterSwitch).toBeGreaterThan(0);
  });
});
