import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoSourceBadge from '@/components/TherapistPatientPage/PatientInfoSourceBadge';
import { PatientPopupStore } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

describe('PatientInfoSourceBadge', () => {
  it('shows a "Manual" badge when the field has a manual value', () => {
    const store = new PatientPopupStore('patient-1');
    store.manualData = { clinic: 'Inselspital' };

    render(<PatientInfoSourceBadge store={store} fieldKey="clinic" />);

    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('shows a "REDCap" badge when only a REDCap value exists', () => {
    const store = new PatientPopupStore('patient-1');
    store.redcapFlat = { clinic: 'Inselspital' };

    render(<PatientInfoSourceBadge store={store} fieldKey="clinic" />);

    expect(screen.getByText('REDCap')).toBeInTheDocument();
  });

  it('renders nothing when the field has no value in either source', () => {
    const store = new PatientPopupStore('patient-1');

    const { container } = render(<PatientInfoSourceBadge store={store} fieldKey="clinic" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('prefers the manual badge when both a manual and REDCap value exist', () => {
    const store = new PatientPopupStore('patient-1');
    store.manualData = { clinic: 'Inselspital' };
    store.redcapFlat = { clinic: 'Bern' };

    render(<PatientInfoSourceBadge store={store} fieldKey="clinic" />);

    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.queryByText('REDCap')).not.toBeInTheDocument();
  });
});
