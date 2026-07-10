jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

import apiClient from '@/api/client';
import { appModeStore } from '@/stores/appModeStore';

const mockApiClient = apiClient as unknown as { get: jest.Mock };

describe('appModeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appModeStore.mode = 'normal';
    appModeStore.redcapVisible = true;
    appModeStore.loaded = false;
  });

  describe('derived feature flags', () => {
    it('showManualCreate is true unless mode is study', () => {
      appModeStore.mode = 'normal';
      expect(appModeStore.showManualCreate).toBe(true);
      appModeStore.mode = 'dev';
      expect(appModeStore.showManualCreate).toBe(true);
      appModeStore.mode = 'study';
      expect(appModeStore.showManualCreate).toBe(false);
    });

    it('showRedcapImport is true for dev and study modes only', () => {
      appModeStore.mode = 'normal';
      expect(appModeStore.showRedcapImport).toBe(false);
      appModeStore.mode = 'dev';
      expect(appModeStore.showRedcapImport).toBe(true);
      appModeStore.mode = 'study';
      expect(appModeStore.showRedcapImport).toBe(true);
    });

    it('showRedcapTab requires dev/study mode and redcapVisible', () => {
      appModeStore.mode = 'dev';
      appModeStore.redcapVisible = true;
      expect(appModeStore.showRedcapTab).toBe(true);

      appModeStore.redcapVisible = false;
      expect(appModeStore.showRedcapTab).toBe(false);

      appModeStore.mode = 'normal';
      appModeStore.redcapVisible = true;
      expect(appModeStore.showRedcapTab).toBe(false);
    });

    it('hidePiiFields is true only in study mode', () => {
      appModeStore.mode = 'study';
      expect(appModeStore.hidePiiFields).toBe(true);
      appModeStore.mode = 'dev';
      expect(appModeStore.hidePiiFields).toBe(false);
      appModeStore.mode = 'normal';
      expect(appModeStore.hidePiiFields).toBe(false);
    });
  });

  describe('fetchMode', () => {
    it('applies the mode and redcapVisible returned by the api', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { mode: 'study', redcapVisible: false },
      });

      await appModeStore.fetchMode();

      expect(mockApiClient.get).toHaveBeenCalledWith('/app-mode/');
      expect(appModeStore.mode).toBe('study');
      expect(appModeStore.redcapVisible).toBe(false);
      expect(appModeStore.loaded).toBe(true);
    });

    it('defaults redcapVisible to true when not provided', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { mode: 'dev', redcapVisible: undefined },
      });

      await appModeStore.fetchMode();

      expect(appModeStore.redcapVisible).toBe(true);
    });

    it('falls back to normal when the api returns an invalid mode', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { mode: 'bogus', redcapVisible: true },
      });

      await appModeStore.fetchMode();

      expect(appModeStore.mode).toBe('normal');
      expect(appModeStore.loaded).toBe(true);
    });

    it('falls back to normal mode and marks loaded when the request fails', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('network error'));
      appModeStore.mode = 'dev';
      appModeStore.redcapVisible = false;

      await appModeStore.fetchMode();

      expect(appModeStore.mode).toBe('normal');
      expect(appModeStore.redcapVisible).toBe(true);
      expect(appModeStore.loaded).toBe(true);
    });
  });
});
