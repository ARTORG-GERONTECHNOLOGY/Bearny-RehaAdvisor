import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

// Radix Select (used by the "Default language" dropdown) relies on pointer
// capture / scrollIntoView APIs that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

// Provide stable observable mocks so MobX observer() doesn't blow up
const mockImportStore = {
  loading: false,
  error: '' as string,
  errorCode: undefined as string | undefined,
  availableSheets: [] as string[],
  result: null as any,
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
  MAX_MEDIA_UPLOAD_BATCH_MB: 1000,
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

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

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
  mockImportStore.errorCode = undefined;
  mockImportStore.availableSheets = [];
  mockImportStore.result = null;
  mockImportStore.importFromExcel.mockReset();
  mockVideoStore.loading = false;
  mockVideoStore.error = '';
  mockVideoStore.results = null;
});

// ── Tab rendering ──────────────────────────────────────────────────────────

describe('Tab rendering', () => {
  it('renders the modal with both tab links visible', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /Excel Import/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Upload Media/i })).toBeInTheDocument();
  });

  it('shows Excel content by default', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByText(/Excel file/i)).toBeInTheDocument();
    expect(screen.queryByText(/Drag & drop/i)).not.toBeInTheDocument();
  });

  it('switches to Upload Media tab and shows upload UI', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));
    expect(screen.getByText(/Drag & drop/i)).toBeInTheDocument();
    expect(screen.queryByText(/Excel file/i)).not.toBeInTheDocument();
  });

  it('switching back to Excel tab restores Excel UI', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Excel Import/i }));
    expect(screen.getByText(/Excel file/i)).toBeInTheDocument();
    expect(screen.queryByText(/Drag & drop/i)).not.toBeInTheDocument();
  });

  it('shows the naming convention help text on the media tab', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));
    expect(screen.getByText(/Naming convention/i)).toBeInTheDocument();
    expect(screen.getByText(/3500_web_de\.mp4/)).toBeInTheDocument();
  });

  it('shows valid extensions on the media tab', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));
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
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument();
  });

  it('Import button is disabled when no Excel file is selected', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /^Import$/i })).toBeDisabled();
  });

  it('Upload button is disabled when no files are selected', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeDisabled();
  });
});

// ── File validation badges ─────────────────────────────────────────────────

describe('Media file validation', () => {
  function openMediaTab() {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));
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

  it('shows ✓ badge and correct external_id for slot-2 mp4 (e.g. 40500_vid_de_2.mp4)', () => {
    openMediaTab();
    addFile(new File(['data'], '40500_vid_de_2.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('40500_vid')).toBeInTheDocument();
  });

  it('shows ✓ badge for slot-9 file (40500_vid_de_9.mp4)', () => {
    openMediaTab();
    addFile(new File(['data'], '40500_vid_de_9.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('40500_vid')).toBeInTheDocument();
  });

  it('shows ✓ badge for 5-digit ID with slot suffix (30500_web_fr_3.mp4)', () => {
    openMediaTab();
    addFile(new File(['data'], '30500_web_fr_3.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('30500_web')).toBeInTheDocument();
  });

  it('shows ✓ badge for slot audio file (3500_aud_de_2.mp3)', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_aud_de_2.mp3', { type: 'audio/mpeg' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('3500_aud')).toBeInTheDocument();
  });

  it('shows ✓ badge for slot m4a file (3500_aud_de_2.m4a)', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_aud_de_2.m4a', { type: 'audio/mp4' }));
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('3500_aud')).toBeInTheDocument();
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

  it('shows ⚠ badge and size info for a valid-name file that exceeds the upload limit', () => {
    openMediaTab();
    const bigFile = new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' });
    Object.defineProperty(bigFile, 'size', { value: 1100 * 1024 * 1024 }); // 1.1 GB
    addFile(bigFile);
    expect(screen.getByText('⚠')).toBeInTheDocument();
    expect(screen.getByText(/File too large/i)).toBeInTheDocument();
    expect(screen.getByText(/1000/)).toBeInTheDocument(); // leaves room under the 1g request limit
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

  it('shows a selected upload summary explaining automatic smaller batches', () => {
    openMediaTab();
    addFile(new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' }));
    expect(screen.getByTestId('media-upload-summary')).toHaveTextContent(
      /Large selections are uploaded in smaller batches automatically/i
    );
  });

  it('uploads only valid files that are under the safe request limit', async () => {
    openMediaTab();
    const input = document.getElementById('media-file-input') as HTMLInputElement;
    const okFile = new File(['data'], '3500_web_de.mp4', { type: 'video/mp4' });
    const invalidFile = new File(['data'], 'bad.mp4', { type: 'video/mp4' });
    const tooLargeFile = new File(['data'], '3500_pdf_de.pdf', { type: 'application/pdf' });
    Object.defineProperty(tooLargeFile, 'size', { value: 1001 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [okFile, invalidFile, tooLargeFile] } });
    fireEvent.click(screen.getByRole('button', { name: /^Upload$/i }));

    await waitFor(() => expect(mockVideoStore.uploadMedia).toHaveBeenCalledWith([okFile]));
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
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));

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
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));

    // Exact matches avoid collisions with naming-convention example text
    expect(screen.getByText('fr')).toBeInTheDocument();
    expect(screen.getByText('3500_pdf')).toBeInTheDocument();
  });
});

// ── Close behavior ─────────────────────────────────────────────────────────

describe('Close behavior', () => {
  // Bootstrap's modal header dismiss (X) button also has aria-label "Close";
  // the footer text button is the last one in DOM order.
  function getFooterCloseButton() {
    const buttons = screen.getAllByRole('button', { name: /^Close$/i });
    return buttons[buttons.length - 1];
  }

  it('resets both stores and calls onHide when Close is clicked', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(getFooterCloseButton());

    expect(mockImportStore.reset).toHaveBeenCalled();
    expect(mockVideoStore.reset).toHaveBeenCalled();
    expect(defaultProps.onHide).toHaveBeenCalled();
  });

  it('does not close while an excel import is in progress', () => {
    mockImportStore.loading = true;
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(getFooterCloseButton());
    expect(defaultProps.onHide).not.toHaveBeenCalled();
  });

  it('does not close while a media upload is in progress', () => {
    mockVideoStore.loading = true;
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.click(getFooterCloseButton());
    expect(defaultProps.onHide).not.toHaveBeenCalled();
  });
});

// ── Excel file selection & submission ──────────────────────────────────────

describe('Excel file selection & submission', () => {
  // Each Field now has a FieldLabel with a matching htmlFor/id, so the inputs
  // (and the Radix Select trigger) are reachable via their label text.
  function getExcelInput() {
    return screen.getByLabelText(/Excel file/i) as HTMLInputElement;
  }
  function getSheetNameInput() {
    return screen.getByLabelText('Sheet name') as HTMLInputElement;
  }
  function getLanguageSelectTrigger() {
    return screen.getByLabelText('Default language');
  }
  function getLimitInput() {
    return screen.getByLabelText('Limit') as HTMLInputElement;
  }

  it('enables Import once a file is selected', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.change(getExcelInput(), {
      target: { files: [new File(['x'], 'sheet.xlsx')] },
    });
    expect(screen.getByRole('button', { name: /^Import$/i })).not.toBeDisabled();
  });

  it('rejects an excel file over 50MB with an inline error and clears the selection', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    const bigFile = new File(['x'], 'huge.xlsx');
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });

    fireEvent.change(getExcelInput(), { target: { files: [bigFile] } });

    expect(screen.getByText(/Excel file is too large/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Import$/i })).toBeDisabled();
  });

  it('submits with the sheet name, default language, and no limit when limit is blank', async () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.change(getExcelInput(), {
      target: { files: [new File(['x'], 'sheet.xlsx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));

    await waitFor(() => {
      expect(mockImportStore.importFromExcel).toHaveBeenCalledWith(expect.any(File), {
        sheet_name: 'Content',
        default_lang: 'en',
        limit: null,
      });
    });
  });

  it('parses a numeric limit and forwards it', async () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.change(getExcelInput(), {
      target: { files: [new File(['x'], 'sheet.xlsx')] },
    });
    fireEvent.change(getLimitInput(), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));

    await waitFor(() => {
      expect(mockImportStore.importFromExcel).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ limit: 25 })
      );
    });
  });

  it('treats a non-numeric or non-positive limit as null', async () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.change(getExcelInput(), {
      target: { files: [new File(['x'], 'sheet.xlsx')] },
    });
    fireEvent.change(getLimitInput(), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));

    await waitFor(() => {
      expect(mockImportStore.importFromExcel).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ limit: null })
      );
    });
  });

  it('lowercases a custom sheet name and language selection', async () => {
    const user = userEvent.setup();
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.change(getExcelInput(), {
      target: { files: [new File(['x'], 'sheet.xlsx')] },
    });
    fireEvent.change(getSheetNameInput(), { target: { value: 'MySheet' } });
    // The Select options are already lowercase (DE); picking one both selects
    // it and exercises the lowercasing of defaultLang before submission.
    await user.click(getLanguageSelectTrigger());
    await user.click(await screen.findByRole('option', { name: 'DE' }));
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));

    await waitFor(() => {
      expect(mockImportStore.importFromExcel).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ sheet_name: 'MySheet', default_lang: 'de' })
      );
    });
  });

  it('calls onSuccess when the import completes without error and a result is present', async () => {
    mockImportStore.importFromExcel.mockImplementation(async () => {
      mockImportStore.result = { created: 1, updated: 0, skipped: 0 } as any;
    });
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.change(getExcelInput(), {
      target: { files: [new File(['x'], 'sheet.xlsx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));

    await waitFor(() => expect(defaultProps.onSuccess).toHaveBeenCalled());
  });

  it('does not call onSuccess when the store reports an error', async () => {
    mockImportStore.importFromExcel.mockImplementation(async () => {
      mockImportStore.error = 'Something broke';
    });
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.change(getExcelInput(), {
      target: { files: [new File(['x'], 'sheet.xlsx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));

    await waitFor(() => expect(mockImportStore.importFromExcel).toHaveBeenCalled());
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  it('shows a spinner and "Importing..." label while loading', () => {
    mockImportStore.loading = true;
    render(<ImportInterventionsModal {...defaultProps} />);
    expect(screen.getByText(/Importing.../i)).toBeInTheDocument();
  });
});

// ── Drag & drop onto the media zone ─────────────────────────────────────────

describe('Media drag & drop', () => {
  function makeDropEvent(files: File[]) {
    return { dataTransfer: { files } } as any;
  }

  it('adds files dropped with an accepted extension', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));

    const dropZone = screen.getByLabelText(/Drop zone for media files/i);
    fireEvent.drop(dropZone, makeDropEvent([new File(['x'], '3500_web_de.mp4')]));

    expect(screen.getAllByTestId('video-file-row')).toHaveLength(1);
  });

  it('filters out dropped files with an unsupported extension', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));

    const dropZone = screen.getByLabelText(/Drop zone for media files/i);
    fireEvent.drop(dropZone, makeDropEvent([new File(['x'], 'clip.avi')]));

    expect(screen.queryAllByTestId('video-file-row')).toHaveLength(0);
  });

  it('does not duplicate a dropped file that was already added', () => {
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));

    const dropZone = screen.getByLabelText(/Drop zone for media files/i);
    const file = new File(['x'], '3500_web_de.mp4');
    fireEvent.drop(dropZone, makeDropEvent([file]));
    fireEvent.drop(dropZone, makeDropEvent([file]));

    expect(screen.getAllByTestId('video-file-row')).toHaveLength(1);
  });
});

// ── Excel import result rendering ───────────────────────────────────────────

describe('Excel import result rendering', () => {
  it('shows created/updated/skipped counts and a zero-errors badge when there are none', () => {
    mockImportStore.result = { created: 3, updated: 2, skipped: 1, message: 'Done.' } as any;
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText('Done.')).toBeInTheDocument();
    expect(screen.getByText(/Created: 3/)).toBeInTheDocument();
    expect(screen.getByText(/Updated: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Skipped: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Errors: 0/)).toBeInTheDocument();
  });

  it('derives error/warning counts from the errors array when explicit counts are absent', () => {
    mockImportStore.result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [
        { row: 2, external_id: 'a', error: 'Bad row', severity: 'error' },
        { row: 3, external_id: 'b', error: 'Missing field', severity: 'warning' },
      ],
    } as any;
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText(/Errors: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Warnings: 1/)).toBeInTheDocument();
    expect(screen.getByText('Bad row')).toBeInTheDocument();
    expect(screen.getByText('Missing field')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('uses explicit errors_count/warnings fields when provided', () => {
    mockImportStore.result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors_count: 5,
      warnings: 2,
      errors: [],
    } as any;
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText(/Errors: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Warnings: 2/)).toBeInTheDocument();
  });

  it('truncates the error detail list beyond 200 entries', () => {
    mockImportStore.result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: Array.from({ length: 201 }, (_, i) => ({
        row: i,
        external_id: `id-${i}`,
        error: 'boom',
        severity: 'error',
      })),
    } as any;
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText(/Too many issues to display/i)).toBeInTheDocument();
  });

  it('shows a fallback dash when a row/id is missing from an error entry', () => {
    mockImportStore.result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ error: 'boom' }],
    } as any;
    render(<ImportInterventionsModal {...defaultProps} />);

    const idLine = screen.getByText(/Row:/).closest('span')!;
    expect(idLine.textContent).toContain('-');
  });
});

// ── Excel error alert rendering ─────────────────────────────────────────────

describe('Excel error alert rendering', () => {
  it('shows a sheet_not_found message with the list of available sheets', () => {
    mockImportStore.error = 'Sheet missing';
    (mockImportStore as any).errorCode = 'sheet_not_found';
    (mockImportStore as any).availableSheets = ['Sheet1', 'Data'];
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText(/Sheet not found in the Excel file\./i)).toBeInTheDocument();
    expect(screen.getByText('Sheet1, Data')).toBeInTheDocument();
  });

  it('shows a sheet_not_found message without a sheet list when none are available', () => {
    mockImportStore.error = 'Sheet missing';
    (mockImportStore as any).errorCode = 'sheet_not_found';
    (mockImportStore as any).availableSheets = [];
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText(/Sheet not found in the Excel file\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Available sheets:/i)).not.toBeInTheDocument();
  });

  it('shows a missing_column message', () => {
    mockImportStore.error = 'col missing';
    (mockImportStore as any).errorCode = 'missing_column';
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText(/Required column missing in the Excel file\./i)).toBeInTheDocument();
  });

  it('shows the raw error message for an unrecognized error code', () => {
    mockImportStore.error = 'Something else went wrong';
    (mockImportStore as any).errorCode = undefined;
    render(<ImportInterventionsModal {...defaultProps} />);

    expect(screen.getByText('Something else went wrong')).toBeInTheDocument();
  });

  it('shows the media upload store error on the media tab', () => {
    mockVideoStore.error = 'Upload failed';
    render(<ImportInterventionsModal {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Upload Media/i }));

    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });
});
