import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// Provide stable observable mocks so MobX observer() doesn't blow up
const mockImportStore = {
  loading: false,
  error: '',
  result: null,
  reset: jest.fn(),
  clearError: jest.fn(),
  importFromExcel: jest.fn(),
};

const mockVideoStore = {
  loading: false,
  error: '',
  results: null,
  reset: jest.fn(),
  clearError: jest.fn(),
  uploadMedia: jest.fn(),
};

jest.mock('@/stores/interventionsImportStore', () => ({
  interventionsImportStore: mockImportStore,
}));

jest.mock('@/stores/interventionsMediaUploadStore', () => ({
  interventionsMediaUploadStore: mockVideoStore,
}));

jest.mock('@/config/interventions.json', () => ({
  importDefaults: {
    sheetName: 'Content',
    defaultLang: 'en',
    keepLegacyFields: false,
    dryRun: false,
  },
}));

// Import AFTER mocks are set up
import ImportInterventionsModal from '@/components/TherapistInterventionPage/ImportInterventionsModal';

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  onSuccess: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockImportStore.loading = false;
  mockImportStore.error = '';
  mockImportStore.result = null;
  mockVideoStore.loading = false;
  mockVideoStore.error = '';
  mockVideoStore.results = null;
});

// ── Tab rendering ──────────────────────────────────────────────────────────

describe('Tab rendering', () => {
  it('renders the modal with both tab links visible', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Excel Import/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload Media/i })).toBeInTheDocument();
  });

  it('shows Excel content by default', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByText(/Excel file/i)).toBeInTheDocument();
    expect(screen.queryByText(/Drag & drop/i)).not.toBeInTheDocument();
  });

  it('switches to Upload Media tab and shows upload UI', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));
    expect(screen.getByText(/Drag & drop/i)).toBeInTheDocument();
    expect(screen.queryByText(/Excel file/i)).not.toBeInTheDocument();
  });

  it('switching back to Excel tab restores Excel UI', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));
    fireEvent.click(screen.getByRole('button', { name: /Excel Import/i }));
    expect(screen.getByText(/Excel file/i)).toBeInTheDocument();
    expect(screen.queryByText(/Drag & drop/i)).not.toBeInTheDocument();
  });

  it('shows the naming convention help text on the media tab', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));
    expect(screen.getByText(/Naming convention/i)).toBeInTheDocument();
    expect(screen.getByText(/3500_web_de\.mp4/)).toBeInTheDocument();
  });

  it('shows valid extensions on the media tab', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));
    // Target the <code> element specifically — the drop-zone div also matches the regex
    expect(screen.getByText(/mp4.*mp3.*wav.*pdf.*jpg/i, { selector: 'code' })).toBeInTheDocument();
  });
});

// ── Footer buttons ─────────────────────────────────────────────────────────

describe('Footer buttons', () => {
  it('shows Import button on Excel tab', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /^Import$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Upload$/i })).not.toBeInTheDocument();
  });

  it('shows Upload button on media tab', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument();
  });

  it('Import button is disabled when no Excel file is selected', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /^Import$/i })).toBeDisabled();
  });

  it('Upload button is disabled when no files are selected', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeDisabled();
  });
});

// ── File validation badges ─────────────────────────────────────────────────

describe('Media file validation', () => {
  function openMediaTab() {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));
  }

  function addFile(file: File) {
    const input = document.getElementById('media-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('shows ✗ badge for file with unsupported extension (.avi)', () => {
    openMediaTab();
    addFile(new File(['data'], 'myfile.avi', { type: 'video/avi' }));
    expect(screen.getByText('✗')).toBeInTheDocument();
    expect(screen.getByText(/Invalid filename format/i)).toBeInTheDocument();
  });

  it('shows ✗ badge for mp4 with random name (no ID pattern)', () => {
    openMediaTab();
    addFile(new File(['data'], 'random_video.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('shows ✗ badge for mp4 with unknown format code', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_xyz_de.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('shows ✓ badge and extracted external_id for valid mp4', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    // Exact match on the extracted external_id — the naming convention also has "3500_web_de.mp4"
    expect(screen.getByText('3500_web')).toBeInTheDocument();
  });

  it('shows ✓ badge for valid mp3', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_aud_de.mp3', { type: 'audio/mpeg' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('3500_aud')).toBeInTheDocument();
  });

  it('shows ✓ badge for valid pdf', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_pdf_fr.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('3500_pdf')).toBeInTheDocument();
  });

  it('shows ✓ badge for valid jpg image', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_img_it.jpg', { type: 'image/jpeg' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('3500_img')).toBeInTheDocument();
  });

  it('shows ✓ badge for valid self-made format', () => {
    openMediaTab();
    addFile(new File(['data'], '30500_vid_pt.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('30500_vid')).toBeInTheDocument();
  });

  it('Upload button becomes enabled after a valid file is added', () => {
    openMediaTab();
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeDisabled();
    addFile(new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' }));
    expect(screen.getByRole('button', { name: /^Upload$/i })).not.toBeDisabled();
  });

  it('Upload button stays disabled when only invalid files are present', () => {
    openMediaTab();
    addFile(new File(['data'], 'bad_name.mp4', { type: 'video/mp4' }));
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeDisabled();
  });

  it('shows mixed badges when both valid and invalid files are added', () => {
    openMediaTab();
    const input = document.getElementById('media-file-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' })] },
    });
    fireEvent.change(input, {
      target: { files: [new File(['data'], 'bad.mp4', { type: 'video/mp4' })] },
    });
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('remove button deletes the file from the list', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' }));
    // The filename appears in both the file row span and the naming-convention code example,
    // so use the data-testid to count actual file rows instead.
    expect(screen.getAllByTestId('video-file-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Remove file/i }));
    expect(screen.queryAllByTestId('video-file-row')).toHaveLength(0);
  });

  it('shows ⚠ badge and size info for a valid-name file that exceeds the 1 GB limit', () => {
    openMediaTab();
    const bigFile = new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' });
    Object.defineProperty(bigFile, 'size', { value: 1100 * 1024 * 1024 }); // 1.1 GB
    addFile(bigFile);
    expect(screen.getByText('⚠')).toBeInTheDocument();
    expect(screen.getByText(/File too large/i)).toBeInTheDocument();
    expect(screen.getByText(/1024/)).toBeInTheDocument(); // shows max MB
  });

  it('Upload button stays disabled when only too-large files are present', () => {
    openMediaTab();
    const bigFile = new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' });
    Object.defineProperty(bigFile, 'size', { value: 1100 * 1024 * 1024 });
    addFile(bigFile);
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeDisabled();
  });

  it('Upload button is enabled when a valid-size file is present alongside a too-large one', () => {
    openMediaTab();
    const input = document.getElementById('media-file-input') as HTMLInputElement;
    const bigFile = new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' });
    Object.defineProperty(bigFile, 'size', { value: 1100 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    const okFile = new File(['data'], '3500_pdf_de.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [okFile] } });

    expect(screen.getByText('⚠')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Upload$/i })).not.toBeDisabled();
  });
});

// ── Upload results display ─────────────────────────────────────────────────

describe('Upload results display', () => {
  it('shows upload results when store has results', () => {
    mockVideoStore.results = [
      {
        filename: '3500_web_de.mp4',
        status: 'ok',
        external_id: '3500_web',
        language: 'de',
        interventions_updated: ['id1'],
      },
      {
        filename: 'bad.mp4',
        status: 'error',
        external_id: null,
        interventions_updated: [],
        error: 'Filename does not match naming convention.',
      },
    ];

    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));

    expect(screen.getByText(/Upload results/i)).toBeInTheDocument();
    expect(screen.getByText(/Updated 1 intervention/i)).toBeInTheDocument();
    expect(screen.getByText(/Filename does not match naming convention/i)).toBeInTheDocument();
  });

  it('shows language code in results for successful uploads', () => {
    mockVideoStore.results = [
      {
        filename: '3500_pdf_fr.pdf',
        status: 'ok',
        external_id: '3500_pdf',
        language: 'fr',
        interventions_updated: ['id1'],
      },
    ];

    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Upload Media/i }));

    // Exact matches avoid collisions with naming-convention example text
    expect(screen.getByText('fr')).toBeInTheDocument();
    expect(screen.getByText('3500_pdf')).toBeInTheDocument();
  });
});
