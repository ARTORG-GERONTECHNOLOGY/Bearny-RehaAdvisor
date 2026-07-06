import type { ChangeEvent } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PatientInfoFieldRenderer, {
  PatientFieldConfig,
  createFieldChangeHandler,
} from '@/components/TherapistPatientPage/PatientInfoFieldRenderer';
import { PatientPopupStore } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Radix Select (used by the 'dropdown' field type) relies on pointer capture /
// scrollIntoView APIs that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoFieldRenderer', () => {
  describe('view mode', () => {
    it('shows the display value and a source badge for a plain text field', () => {
      const store = makeStore();
      store.manualData = { marital_status: 'Married' };
      const field: PatientFieldConfig = { be_name: 'marital_status', label: 'Marital status' };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(screen.getByText('Marital status')).toBeInTheDocument();
      expect(screen.getByText('Married')).toBeInTheDocument();
      expect(screen.getByText('Manual')).toBeInTheDocument();
    });

    it('falls back to an em dash when there is no value', () => {
      const store = makeStore();
      const field: PatientFieldConfig = { be_name: 'marital_status', label: 'Marital status' };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('renders a comma-list value joined with commas', () => {
      const store = makeStore();
      store.manualData = { lifestyle: ['Non-Smoker', 'Vegetarian'] };
      const field: PatientFieldConfig = {
        be_name: 'lifestyle',
        label: 'Lifestyle',
        type: 'comma-list',
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(screen.getByText('Non-Smoker, Vegetarian')).toBeInTheDocument();
    });

    it('renders a checkbox value as Yes/No', () => {
      const store = makeStore();
      store.manualData = { initial_questionnaire_enabled: true };
      const field: PatientFieldConfig = {
        be_name: 'initial_questionnaire_enabled',
        label: 'Enable Initial Questionnaire',
        type: 'checkbox',
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders access_word fields as read-only even while editing', () => {
      const store = makeStore();
      store.isEditing = true;
      store.manualData = { access_word: 'secret' };
      const field: PatientFieldConfig = { be_name: 'access_word', label: 'Access word' };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(screen.getByText('secret')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows a readOnly field without a source badge', () => {
      const store = makeStore();
      store.manualData = { therapist_name: 'Dr. Smith' };
      const field: PatientFieldConfig = {
        be_name: 'therapist_name',
        label: 'Therapist',
        readOnly: true,
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
      expect(screen.queryByText('Manual')).not.toBeInTheDocument();
    });

    it('renders nothing for a readOnly field while editing', () => {
      const store = makeStore();
      store.isEditing = true;
      store.manualData = { therapist_name: 'Dr. Smith' };
      const field: PatientFieldConfig = {
        be_name: 'therapist_name',
        label: 'Therapist',
        readOnly: true,
      };

      const { container } = render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('edit mode', () => {
    it('renders a text input bound to formData and updates it on change', () => {
      const store = makeStore();
      store.isEditing = true;
      store.formData = { marital_status: 'Single' };
      const field: PatientFieldConfig = {
        be_name: 'marital_status',
        label: 'Marital status',
        type: 'text',
        maxLength: 200,
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      const input = screen.getByDisplayValue('Single');
      fireEvent.change(input, { target: { value: 'Married' } });

      expect(store.formData.marital_status).toBe('Married');
    });

    it('renders a comma-list input bound via arrayToDisplay/setCommaSeparated', () => {
      const store = makeStore();
      store.isEditing = true;
      store.formData = { lifestyle: ['Non-Smoker', 'Active'] };
      const field: PatientFieldConfig = {
        be_name: 'lifestyle',
        label: 'Lifestyle',
        type: 'comma-list',
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      const input = screen.getByDisplayValue('Non-Smoker, Active');
      fireEvent.change(input, { target: { value: 'Non-Smoker, Active, Vegetarian ' } });

      // setCommaSeparated keeps the raw string while typing (no premature splitting).
      expect(store.formData.lifestyle).toBe('Non-Smoker, Active, Vegetarian ');
    });

    it('renders a dropdown with the configured options', async () => {
      const user = userEvent.setup();
      const store = makeStore();
      store.isEditing = true;
      store.formData = { marital_status: '' };
      const field: PatientFieldConfig = {
        be_name: 'marital_status',
        label: 'Marital status',
        type: 'dropdown',
        options: ['Single', 'Married'],
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      await user.click(screen.getByLabelText('Marital status'));
      await user.click(await screen.findByRole('option', { name: 'Married' }));

      expect(store.formData.marital_status).toBe('Married');
    });

    it('uses a custom placeholder and respects the disabled flag on dropdowns', () => {
      const store = makeStore();
      store.isEditing = true;
      store.formData = { project: '' };
      const field: PatientFieldConfig = {
        be_name: 'project',
        label: 'Project',
        type: 'dropdown',
        options: [],
        placeholder: 'Select project',
        disabled: true,
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      expect(screen.getByText('Select project')).toBeInTheDocument();
      expect(screen.getByLabelText('Project')).toBeDisabled();
    });

    it('calls onValueChange after setting a dropdown field', async () => {
      const user = userEvent.setup();
      const store = makeStore();
      store.isEditing = true;
      store.formData = { clinic: '' };
      const onValueChange = jest.fn();
      const field: PatientFieldConfig = {
        be_name: 'clinic',
        label: 'Clinic',
        type: 'dropdown',
        options: ['Inselspital'],
        onValueChange,
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      await user.click(screen.getByLabelText('Clinic'));
      await user.click(await screen.findByRole('option', { name: 'Inselspital' }));

      expect(store.formData.clinic).toBe('Inselspital');
      expect(onValueChange).toHaveBeenCalledWith('Inselspital');
    });

    it('renders a date input bound to formData', () => {
      const store = makeStore();
      store.isEditing = true;
      store.formData = { reha_end_date: '' };
      const field: PatientFieldConfig = {
        be_name: 'reha_end_date',
        label: 'Rehabilitation End Date',
        type: 'date',
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      const input = screen.getByLabelText('Rehabilitation End Date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2026-01-15' } });

      expect(store.formData.reha_end_date).toBe('2026-01-15');
    });

    it('renders a checkbox bound to formData', () => {
      const store = makeStore();
      store.isEditing = true;
      store.formData = { initial_questionnaire_enabled: false };
      const field: PatientFieldConfig = {
        be_name: 'initial_questionnaire_enabled',
        label: 'Enable Initial Questionnaire',
        type: 'checkbox',
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      const checkbox = screen.getByLabelText('Enable Initial Questionnaire') as HTMLInputElement;
      fireEvent.click(checkbox);

      expect(store.formData.initial_questionnaire_enabled).toBe(true);
    });

    it('renders a textarea with a custom max length', () => {
      const store = makeStore();
      store.isEditing = true;
      store.formData = { restrictions: '' };
      const field: PatientFieldConfig = {
        be_name: 'restrictions',
        label: 'Restrictions',
        type: 'textarea',
        maxLength: 2000,
      };

      render(<PatientInfoFieldRenderer store={store} field={field} />);

      const textarea = screen.getByLabelText('Restrictions') as HTMLTextAreaElement;
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea.maxLength).toBe(2000);
    });
  });
});

describe('createFieldChangeHandler', () => {
  it('writes the changed input value onto formData under the input id', () => {
    const store = new PatientPopupStore('patient-1');
    const handleChange = createFieldChangeHandler(store);

    handleChange({
      target: { id: 'therapist_name', value: 'Dr. Smith' },
    } as unknown as ChangeEvent<HTMLInputElement>);

    expect(store.formData.therapist_name).toBe('Dr. Smith');
  });
});
