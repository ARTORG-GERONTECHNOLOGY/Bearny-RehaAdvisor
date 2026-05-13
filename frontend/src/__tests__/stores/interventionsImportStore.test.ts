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
