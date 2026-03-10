import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddInterventionModal from '@/components/AddIntervention/AddInterventionModal';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
import {
  getBadgeVariantFromUrl,
  getMediaTypeLabelFromUrl,
} from '@/components/AddIntervention/AddInterventionModal';
const mockOnAdd = jest.fn();
const defaultProps = {
  show: true,
  onHide: jest.fn(),
  onAdd: mockOnAdd,
  patient: 'patient1',
  existingInterventions: [],
  patientFunction: 'Cardiology',
};

const mockRecommendations = [
  {
    _id: 'rec1',
    title: 'Exercise Therapy',
    description: 'A description here',
    media_url: '',
    link: 'https://youtube.com/video',
    patient_types: [
      { type: 'Cardiology', frequency: 'Weekly', include_option: true, diagnosis: 'Heart' },
    ],
  },
  {
    _id: 'rec2',
    title: 'Music Therapy',
    description: 'Another description',
    media_url: 'test.mp3',
    link: '',
    patient_types: [
      { type: 'Cardiology', frequency: 'Daily', include_option: false, diagnosis: 'Heart' },
    ],
  },
  {
    _id: 'rec3',
    title: 'Strength Training (Core)',
    description: 'Strength description',
    media_url: 'video.mp4',
    link: '',
    patient_types: [
      { type: 'Cardiology', frequency: 'Weekly', include_option: true, diagnosis: 'Heart' },
    ],
  },
  {
    _id: 'rec4',
    title: 'Endurance Training (Supportive)',
    description: 'Endurance description',
    media_url: 'audio.mp3',
    link: '',
    patient_types: [
      { type: 'Cardiology', frequency: 'Daily', include_option: false, diagnosis: 'Heart' },
    ],
  },
];

const renderComponent = (props = defaultProps) => render(<AddInterventionModal {...props} />);

describe('AddInterventionModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('displays loading spinner while fetching recommendations', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    expect(screen.getByRole('status')).toBeInTheDocument(); // ✅ Spinner has role="status"
    await waitFor(() => screen.getByText('Exercise Therapy')); // Wait for data to load
  });

  it('handles API failure gracefully (error handling coverage)', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));
    renderComponent();

    await waitFor(() => expect(screen.getByText(/Add Intervention/i)).toBeInTheDocument());
    // Here you could also assert console.error was called if you want to mock console.error
  });

  it('filters recommendations by content type Video', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    fireEvent.change(screen.getByLabelText(/Filter by Content Type/i), {
      target: { value: 'Video' },
    });

    // Exercise Therapy (YouTube link → Video) and Strength Training (video.mp4 → Video)
    expect(screen.getByText('Exercise Therapy')).toBeInTheDocument();
    expect(screen.getByText('Strength Training (Core)')).toBeInTheDocument();
  });

  it('displays fetched recommendations and allows adding an intervention', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));
    const addButtons = screen.getAllByText(/^Add$/); // Exact match
    const addButton = addButtons[0]; // Select the correct one if needed

    fireEvent.click(addButton);

    expect(mockOnAdd).toHaveBeenCalledWith('rec1');
  });

  it('shows "Already Added" if intervention is in existingInterventions', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    const props = { ...defaultProps, existingInterventions: ['rec1'] };
    renderComponent(props);

    await waitFor(() => screen.getByText('Exercise Therapy'));
    expect(screen.getByText(/Already Added/i)).toBeInTheDocument();
  });

  it('shows fallback message when no interventions are available (empty list coverage)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { recommendations: [] } });
    renderComponent();

    await waitFor(() =>
      expect(screen.getByText(/No interventions available/i)).toBeInTheDocument()
    );
  });

  it('displays loading spinner while fetching recommendations', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    expect(screen.getByRole('status')).toBeInTheDocument(); // ✅ Spinner has role="status"
    await waitFor(() => screen.getByText('Exercise Therapy')); // Wait for data to load
  });

  it('handles API failure gracefully (error handling coverage)', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));
    renderComponent();

    await waitFor(() => expect(screen.getByText(/Add Intervention/i)).toBeInTheDocument());
    // Here you could also assert console.error was called if you want to mock console.error
  });

  it('filters recommendations by content type Audio', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    fireEvent.change(screen.getByLabelText(/Filter by Content Type/i), {
      target: { value: 'Audio' },
    });

    // Music Therapy (test.mp3 → Audio) and Endurance Training (audio.mp3 → Audio)
    expect(screen.getByText('Music Therapy')).toBeInTheDocument();
    expect(screen.getByText('Endurance Training (Supportive)')).toBeInTheDocument();
  });

  it('displays fetched recommendations and allows adding an intervention', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));
    const addButtons = screen.getAllByText(/^Add$/); // Exact match
    const addButton = addButtons[0]; // Select the correct one if needed
    fireEvent.click(addButton);

    expect(mockOnAdd).toHaveBeenCalledWith('rec1');
  });

  it('filters correctly when no filters are applied (lines 36-37 coverage)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    // No filters applied - both items should appear
    expect(screen.getByText('Exercise Therapy')).toBeInTheDocument();
    expect(screen.getByText('Music Therapy')).toBeInTheDocument();
  });

  it('shows "Already Added" if intervention is in existingInterventions', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    const props = { ...defaultProps, existingInterventions: ['rec1'] };
    renderComponent(props);

    await waitFor(() => screen.getByText('Exercise Therapy'));
    expect(screen.getByText(/Already Added/i)).toBeInTheDocument();
  });

  it('shows fallback message when no interventions are available (empty list coverage)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { recommendations: [] } });
    renderComponent();

    await waitFor(() =>
      expect(screen.getByText(/No interventions available/i)).toBeInTheDocument()
    );
  });

  it('covers filtering logic by content type (lines 36-44)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    // Filter by Content Type: Audio (should match Music Therapy)
    fireEvent.change(screen.getByLabelText(/Filter by Content Type/i), {
      target: { value: 'Audio' },
    });
    expect(screen.getByText('Music Therapy')).toBeInTheDocument();
    expect(screen.queryByText('Exercise Therapy')).not.toBeInTheDocument();
  });

  it('covers error handling properly and logs the error (lines 54-62)', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Mocked API error'));

    renderComponent();

    await waitFor(() => expect(screen.getByText(/Add Intervention/i)).toBeInTheDocument());
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching recommendations:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it('filters recommendations properly when both filters are empty (coverage for lines 36-37)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });

    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    // ✅ Both recommendations should be shown when no filters are applied:
    expect(screen.getByText('Exercise Therapy')).toBeInTheDocument();
    expect(screen.getByText('Music Therapy')).toBeInTheDocument();
  });

  it('filters recommendations properly by content type (coverage for lines 42-44)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });

    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    // Filter by Content Type: Video
    fireEvent.change(screen.getByLabelText(/Filter by Content Type/i), {
      target: { value: 'Video' },
    });

    expect(screen.getByText('Exercise Therapy')).toBeInTheDocument();
    expect(screen.queryByText('Music Therapy')).not.toBeInTheDocument();
  });

  it('handles API failure and triggers error handling (coverage for lines 54-55, 60-62)', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));

    renderComponent();

    // Wait until loading completes (because of finally block)
    await waitFor(() => expect(screen.getByText(/Add Intervention/i)).toBeInTheDocument());

    // ✅ Error was logged:
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching recommendations:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('filters out all items when contentTypeFilter does not match (covers lines 36-37)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    // Set a filter value that does NOT exist (e.g., PDF)
    fireEvent.change(screen.getByLabelText(/Filter by Content Type/i), {
      target: { value: 'PDF' },
    });

    expect(screen.queryByText('Exercise Therapy')).not.toBeInTheDocument();
    expect(screen.queryByText('Music Therapy')).not.toBeInTheDocument();
    expect(screen.getByText(/No interventions available/i)).toBeInTheDocument();
  });
  it('filters correctly shows no results for unmatched type (correct coverage for 42-44)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { recommendations: mockRecommendations },
    });
    renderComponent();

    await waitFor(() => screen.getByText('Exercise Therapy'));

    // Filter by Link - none of our mock items are plain links (Exercise has YouTube link which is Video)
    fireEvent.change(screen.getByLabelText(/Filter by Content Type/i), {
      target: { value: 'Link' },
    });

    // All items should be filtered out
    expect(screen.queryByText('Exercise Therapy')).not.toBeInTheDocument();
    expect(screen.queryByText('Music Therapy')).not.toBeInTheDocument();
    expect(screen.getByText(/No interventions available/i)).toBeInTheDocument();
  });

  it('handles API error and clears loading state (covers 54-55, 60-62)', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));

    renderComponent();

    // Properly wait for spinner to be gone
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching recommendations:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  const t = (key: string) => key; // Simple mock for t()

  describe('getBadgeVariantFromUrl', () => {
    it('returns "primary" for vimeo link without mediaUrl', () => {
      expect(getBadgeVariantFromUrl('', 'https://vimeo.com/video')).toBe('primary');
    });

    it('returns "warning" if no mediaUrl and link is not youtube or vimeo', () => {
      expect(getBadgeVariantFromUrl('', 'https://example.com')).toBe('warning');
    });

    it('returns "danger" for .pdf files', () => {
      expect(getBadgeVariantFromUrl('file.pdf', '')).toBe('danger');
    });

    it('returns "success" for image files', () => {
      expect(getBadgeVariantFromUrl('image.jpg', '')).toBe('success');
      expect(getBadgeVariantFromUrl('image.jpeg', '')).toBe('success');
      expect(getBadgeVariantFromUrl('image.png', '')).toBe('success');
    });

    it('returns "secondary" if none of the conditions match', () => {
      expect(getBadgeVariantFromUrl('unknownfile.xyz', '')).toBe('secondary');
    });
  });

  describe('getMediaTypeLabelFromUrl', () => {
    it('returns "Video" for vimeo link without mediaUrl', () => {
      expect(getMediaTypeLabelFromUrl('', 'https://vimeo.com/video', t)).toBe('Video');
    });

    it('returns "Link" if no mediaUrl and link is not youtube or vimeo', () => {
      expect(getMediaTypeLabelFromUrl('', 'https://example.com', t)).toBe('Link');
    });

    it('returns "PDF" for .pdf files', () => {
      expect(getMediaTypeLabelFromUrl('file.pdf', '', t)).toBe('PDF');
    });

    it('returns "Image" for image files', () => {
      expect(getMediaTypeLabelFromUrl('image.jpg', '', t)).toBe('Image');
      expect(getMediaTypeLabelFromUrl('image.jpeg', '', t)).toBe('Image');
      expect(getMediaTypeLabelFromUrl('image.png', '', t)).toBe('Image');
    });

    it('returns "Unknown" if none of the conditions match', () => {
      expect(getMediaTypeLabelFromUrl('unknownfile.xyz', '', t)).toBe('Unknown');
    });
    it('returns "primary" for .mp4 media files', () => {
      expect(getBadgeVariantFromUrl('video.mp4', '')).toBe('primary');
    });
    it('returns "Video" for .mp4 media files', () => {
      expect(getMediaTypeLabelFromUrl('video.mp4', '', t)).toBe('Video');
    });
  });
});
