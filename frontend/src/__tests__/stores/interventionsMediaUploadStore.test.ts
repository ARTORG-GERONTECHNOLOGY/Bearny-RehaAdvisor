import apiClient from '@/api/client';
import {
  InterventionsMediaUploadStore,
  MAX_MEDIA_UPLOAD_BATCH_BYTES,
  splitFilesIntoUploadBatches,
} from '@/stores/interventionsMediaUploadStore';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('i18next', () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    key.replace('{{maxSize}}', String(values?.maxSize ?? '')),
}));

const makeFile = (name: string, size: number) => {
  const file = new File(['data'], name, { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const okResult = (filename: string) => ({
  filename,
  status: 'ok' as const,
  external_id: filename.replace(/_de\.mp4$/, ''),
  interventions_updated: [`${filename}-id`],
});

describe('InterventionsMediaUploadStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('splits files into sequential batches below the safe request limit', () => {
    const fileA = makeFile('3500_web_de.mp4', 600 * 1024 * 1024);
    const fileB = makeFile('3501_web_de.mp4', 500 * 1024 * 1024);
    const fileC = makeFile('3502_web_de.mp4', 100 * 1024 * 1024);

    expect(splitFilesIntoUploadBatches([fileA, fileB, fileC])).toEqual([[fileA], [fileB, fileC]]);
  });

  it('uploads batches sequentially and combines all result rows', async () => {
    const store = new InterventionsMediaUploadStore();
    const fileA = makeFile('3500_web_de.mp4', 600 * 1024 * 1024);
    const fileB = makeFile('3501_web_de.mp4', 500 * 1024 * 1024);
    const fileC = makeFile('3502_web_de.mp4', 100 * 1024 * 1024);

    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({ data: { results: [okResult(fileA.name)] } })
      .mockResolvedValueOnce({ data: { results: [okResult(fileB.name), okResult(fileC.name)] } });

    await store.uploadMedia([fileA, fileB, fileC]);

    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(((apiClient.post as jest.Mock).mock.calls[0][1] as FormData).getAll('files[]')).toEqual([
      fileA,
    ]);
    expect(((apiClient.post as jest.Mock).mock.calls[1][1] as FormData).getAll('files[]')).toEqual([
      fileB,
      fileC,
    ]);
    expect(store.results).toEqual([
      okResult(fileA.name),
      okResult(fileB.name),
      okResult(fileC.name),
    ]);
    expect(store.error).toBe('');
  });

  it('does not send a file that cannot fit under the safe request limit', async () => {
    const store = new InterventionsMediaUploadStore();
    const tooLarge = makeFile('3500_web_de.mp4', MAX_MEDIA_UPLOAD_BATCH_BYTES + 1);

    await store.uploadMedia([tooLarge]);

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(store.results?.[0]).toMatchObject({
      filename: tooLarge.name,
      status: 'error',
      error: expect.stringContaining('Maximum allowed size is 1000 MB'),
    });
  });

  it('maps proxy 413 responses to a clear upload-size message', async () => {
    const store = new InterventionsMediaUploadStore();
    const file = makeFile('3500_web_de.mp4', 10);
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 413, data: '<html>Request Entity Too Large</html>' },
    });

    await store.uploadMedia([file]);

    expect(store.error).toMatch(/too large for the server/i);
    expect(store.error).toMatch(/smaller batches/i);
  });

  it('keeps backend JSON errors when the backend gives a specific message', async () => {
    const store = new InterventionsMediaUploadStore();
    const file = makeFile('3500_web_de.mp4', 10);
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 400, data: { error: 'No files provided. Use key "files[]".' } },
    });

    await store.uploadMedia([file]);

    expect(store.error).toBe('No files provided. Use key "files[]".');
  });

  it('maps missing response errors to a clear network message', async () => {
    const store = new InterventionsMediaUploadStore();
    const file = makeFile('3500_web_de.mp4', 10);
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

    await store.uploadMedia([file]);

    expect(store.error).toMatch(/could not reach the server/i);
  });
});
