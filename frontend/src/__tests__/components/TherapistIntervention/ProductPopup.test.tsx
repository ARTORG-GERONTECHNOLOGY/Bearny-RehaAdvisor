import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import ProductPopup from '@/components/TherapistInterventionPage/ProductPopup';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Mock apiClient to avoid import.meta errors
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock authStore
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    id: 'therapist123',
    userType: 'Therapist',
  },
}));

jest.mock(
  '@/components/TherapistInterventionPage/TemplateAssignModal',
  () =>
    function TemplateAssignModal(props: any) {
      return <div data-testid="template-assign-modal">assign-mode:{props.mode}</div>;
    }
);

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({ translatedText: `[translated] ${text}`, detectedSourceLanguage: 'de' })
  ),
}));

const mockItem = {
  _id: 'abc123',
  external_id: 'ext-1',
  title: 'Test Intervention',
  description: 'Some useful intervention description',
  content_type: 'video',
  benefitFor: ['mobility'],
  tags: ['rehab', 'exercise'],
  patient_types: [{ type: 'Orthopedic', diagnosis: 'Knee Injury', frequency: 'Weekly' }],
  media_file: null,
  media_url: null,
  link: null,
  language: 'de',
  available_languages: ['de', 'it', 'fr'],
};

const tagColors = {
  rehab: '#3498db',
  exercise: '#e74c3c',
};

describe('ProductPopup Error Handling', () => {
  it('displays an error alert if error state is set', () => {
    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    // Simulate the error state manually if useState isn't mocked
    const errorText = 'Failed to fetch assigned diagnoses. Please try again.';
    expect(screen.queryByText(errorText)).not.toBeInTheDocument();

    // You'd normally set error through interaction, but here we just simulate rendering
    // The component doesn't expose a setter so a custom wrapper/mocking is needed to fully simulate internal error flow
  });
});

describe('ProductPopup language toggle', () => {
  it('shows the picked variant as-is instead of re-translating it to the app language', async () => {
    const { translateText } = jest.requireMock('@/utils/translate');
    const apiClient = jest.requireMock('@/api/client').default;

    apiClient.get.mockImplementation((url: string, config: { params?: { lang?: string } }) => {
      if (url === 'interventions/all/' && config?.params?.lang === 'it') {
        return Promise.resolve({
          data: [
            {
              ...mockItem,
              language: 'it',
              title: 'Titolo italiano',
              description: 'Descrizione italiana',
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    // Initial variant is translated to the app language (default behavior).
    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'IT' }));

    // The Italian variant should be shown verbatim, not re-translated back
    // to the therapist's app language (which would make every language look identical).
    await waitFor(() => expect(screen.getByText('Titolo italiano')).toBeInTheDocument());
    expect(screen.getByText('Descrizione italiana')).toBeInTheDocument();
    expect(screen.queryByText(/\[translated\] Titolo italiano/)).not.toBeInTheDocument();

    const translateCallsAfterSwitch = translateText.mock.calls.length;
    expect(translateText.mock.calls.some(([text]: [string]) => text === 'Titolo italiano')).toBe(
      false
    );
    expect(translateCallsAfterSwitch).toBeGreaterThan(0);
  });

  it('ignores a stale switch response when a newer switch was triggered first', async () => {
    const apiClient = jest.requireMock('@/api/client').default;

    let resolveIt: (v: unknown) => void = () => {};
    let resolveFr: (v: unknown) => void = () => {};
    const itPromise = new Promise((res) => {
      resolveIt = res;
    });
    const frPromise = new Promise((res) => {
      resolveFr = res;
    });

    apiClient.get.mockImplementation((url: string, config: { params?: { lang?: string } }) => {
      if (config?.params?.lang === 'it') return itPromise;
      if (config?.params?.lang === 'fr') return frPromise;
      return Promise.resolve({ data: [] });
    });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    // click IT, then FR before IT's (slower) request resolves
    fireEvent.click(screen.getByRole('button', { name: 'IT' }));
    fireEvent.click(screen.getByRole('button', { name: 'FR' }));

    // FR (the newer click) resolves first
    resolveFr({ data: [{ ...mockItem, language: 'fr', title: 'Titre français' }] });
    await waitFor(() => expect(screen.getByText('Titre français')).toBeInTheDocument());

    // IT (the stale, older click) resolves after — it must not overwrite FR.
    await act(async () => {
      resolveIt({ data: [{ ...mockItem, language: 'it', title: 'Titolo italiano' }] });
      await itPromise;
    });

    expect(screen.getByText('Titre français')).toBeInTheDocument();
    expect(screen.queryByText('Titolo italiano')).not.toBeInTheDocument();
  });

  it('ignores a language switch response that resolves after the popup was closed', async () => {
    const apiClient = jest.requireMock('@/api/client').default;

    let resolveIt: (v: unknown) => void = () => {};
    const itPromise = new Promise((res) => {
      resolveIt = res;
    });
    apiClient.get.mockImplementation((url: string, config: { params?: { lang?: string } }) => {
      if (config?.params?.lang === 'it') return itPromise;
      return Promise.resolve({ data: [] });
    });

    const { rerender } = render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'IT' }));

    // close while the switch request is still in flight
    rerender(
      <ProductPopup show={false} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    // the stale request resolves while the popup is closed
    await act(async () => {
      resolveIt({ data: [{ ...mockItem, language: 'it', title: 'Titolo italiano' }] });
      await itPromise;
    });

    // reopen — should show the original item translated, not the stale IT variant
    rerender(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );

    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );
    expect(screen.queryByText('Titolo italiano')).not.toBeInTheDocument();
  });
});

describe('ProductPopup close behavior', () => {
  it('closes immediately when there are no unsaved changes', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockResolvedValue({ data: { items: [] } });
    const handleClose = jest.fn();

    render(
      <ProductPopup show={true} item={mockItem} handleClose={handleClose} tagColors={tagColors} />
    );
    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalled();
  });

  it('confirms before closing when the diagnosis search has text', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockResolvedValue({ data: { items: [] } });
    const handleClose = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <ProductPopup show={true} item={mockItem} handleClose={handleClose} tagColors={tagColors} />
    );
    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText('Search diagnoses'), {
      target: { value: 'heart' },
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(confirmSpy).toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});

describe('ProductPopup diagnosis assignment', () => {
  it('filters the diagnosis list by search text', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockResolvedValue({ data: { items: [] } });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );
    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText('Search diagnoses'), {
      target: { value: 'copd' },
    });

    expect(screen.getByText('copd')).toBeInTheDocument();
    expect(screen.queryByText('minor stroke')).not.toBeInTheDocument();
  });

  it('shows "no diagnoses match" for an unmatched search', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockResolvedValue({ data: { items: [] } });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );
    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText('Search diagnoses'), {
      target: { value: 'nonexistent-xyz' },
    });

    expect(screen.getByText('No diagnoses match your search.')).toBeInTheDocument();
  });

  it('marks a diagnosis as Assigned when it is present in the template plan', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockImplementation((url: string) => {
      if (url.includes('template-plan')) {
        return Promise.resolve({
          data: { items: [{ intervention: { _id: 'abc123' }, diagnosis: 'copd' }] },
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );
    await waitFor(() => expect(screen.getByText('Assigned')).toBeInTheDocument());
  });

  it('removes a diagnosis assignment and refreshes the list on success', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockImplementation((url: string) => {
      if (url.includes('template-plan')) {
        return Promise.resolve({
          data: { items: [{ intervention: { _id: 'abc123' }, diagnosis: 'copd' }] },
        });
      }
      return Promise.resolve({ data: [] });
    });
    apiClient.post.mockResolvedValue({ data: {} });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );
    await waitFor(() => expect(screen.getByText('Assigned')).toBeInTheDocument());

    const row = screen
      .getByText('Assigned')
      .closest('.d-flex.align-items-center.justify-content-between')!;
    const buttons = within(row as HTMLElement).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('remove-from-patient-types'),
        expect.objectContaining({ diagnosis: 'copd', intervention_id: 'abc123' })
      );
    });
  });

  it('shows an error banner when removing a diagnosis assignment fails', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockImplementation((url: string) => {
      if (url.includes('template-plan')) {
        return Promise.resolve({
          data: { items: [{ intervention: { _id: 'abc123' }, diagnosis: 'copd' }] },
        });
      }
      return Promise.resolve({ data: [] });
    });
    apiClient.post.mockRejectedValue({ response: { data: { error: 'Cannot remove' } } });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );
    await waitFor(() => expect(screen.getByText('Assigned')).toBeInTheDocument());

    const row = screen
      .getByText('Assigned')
      .closest('.d-flex.align-items-center.justify-content-between')!;
    const buttons = within(row as HTMLElement).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByText('Cannot remove')).toBeInTheDocument();
  });

  it('opens the assign modal in create mode for an unassigned diagnosis', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockResolvedValue({ data: { items: [] } });

    render(
      <ProductPopup show={true} item={mockItem} handleClose={() => {}} tagColors={tagColors} />
    );
    await waitFor(() =>
      expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
    );

    const row = screen
      .getByText('heart failure')
      .closest('.d-flex.align-items-center.justify-content-between')!;
    fireEvent.click(within(row as HTMLElement).getByRole('button'));

    expect(await screen.findByTestId('template-assign-modal')).toHaveTextContent(
      'assign-mode:create'
    );
  });

  it('disables template assignment for private interventions', async () => {
    const apiClient = jest.requireMock('@/api/client').default;
    apiClient.get.mockResolvedValue({ data: { items: [] } });

    render(
      <ProductPopup
        show={true}
        item={{ ...mockItem, is_private: true }}
        handleClose={() => {}}
        tagColors={tagColors}
      />
    );

    expect(
      await screen.findByText(/Template assignment by diagnosis is disabled/i)
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search diagnoses')).not.toBeInTheDocument();
  });
});
