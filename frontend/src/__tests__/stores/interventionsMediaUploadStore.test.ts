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

  it('reset() clears loading, error, and results back to their initial values', async () => {
    const store = new InterventionsMediaUploadStore();
    const file = makeFile('3500_web_de.mp4', 10);
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));
    await store.uploadMedia([file]);
    expect(store.error).not.toBe('');

    store.reset();

    expect(store.loading).toBe(false);
    expect(store.error).toBe('');
    expect(store.results).toBeNull();
  });

  it('clearError() clears only the error message', async () => {
    const store = new InterventionsMediaUploadStore();
    const file = makeFile('3500_web_de.mp4', 10);
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));
    await store.uploadMedia([file]);
    expect(store.error).not.toBe('');

    store.clearError();

    expect(store.error).toBe('');
  });

  it('ignores a second uploadMedia call while one is already in progress', async () => {
    const store = new InterventionsMediaUploadStore();
    const file = makeFile('3500_web_de.mp4', 10);
    let resolvePost: (v: unknown) => void = () => {};
    (apiClient.post as jest.Mock).mockReturnValueOnce(
      new Promise((res) => {
        resolvePost = res;
      })
    );

    const first = store.uploadMedia([file]);
    expect(store.loading).toBe(true);

    await store.uploadMedia([file]); // no-op: loading guard returns immediately
    expect(apiClient.post).toHaveBeenCalledTimes(1);

    resolvePost({ data: { results: [okResult(file.name)] } });
    await first;
    expect(store.loading).toBe(false);
  });

  it('treats a file with no readable size as zero bytes when batching', () => {
    const zeroSize = makeFile('empty.mp4', 0);
    const normal = makeFile('3500_web_de.mp4', 10 * 1024 * 1024);
    expect(splitFilesIntoUploadBatches([zeroSize, normal])).toEqual([[zeroSize, normal]]);
  });

  it('keeps already-collected results from earlier successful batches when a later batch errors', async () => {
    const store = new InterventionsMediaUploadStore();
    const fileA = makeFile('3500_web_de.mp4', 600 * 1024 * 1024);
    const fileB = makeFile('3501_web_de.mp4', 500 * 1024 * 1024);

    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({ data: { results: [okResult(fileA.name)] } })
      .mockRejectedValueOnce(new Error('Network Error'));

    await store.uploadMedia([fileA, fileB]);

    expect(store.error).toMatch(/could not reach the server/i);
    expect(store.results).toEqual([okResult(fileA.name)]);
  });

  it('preserves the backend-provided partial results list when an upload errors', async () => {
    const store = new InterventionsMediaUploadStore();
    const file = makeFile('3500_web_de.mp4', 10);
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 500, data: { results: [okResult(file.name)] } },
    });

    await store.uploadMedia([file]);

    expect(store.results).toEqual([okResult(file.name)]);
  });
});
