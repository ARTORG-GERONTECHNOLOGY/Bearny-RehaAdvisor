import { render, screen, fireEvent } from '@testing-library/react';
import InterventionFormFileInputs from '@/components/AddIntervention/InterventionFormFileInputs';
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

  it('rejects a file larger than 1GB, clears the input, and shows a size error', () => {
    const onFileChangeMock = jest.fn();
    renderComponent({ show: true, onFileChange: onFileChangeMock });

    const fileInput = screen.getByLabelText('UploadMediaFile') as HTMLInputElement;
    const bigFile = new File(['x'], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(bigFile, 'size', { value: 1024 * 1024 * 1024 + 1 });

    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(onFileChangeMock).toHaveBeenCalledWith(null);
    expect(fileInput.value).toBe('');
    expect(screen.getByText('File is too large (max 1GB).')).toBeInTheDocument();
  });

  it('clears a previous size error once a valid file is selected', () => {
    const onFileChangeMock = jest.fn();
    renderComponent({ show: true, onFileChange: onFileChangeMock });

    const fileInput = screen.getByLabelText('UploadMediaFile') as HTMLInputElement;
    const bigFile = new File(['x'], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(bigFile, 'size', { value: 1024 * 1024 * 1024 + 1 });
    fireEvent.change(fileInput, { target: { files: [bigFile] } });
    expect(screen.getByText('File is too large (max 1GB).')).toBeInTheDocument();

    const smallFile = new File(['x'], 'small.mp4', { type: 'video/mp4' });
    fireEvent.change(fileInput, { target: { files: [smallFile] } });

    expect(screen.queryByText('File is too large (max 1GB).')).not.toBeInTheDocument();
    expect(onFileChangeMock).toHaveBeenLastCalledWith(smallFile);
  });
});
