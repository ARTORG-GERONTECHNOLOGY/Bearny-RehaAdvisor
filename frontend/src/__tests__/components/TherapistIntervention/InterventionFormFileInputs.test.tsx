import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InterventionFormFileInputs from '../../../components/AddIntervention/InterventionFormFileInputs';
import '@testing-library/jest-dom';

describe('InterventionFormFileInputs', () => {
  const renderComponent = (props: any) => render(<InterventionFormFileInputs {...props} />);

  it('does not render when show is false', () => {
    const { container } = renderComponent({ show: false, onFileChange: jest.fn() });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders file input when show is true', () => {
    renderComponent({ show: true, onFileChange: jest.fn() });
    expect(screen.getByLabelText('UploadMediaFile')).toBeInTheDocument();
    expect(screen.getByText(/SupportedFormats/i)).toBeInTheDocument();
  });

  it('calls onFileChange with selected file', () => {
    const onFileChangeMock = jest.fn();
    renderComponent({ show: true, onFileChange: onFileChangeMock });

    const fileInput = screen.getByLabelText('UploadMediaFile') as HTMLInputElement;

    // Simulate file selection
    const file = new File(['dummy content'], 'example.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onFileChangeMock).toHaveBeenCalledWith(file);
  });

  it('calls onFileChange with null if no file is selected', () => {
    const onFileChangeMock = jest.fn();
    renderComponent({ show: true, onFileChange: onFileChangeMock });

    const fileInput = screen.getByLabelText('UploadMediaFile') as HTMLInputElement;

    // Simulate no file selection
    fireEvent.change(fileInput, { target: { files: [] } });

    expect(onFileChangeMock).toHaveBeenCalledWith(null);
  });
});
