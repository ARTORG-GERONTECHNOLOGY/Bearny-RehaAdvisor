import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MainTabs from '@/components/TherapistInterventionPage/MainTabs';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

describe('MainTabs', () => {
  it('renders both tab labels', () => {
    render(<MainTabs mainTab="library" onChange={jest.fn()} />);
    expect(screen.getByText('Interventions')).toBeInTheDocument();
    expect(screen.getByText('Your Templates')).toBeInTheDocument();
  });

  it('marks the active tab based on mainTab prop', () => {
    render(<MainTabs mainTab="templates" onChange={jest.fn()} />);
    expect(screen.getByText('Your Templates')).toHaveClass('active');
    expect(screen.getByText('Interventions')).not.toHaveClass('active');
  });

  it('calls onChange with the selected tab key', () => {
    const onChange = jest.fn();
    render(<MainTabs mainTab="library" onChange={onChange} />);
    fireEvent.click(screen.getByText('Your Templates'));
    expect(onChange).toHaveBeenCalledWith('templates');
  });
});
