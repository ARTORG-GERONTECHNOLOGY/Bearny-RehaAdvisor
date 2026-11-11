import { render, screen, fireEvent } from '@testing-library/react';
import DeviceScreen from '@/components/icf/DeviceScreen';

describe('DeviceScreen', () => {
  const noop = () => {};

  it('renders the device question and all four options', () => {
    render(<DeviceScreen onSelect={noop} />);
    expect(screen.getByText('Welches Gerät nutzen Sie jetzt dafür?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smartphone, Handy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tablet, iPad' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Laptop, Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Computer' })).toBeInTheDocument();
  });

  it('calls onSelect with smartphone when Smartphone, Handy is clicked', () => {
    const onSelect = jest.fn();
    render(<DeviceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Smartphone, Handy' }));
    expect(onSelect).toHaveBeenCalledWith('smartphone');
  });

  it('calls onSelect with tablet when Tablet, iPad is clicked', () => {
    const onSelect = jest.fn();
    render(<DeviceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tablet, iPad' }));
    expect(onSelect).toHaveBeenCalledWith('tablet');
  });

  it('calls onSelect with laptop when Laptop, Notebook is clicked', () => {
    const onSelect = jest.fn();
    render(<DeviceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Laptop, Notebook' }));
    expect(onSelect).toHaveBeenCalledWith('laptop');
  });

  it('calls onSelect with desktop when Computer is clicked', () => {
    const onSelect = jest.fn();
    render(<DeviceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Computer' }));
    expect(onSelect).toHaveBeenCalledWith('desktop');
  });
});
