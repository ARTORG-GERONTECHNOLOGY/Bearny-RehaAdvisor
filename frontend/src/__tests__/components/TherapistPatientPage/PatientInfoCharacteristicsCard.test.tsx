import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoCharacteristicsCard from '@/components/TherapistPatientPage/PatientInfoCharacteristicsCard';
import { PatientPopupStore } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoCharacteristicsCard', () => {
  it('shows the card title and all characteristics fields in view mode', () => {
    const store = makeStore();
    store.manualData = {
      level_of_education: "Bachelor's Degree",
      professional_status: 'Employed Full-Time',
      marital_status: 'Married',
      lifestyle: ['Non-Smoker', 'Active'],
      personal_goals: ['Walk 30 min daily'],
      social_support: ['Spouse or partner'],
      restrictions: 'No heavy lifting',
    };

    render(<PatientInfoCharacteristicsCard store={store} />);

    expect(screen.getByText('Characteristics')).toBeInTheDocument();
    expect(screen.getByText("Bachelor's Degree")).toBeInTheDocument();
    expect(screen.getByText('Employed Full-Time')).toBeInTheDocument();
    expect(screen.getByText('Married')).toBeInTheDocument();
    expect(screen.getByText('Non-Smoker, Active')).toBeInTheDocument();
    expect(screen.getByText('Walk 30 min daily')).toBeInTheDocument();
    expect(screen.getByText('Spouse or partner')).toBeInTheDocument();
    expect(screen.getByText('No heavy lifting')).toBeInTheDocument();
  });

  it('shows em dashes for unset fields in view mode', () => {
    const store = makeStore();

    render(<PatientInfoCharacteristicsCard store={store} />);

    // 7 characteristics fields, all unset.
    expect(screen.getAllByText('—')).toHaveLength(7);
  });

  it('renders editable inputs in edit mode and updates the store on change', () => {
    const store = makeStore();
    store.isEditing = true;
    store.formData = {
      level_of_education: '',
      lifestyle: [],
      restrictions: '',
    };

    render(<PatientInfoCharacteristicsCard store={store} />);

    const educationInput = document.getElementById('level_of_education') as HTMLInputElement;
    fireEvent.change(educationInput, { target: { value: "Master's Degree" } });
    expect(store.formData.level_of_education).toBe("Master's Degree");

    const lifestyleInput = document.getElementById('lifestyle') as HTMLInputElement;
    fireEvent.change(lifestyleInput, { target: { value: 'Non-Smoker, Active' } });
    expect(store.formData.lifestyle).toBe('Non-Smoker, Active');

    const restrictionsInput = document.getElementById('restrictions') as HTMLTextAreaElement;
    expect(restrictionsInput.tagName).toBe('TEXTAREA');
    fireEvent.change(restrictionsInput, { target: { value: 'No heavy lifting' } });
    expect(store.formData.restrictions).toBe('No heavy lifting');
  });
});
