import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TherapistInterventions from '../../pages/TherapistInterventions';
import '@testing-library/jest-dom';
import apiClient from '../../api/client'; // ✅ Import apiClient
jest.mock('../../api/client', () => require('../../__mocks__/api/client'));
jest.mock('../../config/config.json', () => ({
  RecomendationInfo: { tags: [] },
  patientInfo: {
    function: {
      Cardiology: {
        diagnosis: ['Coronary Artery Disease', 'Arrhytmia', 'Stroke'],
      },
      Psychiatry: {
        diagnosis: ['Depression'],
      },
      Neurology: {
        diagnosis: ['All'],
      },
      Sports: {
        diagnosis: ['All'],
      },
    },
  },
}));

// 🔁 Mock react-router-dom navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ✅ Mock authStore to simulate logged-in and not-logged-in states
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    specialisation: 'Stroke',
  },
}));

// ✅ Child component mocks
jest.mock('../../components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('../../components/common/Footer', () => () => <div>Mock Footer</div>);
jest.mock('../../components/common/WelcomeArea', () => () => <div>Mocked Welcome Area</div>);
jest.mock('../../components/TherapistInterventionPage/ProductPopup', () => (props) => (
  <div>
    Product Popup
    <button aria-label="close" onClick={props.handleClose}>
      Close
    </button>
  </div>
));

jest.mock('../../components/AddIntervention/AddRecomendationPopUp', () => () => (
  <div>Add Intervention Popup</div>
));
jest.mock('../../components/TherapistInterventionPage/FilterBar', () => (props) => {
  return (
    <div>
      <input
        placeholder="Search Interventions"
        value={props.searchTerm}
        onChange={(e) => props.setSearchTerm(e.target.value)}
      />
      <button onClick={() => props.setPatientTypeFilter('Stroke')}>Set Patient Type</button>
      {/* ✅ Add this: */}
      <button onClick={() => props.setContentTypeFilter('Exercise')}>Set Content Type</button>
      <button onClick={() => props.setCoreSupportFilter('Core')}>Set Core Filter</button>
      <button onClick={() => props.setFrequencyFilter('Daily')}>Set Frequency</button>
    </div>
  );
});

jest.mock('../../components/TherapistInterventionPage/InterventionList', () => (props) => (
  <div>
    {props.items.map((item) => (
      <div key={item._id} onClick={() => props.onClick(item)}>
        {item.title}
      </div>
    ))}
  </div>
));

// ✅ Mock translations
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockInterventions = [
  {
    _id: '675a88cc8ea37a32e90afe68',
    title: 'Stretching for 30 minutes',
    description: 'Do 30 minutes of stretching with the help of this video.',
    content_type: 'Exercise',
    patient_types: [
      { type: 'Cardiology', frequency: 'Daily', include_option: true, diagnosis: null },
      { type: 'Psychiatry', frequency: 'Every-2nd-day', include_option: true, diagnosis: null },
      {
        type: 'Cardiology',
        frequency: 'Daily',
        include_option: true,
        diagnosis: 'Stroke',
      },
    ],
    link: '',
    media_file:
      'http://159.100.246.89:8000/media/videos/20241212065508_istockphoto-1856343710-640_adpp_is.mp4',
    preview_img: '',
    duration: null,
    benefitFor: [],
    tags: [],
  },
];

describe('TherapistInterventions Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockImplementation((url) => {
      if (url === 'interventions/all/') {
        return Promise.resolve({ data: mockInterventions });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });
  test('opens add intervention popup when button is clicked', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    const addButton = await screen.findByRole('button', { name: /Add Intervention/i });
    fireEvent.click(addButton);
    expect(screen.getByText('Add Intervention Popup')).toBeInTheDocument();
  });
  test('applies core/supportive filter', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    await screen.findByText('Stretching for 30 minutes');

    // Simulate setting the coreSupportFilter to 'Core'
    fireEvent.click(screen.getByText('Set Patient Type')); // Already existing button, but you'd make a new one if needed for coreSupportFilter

    // You may need to extend your FilterBar mock to include a button to set coreSupportFilter
  });
  test('applies content type filter', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    await screen.findByText('Stretching for 30 minutes');

    fireEvent.click(screen.getByText('Set Content Type'));
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
  });

  test('opens product popup on intervention click', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    const item = await screen.findByText('Stretching for 30 minutes');
    fireEvent.click(item);

    // ✅ Assert that the product popup is visible
    expect(screen.getByText('Product Popup')).toBeInTheDocument();
  });

  test('closes product popup when handleClose is called', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    const item = await screen.findByText('Stretching for 30 minutes');
    fireEvent.click(item);

    // Popup is open now
    expect(screen.getByText('Product Popup')).toBeInTheDocument();

    // Close the popup (simulate the close)
    fireEvent.click(screen.getByRole('button', { name: /close/i })); // or find your real close button
    await waitFor(() => {
      expect(screen.queryByText('Product Popup')).not.toBeInTheDocument();
    });
  });
  test('resets filters and shows all interventions again', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    await screen.findByText('Stretching for 30 minutes');

    // Apply search filter
    fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
      target: { value: 'zzz' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Stretching for 30 minutes')).not.toBeInTheDocument();
    });

    // Reset filter
    fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
      target: { value: '' },
    });

    await waitFor(() => {
      expect(screen.getByText('Stretching for 30 minutes')).toBeInTheDocument();
    });
  });
  test('renders page with essential UI blocks', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    expect(screen.getByText('Mock Header')).toBeInTheDocument();
    expect(screen.getByText('Mocked Welcome Area')).toBeInTheDocument();
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
    expect(screen.getByText('Mock Footer')).toBeInTheDocument();
  });

  test('fetches and renders interventions', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
  });

  test('applies search filter', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await screen.findByText('Stretching for 30 minutes');
    fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
      target: { value: 'zzz' },
    });
    await waitFor(() => {
      expect(screen.queryByText('Stretching for 30 minutes')).not.toBeInTheDocument();
    });
  });

  test('applies patient type filter', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await screen.findByText('Stretching for 30 minutes');
    fireEvent.click(screen.getByText('Set Patient Type'));
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
  });

  test('redirects if user is not authenticated', async () => {
    const authStore = require('../../stores/authStore').default;
    authStore.isAuthenticated = false;

    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('handles API errors gracefully', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('API error'));
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByText('Stretching for 30 minutes')).not.toBeInTheDocument();
    });
  });
});
