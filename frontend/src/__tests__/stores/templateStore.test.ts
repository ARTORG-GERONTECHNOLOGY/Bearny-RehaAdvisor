import templateStore from '@/stores/templateStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

const makeDoc = (overrides = {}) => ({
  id: 'tpl-1',
  name: 'Test Template',
  description: '',
  is_public: false,
  created_by: 'u1',
  created_by_name: 'Alice',
  specialization: null,
  diagnosis: null,
  intervention_count: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('templateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state between tests
    templateStore.templates = [];
    templateStore.loading = false;
    templateStore.error = '';
  });

  // ------------------------------------------------------------------
  // fetchTemplates
  // ------------------------------------------------------------------
  describe('fetchTemplates', () => {
    it('fetches templates with no filters', async () => {
      const doc = makeDoc();
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { templates: [doc] } });

      await templateStore.fetchTemplates();

      expect(apiClient.get).toHaveBeenCalledWith('templates/?');
      expect(templateStore.templates).toEqual([doc]);
      expect(templateStore.loading).toBe(false);
      expect(templateStore.error).toBe('');
    });

    it('appends query params from filters', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { templates: [] } });

      await templateStore.fetchTemplates({ name: 'Stroke', specialization: 'Neuro' });

      const call = (apiClient.get as jest.Mock).mock.calls[0][0] as string;
      expect(call).toContain('name=Stroke');
      expect(call).toContain('specialization=Neuro');
    });

    it('sets error on API failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Forbidden' } },
      });

      await templateStore.fetchTemplates();

      expect(templateStore.error).toBe('Forbidden');
      expect(templateStore.templates).toEqual([]);
      expect(templateStore.loading).toBe(false);
    });

    it('falls back to default error message when response has no error field', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await templateStore.fetchTemplates();

      expect(templateStore.error).toBe('Failed to load templates.');
    });
  });

  // ------------------------------------------------------------------
  // createTemplate
  // ------------------------------------------------------------------
  describe('createTemplate', () => {
    it('posts payload and prepends the returned doc', async () => {
      const existing = makeDoc({ id: 'old-1', name: 'Old' });
      templateStore.templates = [existing];

      const created = makeDoc({ id: 'new-1', name: 'New Template' });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: { template: created } });

      const result = await templateStore.createTemplate({
        name: 'New Template',
        description: '',
        is_public: false,
      });

      expect(apiClient.post).toHaveBeenCalledWith('templates/', {
        name: 'New Template',
        description: '',
        is_public: false,
      });
      expect(result).toEqual(created);
      expect(templateStore.templates[0]).toEqual(created);
      expect(templateStore.templates[1]).toEqual(existing);
    });
  });

  // ------------------------------------------------------------------
  // deleteTemplate
  // ------------------------------------------------------------------
  describe('deleteTemplate', () => {
    it('calls DELETE and removes template from state', async () => {
      const doc = makeDoc({ id: 'del-1' });
      const other = makeDoc({ id: 'other-1' });
      templateStore.templates = [doc, other];

      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});

      await templateStore.deleteTemplate('del-1');

      expect(apiClient.delete).toHaveBeenCalledWith('templates/del-1/');
      expect(templateStore.templates).toEqual([other]);
    });

    it('propagates error if DELETE fails', async () => {
      (apiClient.delete as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      await expect(templateStore.deleteTemplate('bad-id')).rejects.toThrow('Not found');
    });
  });

  // ------------------------------------------------------------------
  // copyTemplate
  // ------------------------------------------------------------------
  describe('copyTemplate', () => {
    it('posts to copy endpoint without name when omitted', async () => {
      const copy = makeDoc({ id: 'copy-1', name: 'Copy of Test Template' });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: { template: copy } });

      const result = await templateStore.copyTemplate('tpl-1');

      expect(apiClient.post).toHaveBeenCalledWith('templates/tpl-1/copy/', {});
      expect(result).toEqual(copy);
      expect(templateStore.templates[0]).toEqual(copy);
    });

    it('includes name in body when provided', async () => {
      const copy = makeDoc({ id: 'copy-2', name: 'My Custom Copy' });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: { template: copy } });

      await templateStore.copyTemplate('tpl-1', 'My Custom Copy');

      expect(apiClient.post).toHaveBeenCalledWith('templates/tpl-1/copy/', {
        name: 'My Custom Copy',
      });
    });
  });

  // ------------------------------------------------------------------
  // updateTemplate
  // ------------------------------------------------------------------
  describe('updateTemplate', () => {
    it('patches and replaces the matching template in state', async () => {
      const original = makeDoc({ id: 'tpl-1', name: 'Old Name', is_public: false });
      const other = makeDoc({ id: 'tpl-2', name: 'Other' });
      templateStore.templates = [original, other];

      const updated = { ...original, name: 'New Name', is_public: true };
      (apiClient.patch as jest.Mock).mockResolvedValueOnce({ data: { template: updated } });

      const result = await templateStore.updateTemplate('tpl-1', {
        name: 'New Name',
        is_public: true,
      });

      expect(apiClient.patch).toHaveBeenCalledWith('templates/tpl-1/', {
        name: 'New Name',
        is_public: true,
      });
      expect(result).toEqual(updated);
      expect(templateStore.templates[0]).toEqual(updated);
      expect(templateStore.templates[1]).toEqual(other);
    });
  });

  // ------------------------------------------------------------------
  // clearError
  // ------------------------------------------------------------------
  describe('clearError', () => {
    it('resets error to empty string', () => {
      templateStore.error = 'Something went wrong';
      templateStore.clearError();
      expect(templateStore.error).toBe('');
    });
  });
});
