import apiClient from '@/api/client';
import { InterventionsImportStore } from '@/stores/interventionsImportStore';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('i18next', () => ({
  t: (key: string) => key,
}));

describe('InterventionsImportStore upload errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps proxy 413 responses to a clear Excel upload-size message', async () => {
    const store = new InterventionsImportStore();
    const file = new File(['data'], 'interventions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 413, data: '<html>Request Entity Too Large</html>' },
    });

    await store.importFromExcel(file);

    expect(store.error).toMatch(/Excel upload is too large/i);
    expect(store.error).toMatch(/under 50 MB/i);
  });

  it('keeps backend import validation messages and metadata', async () => {
    const store = new InterventionsImportStore();
    const file = new File(['data'], 'interventions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: 'Sheet "Content" not found.',
          error_code: 'sheet_not_found',
          available_sheets: ['Data'],
        },
      },
    });

    await store.importFromExcel(file);

    expect(store.error).toBe('Sheet "Content" not found.');
    expect(store.errorCode).toBe('sheet_not_found');
    expect(store.availableSheets).toEqual(['Data']);
  });
});

describe('InterventionsImportStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeFile = () =>
    new File(['data'], 'interventions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

  it('reset() clears loading/error/sheets/result', () => {
    const store = new InterventionsImportStore();
    store.loading = true;
    store.error = 'boom';
    store.errorCode = 'x';
    store.availableSheets = ['A'];
    store.result = { created: 1 };

    store.reset();

    expect(store.loading).toBe(false);
    expect(store.error).toBe('');
    expect(store.errorCode).toBe('');
    expect(store.availableSheets).toEqual([]);
    expect(store.result).toBeNull();
  });

  it('clearError() clears error state but leaves loading/result untouched', () => {
    const store = new InterventionsImportStore();
    store.error = 'boom';
    store.errorCode = 'x';
    store.availableSheets = ['A'];
    store.result = { created: 1 };

    store.clearError();

    expect(store.error).toBe('');
    expect(store.errorCode).toBe('');
    expect(store.availableSheets).toEqual([]);
    expect(store.result).toEqual({ created: 1 });
  });

  it('is a no-op when an import is already in flight', async () => {
    const store = new InterventionsImportStore();
    store.loading = true;

    await store.importFromExcel(makeFile());

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('uploads the file with the given options and stores a nested result', async () => {
    const store = new InterventionsImportStore();
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: { result: { created: 3, updated: 1, skipped: 0 } },
    });

    await store.importFromExcel(makeFile(), {
      sheet_name: 'Content',
      dry_run: true,
      keep_legacy_fields: false,
      default_lang: 'de',
      limit: 10,
    });

    const [url, formData, config] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/interventions/import/excel');
    expect(formData.get('sheet_name')).toBe('Content');
    expect(formData.get('dry_run')).toBe('true');
    expect(formData.get('keep_legacy_fields')).toBe('false');
    expect(formData.get('default_lang')).toBe('de');
    expect(formData.get('limit')).toBe('10');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

    expect(store.result).toEqual({ created: 3, updated: 1, skipped: 0 });
    expect(store.loading).toBe(false);
    expect(store.error).toBe('');
  });

  it('falls back to a flat result shape when the response has no result wrapper', async () => {
    const store = new InterventionsImportStore();
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: { created: 5 },
    });

    await store.importFromExcel(makeFile());

    expect(store.result).toEqual({ created: 5 });
  });

  it('omits optional fields from the FormData when not provided', async () => {
    const store = new InterventionsImportStore();
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });

    await store.importFromExcel(makeFile());

    const formData = (apiClient.post as jest.Mock).mock.calls[0][1];
    expect(formData.get('sheet_name')).toBeNull();
    expect(formData.get('dry_run')).toBeNull();
    expect(formData.get('limit')).toBeNull();
  });

  it('maps a response-less error (no err.response) to the network-failure message', async () => {
    const store = new InterventionsImportStore();
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await store.importFromExcel(makeFile());

    expect(store.error).toMatch(/could not reach the server/i);
    expect(store.errorCode).toBe('');
    expect(store.availableSheets).toEqual([]);
    expect(store.result).toBeNull();
  });

  it('falls back to the generic import-failed message for an unrecognized status', async () => {
    const store = new InterventionsImportStore();
    (apiClient.post as jest.Mock).mockRejectedValueOnce({ response: { status: 422, data: {} } });

    await store.importFromExcel(makeFile());

    expect(store.error).toMatch(/Import failed/i);
  });
});
