import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddInterventionRow from '@/components/TherapistInterventionPage/AddInterventionRow';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

describe('AddInterventionRow', () => {
  it('renders add and import buttons', () => {
    render(<AddInterventionRow onAdd={jest.fn()} onImport={jest.fn()} />);
    expect(screen.getByText('Add New Intervention')).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  it('calls onAdd when the add button is clicked', () => {
    const onAdd = jest.fn();
    render(<AddInterventionRow onAdd={onAdd} onImport={jest.fn()} />);
    fireEvent.click(screen.getByText('Add New Intervention'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('calls onImport when the import button is clicked', () => {
    const onImport = jest.fn();
    render(<AddInterventionRow onAdd={jest.fn()} onImport={onImport} />);
    fireEvent.click(screen.getByText('Import'));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
