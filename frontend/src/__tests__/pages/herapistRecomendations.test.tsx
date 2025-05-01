// Mock child components
// Mock the apiClient
jest.mock('../../api/client', () => require('../../__mocks__/api/client'));
jest.mock('../../components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('../../components/common/Footer', () => () => <div>Mock Footer</div>);
jest.mock('../../components/common/WelcomeArea', () => ({ user }) => <div>Welcome {user}</div>);
jest.mock('../../components/TherapistInterventionPage/FilterBar', () => (props) => (
  <div>
    FilterBar
    <input
      data-testid="search-input"
      value={props.searchTerm}
      onChange={(e) => props.setSearchTerm(e.target.value)}
    />
  </div>
));
jest.mock('../../components/TherapistInterventionPage/InterventionList', () => ({ items }) => (
  <div>
    InterventionList
    {items.map((i) => (
      <div key={i._id}>{i.title}</div>
    ))}
  </div>
));
jest.mock('../../components/TherapistInterventionPage/ProductPopup', () => () => (
  <div>ProductPopup</div>
));
jest.mock('../../components/AddIntervention/AddRecomendationPopUp', () => () => (
  <div>AddInterventionPopup</div>
));

// Mock router
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock authStore and API
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    specialisation: 'Cardiology',
    id: 'therapist1',
  },
}));

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TherapistRecomendations from '../../pages/TherapistInterventions';
import { MemoryRouter } from 'react-router-dom';
import authStore from '../../stores/authStore';
import '@testing-library/jest-dom';
import apiClient from '../../api/client';

describe('TherapistRecomendations page', () => {
  const mockInterventions = [
    {
      _id: '1',
      title: 'Stretching Routine',
      description: 'Some description here',
      tags: ['Moderate', 'At Home'],
      benefitFor: ['Mobility'],
      content_type: 'Video',
      patient_types: [{ diagnosis: 'Cardiology', include_option: true, frequency: 'Daily' }],
    },
    {
      _id: '2',
      title: 'Strength Training',
      tags: ['Intense'],
      benefitFor: ['Muscle Strength'],
      content_type: 'PDFs',
      patient_types: [
        { type: 'Therapist', diagnosis: 'Neurology', include_option: false, frequency: 'Weekly' },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockInterventions });
  });

  test('renders interventions and filters them by title', async () => {
    render(
      <MemoryRouter>
        <TherapistRecomendations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Stretching Routine')).toBeInTheDocument();
    expect(screen.getByText('Strength Training')).toBeInTheDocument();

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'stretch' } });

    await waitFor(() => {
      expect(screen.getByText('Stretching Routine')).toBeInTheDocument();
      expect(screen.queryByText('Strength Training')).not.toBeInTheDocument();
    });
  });

  test('redirects if not authenticated', async () => {
    (authStore.isAuthenticated as boolean) = false;

    render(
      <MemoryRouter>
        <TherapistRecomendations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('opens Add Intervention popup when button is clicked', async () => {
    render(
      <MemoryRouter>
        <TherapistRecomendations />
      </MemoryRouter>
    );

    const addButton = await screen.findByText('Add Intervention');
    fireEvent.click(addButton);

    expect(await screen.findByText('AddInterventionPopup')).toBeInTheDocument();
  });
});
