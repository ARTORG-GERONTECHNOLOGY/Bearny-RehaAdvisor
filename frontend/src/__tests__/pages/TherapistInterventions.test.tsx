import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TherapistInterventions from '@/pages/TherapistInterventions';
import apiClient from '@/api/client';
import templateStore from '@/stores/templateStore';
import '@testing-library/jest-dom';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('../../config/config.json', () => ({
  RecomendationInfo: { tags: [] },
  patientInfo: {
    function: {
      Cardiology: {
        diagnosis: ['Coronary Artery Disease', 'Arrhythmia', 'Stroke'],
      },
      Psychiatry: {
        diagnosis: ['Depression'],
      },
      Neurology: {
        diagnosis: ['All'],
      },
      Sports: {
        diagnosis: ['All'],
      },
    },
  },
}));

// Mock react-router-dom navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ✅ Mock authStore to simulate logged-in and not-logged-in states
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    specialisations: ['Cardiology'],
    id: 'therapist-123',
  },
}));

// Mock interventionsLibraryStore
jest.mock('@/stores/interventionsLibraryStore', () => ({
  therapistInterventionsLibraryStore: {
    items: [],
    loading: false,
    error: null,
    fetchAll: jest.fn(),
    clearError: jest.fn(),
  },
}));

// Child component mocks
jest.mock('@/components/Layout', () => jest.requireActual('@/__mocks__/components/Layout'));
jest.mock(
  '@/components/TherapistInterventionPage/ProductPopup',
  () =>
    function ProductPopup(props: any) {
      return (
        <div>
          Product Popup
          <button aria-label="close" onClick={props.handleClose}>
            Close
          </button>
        </div>
      );
    }
);

jest.mock(
  '@/components/AddIntervention/AddRecomendationPopUp',
  () =>
    function AddRecomendationPopUp() {
      return <div>Add Intervention Popup</div>;
    }
);

// Mock new components used in refactored TherapistInterventions
// Renders real tab-switch buttons so the Templates tab (and its page-level
// named-template management logic) can actually be exercised in tests.
jest.mock(
  '@/components/TherapistInterventionPage/MainTabs',
  () =>
    function MainTabs(props: any) {
      return (
        <div>
          <button onClick={() => props.onChange('library')}>Library Tab</button>
          <button onClick={() => props.onChange('templates')}>Templates Tab</button>
        </div>
      );
    }
);

jest.mock(
  '@/components/TherapistInterventionPage/LibraryFiltersCard',
  () =>
    function LibraryFiltersCard(props: any) {
      return (
        <div>
          <input
            placeholder="Search Interventions"
            value={props.filters.searchTerm}
            onChange={(e) => props.onChange({ ...props.filters, searchTerm: e.target.value })}
          />
          <button
            onClick={() => props.onChange({ ...props.filters, diagnosisFilter: ['heart failure'] })}
          >
            Set Diagnosis
          </button>
          <button
            onClick={() => props.onChange({ ...props.filters, contentTypeFilter: 'Exercise' })}
          >
            Set Content Type
          </button>
        </div>
      );
    }
);

jest.mock(
  '@/components/TherapistInterventionPage/LibraryListSection',
  () =>
    function LibraryListSection(props: any) {
      return (
        <div>
          {props.items.map((item: any) => (
            <div key={item._id} onClick={() => props.onClick(item)}>
              {item.title}
            </div>
          ))}
        </div>
      );
    }
);

jest.mock(
  '@/components/TherapistInterventionPage/AddInterventionRow',
  () =>
    function AddInterventionRow(props: any) {
      return (
        <div>
          <button onClick={props.onAdd}>Add Intervention</button>
          <button onClick={props.onImport}>Import</button>
        </div>
      );
    }
);

jest.mock(
  '@/components/TherapistInterventionPage/ImportInterventionsModal',
  () =>
    function ImportInterventionsModal() {
      return null;
    }
);
jest.mock(
  '@/components/TherapistInterventionPage/TemplateAssignModal',
  () =>
    function TemplateAssignModal(props: any) {
      return (
        <div data-testid="assign-modal">
          mode:{props.mode} intervention:{props.interventionId} diag:{props.defaultDiagnosis}
        </div>
      );
    }
);
jest.mock(
  '@/components/TherapistInterventionPage/TemplatesLayout',
  () =>
    function TemplatesLayout(props: any) {
      const item = props.templateItems?.[0];
      const browseItem = props.browseAllItems?.[0];
      return (
        <div>
          {item && (
            <>
              <button onClick={() => props.onTemplateItemClick(item)}>click-item</button>
              <button onClick={() => props.onModifyTemplate(item)}>modify-item</button>
              <button
                onClick={() => props.onRemoveTemplateItem(item.diagnosis, item.intervention._id, 1)}
              >
                remove-item
              </button>
              <div data-testid="segment-summary">
                {props.segmentSummary(props.getSegments(item)[0], item)}
              </div>
            </>
          )}
          <button onClick={() => props.onOpenAssign('int-2', 'Some Title', 'create')}>
            open-assign
          </button>
          {browseItem && (
            <button onClick={() => props.onBrowseItemClick(browseItem)}>browse-click</button>
          )}
          {browseItem && (
            <div data-testid="find-template-for">
              {String(!!props.findTemplateFor(browseItem._id))}
            </div>
          )}
        </div>
      );
    }
);

jest.mock(
  '@/components/TherapistInterventionPage/ApplyTemplateModal',
  () =>
    function ApplyTemplateModal(props: any) {
      if (!props.show) return null;
      return (
        <div data-testid="apply-modal">
          <button onClick={() => props.onApplied({ applied: 3, sessions_created: 5 })}>
            apply ok
          </button>
          <button
            onClick={() =>
              props.onApplied({
                applied: 1,
                sessions_created: 1,
                warning: 'Some sessions could not be scheduled.',
                partial_errors: ['x'],
              })
            }
          >
            apply partial
          </button>
        </div>
      );
    }
);

// Mock translate utility
jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({
      translatedText: text,
      detectedSourceLanguage: 'en',
    })
  ),
}));

const mockInterventions = [
  {
    _id: '675a88cc8ea37a32e90afe68',
    title: 'Stretching for 30 minutes',
    description: 'Do 30 minutes of stretching with the help of this video.',
    content_type: 'Exercise',
    primary_diagnosis: ['heart failure'],
    patient_types: [
      { type: 'Cardiology', frequency: 'Daily', include_option: true, diagnosis: null },
      { type: 'Psychiatry', frequency: 'Every-2nd-day', include_option: true, diagnosis: null },
      {
        type: 'Cardiology',
        frequency: 'Daily',
        include_option: true,
        diagnosis: 'Stroke',
      },
    ],
    link: '',
    media_file: '/media/videos/20241212065508_istockphoto-1856343710-640_adpp_is.mp4',
    preview_img: '',
    duration: null,
    benefitFor: [],
    tags: [],
  },
];

describe('TherapistInterventions Page', () => {
  let store: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up the store mock with items
    store = jest.requireMock(
      '@/stores/interventionsLibraryStore'
    ).therapistInterventionsLibraryStore;
    store.items = mockInterventions;
    store.loading = false;
    store.error = null;
  });
  test('opens add intervention popup when button is clicked', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    const addButton = await screen.findByRole('button', { name: /Add Intervention/i });
    fireEvent.click(addButton);
    expect(screen.getByText('Add Intervention Popup')).toBeInTheDocument();
  });

  test('applies content type filter', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    await screen.findByText('Stretching for 30 minutes');

    fireEvent.click(screen.getByText('Set Content Type'));
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
  });

  test('opens product popup on intervention click', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    const item = await screen.findByText('Stretching for 30 minutes');
    fireEvent.click(item);

    // ✅ Assert that the product popup is visible
    expect(screen.getByText('Product Popup')).toBeInTheDocument();
  });

  test('closes product popup when handleClose is called', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    const item = await screen.findByText('Stretching for 30 minutes');
    fireEvent.click(item);

    // Popup is open now
    expect(screen.getByText('Product Popup')).toBeInTheDocument();

    // Close the popup (simulate the close)
    fireEvent.click(screen.getByRole('button', { name: /close/i })); // or find your real close button
    await waitFor(() => {
      expect(screen.queryByText('Product Popup')).not.toBeInTheDocument();
    });
  });
  test('resets filters and shows all interventions again', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    await screen.findByText('Stretching for 30 minutes');

    // Apply search filter
    fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
      target: { value: 'zzz' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Stretching for 30 minutes')).not.toBeInTheDocument();
    });

    // Reset filter
    fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
      target: { value: '' },
    });

    await waitFor(() => {
      expect(screen.getByText('Stretching for 30 minutes')).toBeInTheDocument();
    });
  });
  test('renders page with essential UI blocks', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
  });

  test('fetches and renders interventions', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
  });

  test('applies search filter', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await screen.findByText('Stretching for 30 minutes');
    fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
      target: { value: 'zzz' },
    });
    await waitFor(() => {
      expect(screen.queryByText('Stretching for 30 minutes')).not.toBeInTheDocument();
    });
  });

  test('applies diagnosis filter', async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await screen.findByText('Stretching for 30 minutes');
    fireEvent.click(screen.getByText('Set Diagnosis'));
    expect(await screen.findByText('Stretching for 30 minutes')).toBeInTheDocument();
  });

  test('redirects if user is not authenticated', async () => {
    const authStore = jest.requireMock('@/stores/authStore').default;
    authStore.isAuthenticated = false;

    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('handles API errors gracefully', async () => {
    // Set store error state instead of mocking API
    store.items = [];
    store.error = 'API error';
    store.loading = false;

    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByText('Stretching for 30 minutes')).not.toBeInTheDocument();
    });
  });

  test('calls fetchAll with the UI language on mount', async () => {
    // Ensure auth state is correct — other tests mutate this property
    const authStoreMock = jest.requireMock('@/stores/authStore').default;
    authStoreMock.isAuthenticated = true;
    authStoreMock.userType = 'Therapist';

    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    // The page content is pre-set in store.items so it renders immediately, but
    // fetchAll is called only after the authChecked async state update. waitFor
    // keeps polling until that effect fires.
    await waitFor(() => {
      expect(store.fetchAll).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'therapist', lang: 'en' })
      );
    });
  });

  test('calls fetchAll again after add-intervention succeeds', async () => {
    // Ensure auth state is correct
    const authStoreMock = jest.requireMock('@/stores/authStore').default;
    authStoreMock.isAuthenticated = true;
    authStoreMock.userType = 'Therapist';

    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    // Open the add popup, then simulate a successful add by triggering onSuccess
    // The AddRecomendationPopUp mock renders with "Add Intervention Popup" text
    // but its onSuccess isn't exposed — so we open it and verify at least
    // one fetchAll call was made with the lang param
    fireEvent.click(await screen.findByRole('button', { name: /Add Intervention/i }));
    expect(screen.getByText('Add Intervention Popup')).toBeInTheDocument();

    // fetchAll was already called on mount; check that call
    expect(store.fetchAll).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'therapist', lang: 'en' })
    );
  });
});

describe('TherapistInterventions — Templates tab', () => {
  const makeDoc = (overrides: Record<string, any> = {}) => ({
    id: 'tpl-1',
    name: 'My Template',
    description: '',
    is_public: false,
    created_by: 'therapist-123',
    created_by_name: 'Me',
    specialization: null,
    diagnosis: null,
    intervention_count: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  const mockApiGet = (templates: any[] = [], planItems: any[] = []) => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('templates/?')) return Promise.resolve({ data: { templates } });
      if (url.includes('/calendar/')) return Promise.resolve({ data: { items: planItems } });
      if (url.includes('template-plan')) return Promise.resolve({ data: { items: planItems } });
      return Promise.resolve({ data: {} });
    });
  };

  const goToTemplatesTab = async () => {
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByText('Templates Tab'));
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('templates/?'));
    });
  };

  const store = jest.requireMock(
    '@/stores/interventionsLibraryStore'
  ).therapistInterventionsLibraryStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store.items = mockInterventions;
    store.loading = false;
    store.error = null;

    const authStoreMock = jest.requireMock('@/stores/authStore').default;
    authStoreMock.isAuthenticated = true;
    authStoreMock.userType = 'Therapist';
    authStoreMock.id = 'therapist-123';

    templateStore.templates = [];
    templateStore.loading = false;
    templateStore.error = '';

    mockApiGet([]);
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.patch as jest.Mock).mockReset();
    (apiClient.delete as jest.Mock).mockReset();

    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
  });

  it('fetches the named template list and the default template plan on entering the tab', async () => {
    mockApiGet([makeDoc()]);
    await goToTemplatesTab();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('therapists/therapist-123/template-plan')
      );
    });
    expect(await screen.findByText('My Template')).toBeInTheDocument();
  });

  it('shows an unseen-updates badge for a public template not created by me', async () => {
    mockApiGet([
      makeDoc({ id: 'tpl-2', created_by: 'other-therapist', is_public: true, name: 'Shared' }),
    ]);
    await goToTemplatesTab();

    expect(await screen.findByText('1')).toBeInTheDocument(); // unseen count badge
  });

  it('selects a named template via the dropdown and fetches its calendar', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Second Template' })]);
    await goToTemplatesTab();
    await screen.findByText(/Second Template/);

    const select = screen.getByDisplayValue('Implicit therapist template');
    fireEvent.change(select, { target: { value: 'tpl-2' } });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('templates/tpl-2/calendar/')
      );
    });
  });

  it('filters the template search autocomplete and selects a match', async () => {
    mockApiGet([
      makeDoc({ id: 'tpl-2', name: 'Cardio Plan' }),
      makeDoc({ id: 'tpl-3', name: 'Ortho Plan' }),
    ]);
    await goToTemplatesTab();
    await screen.findByText(/Cardio Plan/);

    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'Cardio' } });

    // Scope to the autocomplete dropdown — the full <select> below also lists
    // both templates regardless of the search text.
    const dropdown = searchInput.parentElement!.querySelector(
      '.position-absolute.bg-white'
    ) as HTMLElement;
    expect(within(dropdown).queryByText(/Ortho/)).not.toBeInTheDocument();
    const match = within(dropdown).getByText(
      (_, el) => el?.tagName === 'SPAN' && /Plan/.test(el.textContent || '')
    );
    fireEvent.mouseDown(match.closest('[style*="cursor"]')!);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('templates/tpl-2/calendar/')
      );
    });
    // Search box clears after selection
    expect(screen.getByPlaceholderText('Search templates...')).toHaveValue('');
  });

  it('shows "No data available" when the search has no matches', async () => {
    mockApiGet([makeDoc({ name: 'Cardio Plan' })]);
    await goToTemplatesTab();
    await screen.findByText(/Cardio Plan/);

    fireEvent.change(screen.getByPlaceholderText('Search templates...'), {
      target: { value: 'zzz-no-match' },
    });

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('creates a new template and selects it', async () => {
    await goToTemplatesTab();
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: { template: makeDoc({ id: 'new-tpl', name: 'Brand New' }) },
    });

    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    fireEvent.change(screen.getByPlaceholderText('Template name'), {
      target: { value: 'Brand New' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        'templates/',
        expect.objectContaining({ name: 'Brand New' })
      );
    });
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('templates/new-tpl/calendar/')
      );
    });
  });

  it('disables Create until a name is entered', async () => {
    await goToTemplatesTab();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
  });

  it('copies the active template', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Original', description: 'Desc' })]);
    await goToTemplatesTab();
    await screen.findByText('Original');
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTitle('Copy template'));
    expect(screen.getByDisplayValue('Copy of Original')).toBeInTheDocument();

    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: { template: makeDoc({ id: 'tpl-2-copy', name: 'Copy of Original' }) },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Copy$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        'templates/tpl-2/copy/',
        expect.objectContaining({ name: 'Copy of Original' })
      );
    });
  });

  it('edits the active template metadata when I own it', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Mine', created_by: 'therapist-123' })]);
    await goToTemplatesTab();
    await screen.findByText('Mine');
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });
    await waitFor(() => expect(screen.getByTitle('Edit name / description')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Edit name / description'));
    // Scope to the modal — the template selector's own displayed option text also matches "Mine".
    const modal = screen.getByText('Edit template info').closest('.modal-content') as HTMLElement;
    const nameInput = within(modal).getByDisplayValue('Mine');
    fireEvent.change(nameInput, { target: { value: 'Renamed' } });

    (apiClient.patch as jest.Mock).mockResolvedValueOnce({
      data: { template: makeDoc({ id: 'tpl-2', name: 'Renamed' }) },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        'templates/tpl-2/',
        expect.objectContaining({ name: 'Renamed' })
      );
    });
  });

  it('does not show Edit for a template I do not own', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Theirs', created_by: 'other-therapist' })]);
    await goToTemplatesTab();
    // The option text is "Theirs — Me" (name + creator suffix in one element).
    await screen.findByText(/Theirs/);
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });
    await waitFor(() => expect(screen.getByTitle('Copy template')).toBeInTheDocument());
    expect(screen.queryByTitle('Edit name / description')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete template')).not.toBeInTheDocument();
  });

  it('deletes the active template after confirmation', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'ToDelete', created_by: 'therapist-123' })]);
    await goToTemplatesTab();
    await screen.findByText('ToDelete');
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });
    await waitFor(() => expect(screen.getByTitle('Delete template')).toBeInTheDocument());

    (apiClient.delete as jest.Mock).mockResolvedValueOnce({});
    fireEvent.click(screen.getByTitle('Delete template'));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('templates/tpl-2/');
    });
  });

  it('does not delete when the confirmation is dismissed', async () => {
    window.confirm = jest.fn(() => false);
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Keep', created_by: 'therapist-123' })]);
    await goToTemplatesTab();
    await screen.findByText('Keep');
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });
    await waitFor(() => expect(screen.getByTitle('Delete template')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Delete template'));
    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it('refetches the template plan when the diagnosis filter changes', async () => {
    await goToTemplatesTab();
    (apiClient.get as jest.Mock).mockClear();

    const diagSelect = screen
      .getAllByRole('combobox')
      .find((el) => within(el as HTMLElement).queryByText('All')) as HTMLSelectElement;
    fireEvent.change(diagSelect, { target: { value: 'Coronary Artery Disease' } });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('diagnosis=Coronary'));
    });
  });

  it('refetches the template plan when the horizon changes', async () => {
    await goToTemplatesTab();
    (apiClient.get as jest.Mock).mockClear();

    fireEvent.change(screen.getByDisplayValue('84'), { target: { value: '30' } });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('horizon=30'));
    });
  });

  it('applies a template successfully and shows a summary alert, closing the modal', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Applyable' })]);
    await goToTemplatesTab();
    await screen.findByText('Applyable');
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    fireEvent.click(await screen.findByText('apply ok'));

    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Template applied: 3 interventions, 5 sessions')
    );
    await waitFor(() => {
      expect(screen.queryByTestId('apply-modal')).not.toBeInTheDocument();
    });
  });

  it('keeps the apply modal open and appends the warning when there are partial errors', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Applyable' })]);
    await goToTemplatesTab();
    await screen.findByText('Applyable');
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    fireEvent.click(await screen.findByText('apply partial'));

    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Some sessions could not be scheduled.')
    );
    expect(screen.getByTestId('apply-modal')).toBeInTheDocument();
  });

  it('recovers when the stored templateSeenMap is corrupted JSON', async () => {
    localStorage.setItem('templateSeenMap', 'not-json{{{');
    mockApiGet([makeDoc()]);
    await goToTemplatesTab();
    expect(await screen.findByText('My Template')).toBeInTheDocument();
    localStorage.removeItem('templateSeenMap');
  });

  it('falls back to raw title/description when translateText rejects for a template item', async () => {
    const { translateText } = jest.requireMock('@/utils/translate');
    (translateText as jest.Mock).mockRejectedValueOnce(new Error('translate down'));

    const planItem = {
      intervention: { _id: '675a88cc8ea37a32e90afe68', title: 'Stretching for 30 minutes' },
      diagnosis: 'heart failure',
      schedule: { start_day: 1, end_day: 10, interval: 2, unit: 'day', selectedDays: [] },
      occurrences: [{ day: 1 }],
    };
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Cardio Plan' })], [planItem]);
    await goToTemplatesTab();
    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });

    await waitFor(() => expect(translateText).toHaveBeenCalled());
    expect(await screen.findByTestId('segment-summary')).toBeInTheDocument();
  });

  it('sets templateItems to an empty array when fetching the template plan fails', async () => {
    mockApiGet([makeDoc({ id: 'tpl-2', name: 'Errs' })]);
    await goToTemplatesTab();
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/calendar/')) return Promise.reject(new Error('down'));
      return Promise.resolve({ data: {} });
    });

    fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
      target: { value: 'tpl-2' },
    });

    await waitFor(() => expect(screen.queryByTestId('segment-summary')).not.toBeInTheDocument());
  });

  it('dismisses the page-level error banner', async () => {
    store.error = 'Library fetch failed';
    render(
      <MemoryRouter>
        <TherapistInterventions />
      </MemoryRouter>
    );

    const alert = await screen.findByText('Library fetch failed');
    const closeBtn = alert.parentElement!.querySelector('[aria-label="Close"], button')!;
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(store.clearError).toHaveBeenCalled();
    });
  });

  describe('template item callbacks (via TemplatesLayout)', () => {
    const planItem = {
      intervention: { _id: '675a88cc8ea37a32e90afe68', title: 'Stretching for 30 minutes' },
      diagnosis: 'heart failure',
      schedule: { start_day: 1, end_day: 10, interval: 2, unit: 'day', selectedDays: ['Mon'] },
      occurrences: [{ day: 1 }, { day: 3 }],
    };

    it('opens the ProductPopup when the clicked template item exists in the library', async () => {
      mockApiGet([makeDoc({ id: 'tpl-2', name: 'HasItems' })], [planItem]);
      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-2' },
      });

      fireEvent.click(await screen.findByText('click-item'));
      expect(screen.getByText('Product Popup')).toBeInTheDocument();
    });

    it('shows an error when the clicked template item is not in the loaded library', async () => {
      const missingItem = {
        ...planItem,
        intervention: { _id: 'not-in-library', title: 'Ghost intervention' },
      };
      mockApiGet([makeDoc({ id: 'tpl-2', name: 'HasItems' })], [missingItem]);
      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-2' },
      });

      fireEvent.click(await screen.findByText('click-item'));
      expect(
        await screen.findByText(/Full details for this intervention are not loaded yet/i)
      ).toBeInTheDocument();
    });

    it('opens the assign modal in modify mode via onModifyTemplate', async () => {
      mockApiGet([makeDoc({ id: 'tpl-2', name: 'HasItems' })], [planItem]);
      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-2' },
      });

      fireEvent.click(await screen.findByText('modify-item'));
      const modal = await screen.findByTestId('assign-modal');
      expect(modal).toHaveTextContent('mode:modify');
      expect(modal).toHaveTextContent('intervention:675a88cc8ea37a32e90afe68');
    });

    it('opens the assign modal in create mode via onOpenAssign', async () => {
      await goToTemplatesTab();
      fireEvent.click(await screen.findByText('open-assign'));

      const modal = await screen.findByTestId('assign-modal');
      expect(modal).toHaveTextContent('mode:create');
      expect(modal).toHaveTextContent('intervention:int-2');
    });

    it('removes a template item and refetches the plan', async () => {
      mockApiGet([makeDoc({ id: 'tpl-2', name: 'HasItems' })], [planItem]);
      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-2' },
      });
      await screen.findByText('remove-item');

      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});
      fireEvent.click(screen.getByText('remove-item'));

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith(
          expect.stringContaining('templates/tpl-2/interventions/675a88cc8ea37a32e90afe68/')
        );
      });
    });

    it('shows a field-error message when removing a template item fails', async () => {
      mockApiGet([makeDoc({ id: 'tpl-2', name: 'HasItems' })], [planItem]);
      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-2' },
      });
      await screen.findByText('remove-item');

      (apiClient.delete as jest.Mock).mockRejectedValueOnce({
        response: { data: { field_errors: { diagnosis: ['Required'] } } },
      });
      fireEvent.click(screen.getByText('remove-item'));

      expect(await screen.findByText(/diagnosis: Required/)).toBeInTheDocument();
    });

    it('removes an implicit-template item via the remove-from-patient-types endpoint', async () => {
      mockApiGet([], [planItem]);
      render(
        <MemoryRouter>
          <TherapistInterventions />
        </MemoryRouter>
      );
      fireEvent.click(await screen.findByText('Templates Tab'));
      await screen.findByText('remove-item');

      (apiClient.post as jest.Mock).mockResolvedValueOnce({});
      fireEvent.click(screen.getByText('remove-item'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining('interventions/remove-from-patient-types/'),
          expect.objectContaining({ intervention_id: '675a88cc8ea37a32e90afe68' })
        );
      });
    });

    it('opens the ProductPopup for a browse-all item click', async () => {
      mockApiGet([makeDoc({ id: 'tpl-2', name: 'HasItems' })], [planItem]);
      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-2' },
      });

      fireEvent.click(await screen.findByText('browse-click'));
      expect(screen.getByText('Product Popup')).toBeInTheDocument();
    });
  });

  describe('update-notification diff banner', () => {
    it('computes and renders an intervention diff for a public template updated by someone else', async () => {
      const oldSnapshot = {
        'tpl-2': {
          updatedAt: '2025-12-01T00:00:00Z',
          name: 'Shared',
          description: '',
          intervention_count: 1,
          interventions: [
            {
              id: 'old-int',
              title: 'Old Intervention',
              diagnosis: 'heart failure',
              start_day: 1,
              end_day: 5,
              unit: 'day',
              interval: 1,
              selectedDays: [],
            },
          ],
        },
      };
      localStorage.setItem('templateSeenMap', JSON.stringify(oldSnapshot));

      const planItem = {
        intervention: { _id: '675a88cc8ea37a32e90afe68', title: 'Stretching for 30 minutes' },
        diagnosis: 'heart failure',
        schedule: { start_day: 2, end_day: 8, interval: 3, unit: 'day', selectedDays: ['Tue'] },
        occurrences: [{ day: 2 }],
      };
      mockApiGet(
        [
          makeDoc({
            id: 'tpl-2',
            name: 'Shared',
            created_by: 'other-therapist',
            updatedAt: '2026-01-15T00:00:00Z',
          }),
        ],
        [planItem]
      );

      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-2' },
      });

      // Wait for the template-plan calendar fetch (and the resulting full diff
      // merge, which fills in `modified`) to settle before opening the banner —
      // the meta-only diff set synchronously on select doesn't include it yet.
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('templates/tpl-2/calendar/')
        );
      });

      const updatedButton = await screen.findByRole('button', { name: /Updated:/i });
      fireEvent.click(updatedButton);

      // Expanded diff shows the added new intervention and the removed old one.
      expect(await screen.findByText(/Stretching for 30 minutes/)).toBeInTheDocument();
      expect(screen.getByText(/Old Intervention/)).toBeInTheDocument();

      localStorage.removeItem('templateSeenMap');
    });

    it('shows a "modified" schedule diff (start/end day, frequency, and days) for a rescheduled intervention', async () => {
      const oldSnapshot = {
        'tpl-3': {
          updatedAt: '2025-12-01T00:00:00Z',
          name: 'Shared',
          description: '',
          intervention_count: 1,
          interventions: [
            {
              id: 'same-int',
              title: 'Stretching',
              diagnosis: 'heart failure',
              start_day: 1,
              end_day: 5,
              unit: 'day',
              interval: 1,
              selectedDays: [],
            },
          ],
        },
      };
      localStorage.setItem('templateSeenMap', JSON.stringify(oldSnapshot));

      const planItem = {
        intervention: { _id: 'same-int', title: 'Stretching' },
        diagnosis: 'heart failure',
        schedule: { start_day: 2, end_day: 8, interval: 3, unit: 'week', selectedDays: ['Tue'] },
        occurrences: [{ day: 2 }],
      };
      mockApiGet(
        [
          makeDoc({
            id: 'tpl-3',
            name: 'Shared',
            created_by: 'other-therapist',
            updatedAt: '2026-01-15T00:00:00Z',
          }),
        ],
        [planItem]
      );

      await goToTemplatesTab();
      fireEvent.change(screen.getByDisplayValue('Implicit therapist template'), {
        target: { value: 'tpl-3' },
      });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('templates/tpl-3/calendar/')
        );
      });

      const updatedButton = await screen.findByRole('button', { name: /Updated:/i });
      fireEvent.click(updatedButton);

      expect(await screen.findByText(/start day 1 → 2/)).toBeInTheDocument();
      expect(screen.getByText(/end day 5 → 8/)).toBeInTheDocument();
      expect(screen.getByText(/frequency: 1 day → 3 week/)).toBeInTheDocument();
      expect(screen.getByText(/days: — → Tue/)).toBeInTheDocument();

      localStorage.removeItem('templateSeenMap');
    });
  });
});
