jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key, // <-- This makes t('Open PDF') return 'Open PDF'
    i18n: { language: 'en' },
  }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PatientInterventionPopUp from '../../../components/PatientPage/PatientInterventionPopUp';
import '@testing-library/jest-dom';

jest.mock('react-pdf', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: () => <div data-testid="pdf-page" />,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

jest.mock('react-player', () => (props: any) => <div data-testid="video-player" {...props} />);
jest.mock('react-audio-player', () => (props: any) => (
  <div data-testid="audio-player" {...props} />
));
jest.mock('@microlink/react', () => (props: any) => (
  <div data-testid="microlink-preview" {...props} />
));

jest.mock('../../../utils/interventions', () => ({
  generateTagColors: () => ({}),
  getMediaTypeLabelFromUrl: jest.fn(),
}));

import { getMediaTypeLabelFromUrl } from '../../../utils/interventions';

const defaultItem = {
  title: 'Test Intervention',
  content_type: 'Exercise',
  description: 'This is a test intervention.',
  media_file: '',
  media_url: '',
  link: '',
  tags: ['mobility'],
  benefitFor: ['Flexibility'],
};

describe('PatientInterventionPopUp Component', () => {
  it('renders title, description, and tags correctly', () => {
    render(<PatientInterventionPopUp show={true} item={defaultItem} handleClose={jest.fn()} />);

    expect(screen.getByText('Test Intervention')).toBeInTheDocument();
    expect(screen.getByText('Exercise')).toBeInTheDocument();
    expect(screen.getByText('This is a test intervention.')).toBeInTheDocument();
    expect(screen.getByText('mobility')).toBeInTheDocument();
    expect(screen.getByText('Flexibility')).toBeInTheDocument();
  });

  it('calls handleClose when the close button is clicked', () => {
    const handleClose = jest.fn();
    render(<PatientInterventionPopUp show={true} item={defaultItem} handleClose={handleClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders "No media available" if no media_file or link is provided', () => {
    render(<PatientInterventionPopUp show={true} item={defaultItem} handleClose={jest.fn()} />);
    expect(screen.getByText(/No media available/i)).toBeInTheDocument();
  });

  it('renders video player for Video type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Video');
    const item = { ...defaultItem, media_file: 'video.mp4', link: '', content_type: 'Video' };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('renders audio player for Audio type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Audio');
    const item = { ...defaultItem, media_file: 'audio.mp3', link: '', content_type: 'Audio' };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    expect(screen.getByTestId('audio-player')).toBeInTheDocument();
  });

  it('renders PDF preview for PDF type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('PDF');
    const item = {
      ...defaultItem,
      media_url: 'file.pdf',
      media_file: 'file.pdf',
      content_type: 'PDF',
    };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });

  it('renders Microlink preview for Link type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Link');
    const item = { ...defaultItem, link: 'https://example.com', content_type: 'Link' };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    expect(screen.getByTestId('microlink-preview')).toBeInTheDocument();
  });

  it('renders image for Image type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Image');
    const item = { ...defaultItem, media_file: 'image.jpg', content_type: 'Image' };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThan(0);
  });
  const fallbackItem = {
    title: 'Test Intervention',
    content_type: 'Other',
    description: 'This is a test intervention.',
    media_file: 'unknown.xyz', // make sure this is provided!
    media_url: '',
    link: '', // fallback will use media_file
    tags: ['mobility'],
    benefitFor: ['Flexibility'],
  };

  it('renders fallback link button for unknown media types', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Unknown'); // mock to trigger fallback

    render(<PatientInterventionPopUp show={true} item={fallbackItem} handleClose={jest.fn()} />);

    const fallbackLink = screen.getByText(/Open Resource/i).closest('a');

    expect(fallbackLink).toBeInTheDocument();
    expect(fallbackLink).toHaveAttribute('href', 'unknown.xyz');
    expect(fallbackLink).toHaveClass('btn btn-secondary');
  });
});
