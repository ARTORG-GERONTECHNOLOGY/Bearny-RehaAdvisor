jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1' },
}));

import mockApiClient from '@/__mocks__/api/client';
import { PatientPopupStore, toDateInput, toDisplayDate } from '@/stores/patientPopupStore';

const t = (k: string) => k;

describe('PatientPopupStore', () => {
  let store: PatientPopupStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new PatientPopupStore('patient-1');
  });

  describe('toDateInput / toDisplayDate helpers', () => {
    it('returns empty string for falsy input', () => {
      expect(toDateInput(null)).toBe('');
      expect(toDisplayDate(null)).toBe('');
    });

    it('returns empty string for an invalid date', () => {
      expect(toDateInput('not-a-date')).toBe('');
    });

    it('returns the raw value for an invalid date in toDisplayDate', () => {
      expect(toDisplayDate('not-a-date')).toBe('not-a-date');
    });

    it('formats a valid date', () => {
      expect(toDateInput('2024-03-15T00:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(toDisplayDate('2024-03-15T00:00:00Z')).not.toBe('');
    });
  });

  describe('UI setters', () => {
    it('setError sets the error message', () => {
      store.setError('boom');
      expect(store.error).toBe('boom');
    });

    it('setShowConfirmDelete toggles the flag', () => {
      store.setShowConfirmDelete(true);
      expect(store.showConfirmDelete).toBe(true);
    });

    it('setEditing(true) leaves buffers untouched', () => {
      store.formData = { foo: 'bar' };
      store.setEditing(true);
      expect(store.isEditing).toBe(true);
      expect(store.formData).toEqual({ foo: 'bar' });
    });

    it('setEditing(false) resets the editing buffer and threshold draft', () => {
      store.manualData = { name: 'Alice' };
      store.formData = { name: 'Changed' };
      store.thresholdDraft = { steps_goal: 5000 };
      store.thresholdReason = 'because';
      store.thresholdEffectiveFromISO = '2024-01-01T00:00:00.000Z';

      store.setEditing(false);

      expect(store.isEditing).toBe(false);
      expect(store.formData).toEqual({ name: 'Alice' });
      expect(store.thresholdDraft).toEqual({});
      expect(store.thresholdReason).toBe('');
      expect(store.thresholdEffectiveFromISO).toBeNull();
    });
  });

  describe('password reset', () => {
    it('setShowPasswordReset(false) clears password fields', () => {
      store.passwordNew = 'a';
      store.passwordConfirm = 'b';
      store.passwordError = 'err';
      store.passwordSuccess = true;

      store.setShowPasswordReset(false);

      expect(store.showPasswordReset).toBe(false);
      expect(store.passwordNew).toBe('');
      expect(store.passwordConfirm).toBe('');
      expect(store.passwordError).toBeNull();
      expect(store.passwordSuccess).toBe(false);
    });

    it('setPasswordNew/setPasswordConfirm clear stale error/success state', () => {
      store.passwordError = 'err';
      store.passwordSuccess = true;
      store.setPasswordNew('newpass');
      expect(store.passwordNew).toBe('newpass');
      expect(store.passwordError).toBeNull();
      expect(store.passwordSuccess).toBe(false);

      store.passwordError = 'err';
      store.passwordSuccess = true;
      store.setPasswordConfirm('newpass');
      expect(store.passwordConfirm).toBe('newpass');
      expect(store.passwordError).toBeNull();
      expect(store.passwordSuccess).toBe(false);
    });

    it('resetPassword fails when new password is empty', async () => {
      const ok = await store.resetPassword(t);
      expect(ok).toBe(false);
      expect(store.passwordError).toBe('NewPasswordRequired');
      expect(mockApiClient.put).not.toHaveBeenCalled();
    });

    it('resetPassword fails when passwords do not match', async () => {
      store.passwordNew = 'abc123';
      store.passwordConfirm = 'xyz789';
      const ok = await store.resetPassword(t);
      expect(ok).toBe(false);
      expect(store.passwordError).toBe('PasswordsDoNotMatch');
    });

    it('resetPassword succeeds and clears fields', async () => {
      (mockApiClient.put as jest.Mock).mockResolvedValueOnce({ data: {} });
      store.passwordNew = 'abc123';
      store.passwordConfirm = 'abc123';

      const ok = await store.resetPassword(t);

      expect(ok).toBe(true);
      expect(mockApiClient.put).toHaveBeenCalledWith('/patients/patient-1/reset-password/', {
        new_password: 'abc123',
      });
      expect(store.passwordSuccess).toBe(true);
      expect(store.passwordNew).toBe('');
      expect(store.passwordConfirm).toBe('');
      expect(store.passwordSaving).toBe(false);
    });

    it('resetPassword surfaces an API error', async () => {
      (mockApiClient.put as jest.Mock).mockRejectedValueOnce(new Error('network down'));
      store.passwordNew = 'abc123';
      store.passwordConfirm = 'abc123';

      const ok = await store.resetPassword(t);

      expect(ok).toBe(false);
      expect(store.passwordError).toBe('network down');
      expect(store.passwordSaving).toBe(false);
    });
  });

  describe('profileDirty', () => {
    it('is false when not editing', () => {
      store.manualData = { name: 'Alice' };
      store.formData = { name: 'Bob' };
      expect(store.profileDirty).toBe(false);
    });

    it('is false when editing but nothing changed', () => {
      store.isEditing = true;
      store.manualData = { name: 'Alice' };
      store.formData = { name: 'Alice' };
      expect(store.profileDirty).toBe(false);
    });

    it('is true when editing and a field changed', () => {
      store.isEditing = true;
      store.manualData = { name: 'Alice' };
      store.formData = { name: 'Bob' };
      expect(store.profileDirty).toBe(true);
    });

    it('ignores volatile and threshold fields', () => {
      store.isEditing = true;
      store.manualData = { name: 'Alice', updatedAt: 't1', thresholds: { a: 1 } };
      store.formData = { name: 'Alice', updatedAt: 't2', thresholds: { a: 2 } };
      expect(store.profileDirty).toBe(false);
    });
  });

  describe('threshold helpers', () => {
    it('setThresholdField stores a numeric value', () => {
      store.setThresholdField('steps_goal', 8000);
      expect(store.thresholdDraft.steps_goal).toBe(8000);
    });

    it('setThresholdField keeps a non-numeric input value as-is', () => {
      store.setThresholdField('steps_goal', NaN);
      expect(Number.isNaN(store.thresholdDraft.steps_goal as number)).toBe(true);
    });

    it('setThresholdReason truncates to 500 chars', () => {
      store.setThresholdReason('a'.repeat(600));
      expect(store.thresholdReason.length).toBe(500);
    });

    it('thresholdEffectiveFromLocal round-trips through the setter', () => {
      expect(store.thresholdEffectiveFromLocal).toBe('');
      store.setThresholdEffectiveFromLocal('2024-05-01T10:30');
      expect(store.thresholdEffectiveFromISO).not.toBeNull();
      expect(store.thresholdEffectiveFromLocal).toBe('2024-05-01T10:30');
    });

    it('setThresholdEffectiveFromLocal clears ISO for an empty value', () => {
      store.setThresholdEffectiveFromLocal('2024-05-01T10:30');
      store.setThresholdEffectiveFromLocal('');
      expect(store.thresholdEffectiveFromISO).toBeNull();
    });

    it('mergedThresholds applies draft values on top of defaults', () => {
      store.setThresholdField('steps_goal', 12000);
      expect(store.mergedThresholds.steps_goal).toBe(12000);
      expect(store.mergedThresholds.active_minutes_green).toBe(30);
    });

    it('thresholdsDirty is false with no thresholds loaded and no draft', () => {
      expect(store.thresholdsDirty).toBe(false);
    });

    it('thresholdsDirty is true with no thresholds loaded but a draft present', () => {
      store.setThresholdField('steps_goal', 5000);
      expect(store.thresholdsDirty).toBe(true);
    });

    it('thresholdsDirty compares merged draft against loaded thresholds', () => {
      store.thresholds = {
        steps_goal: 10000,
        active_minutes_green: 30,
        active_minutes_yellow: 20,
        sleep_green_min: 420,
        sleep_yellow_min: 360,
        bp_sys_green_max: 129,
        bp_sys_yellow_max: 139,
        bp_dia_green_max: 84,
        bp_dia_yellow_max: 89,
      };
      expect(store.thresholdsDirty).toBe(false);
      store.setThresholdField('steps_goal', 9000);
      expect(store.thresholdsDirty).toBe(true);
    });
  });

  describe('field source helpers', () => {
    beforeEach(() => {
      store.manualData = { name: 'Alice', tags: [], empty: '   ' };
      store.redcapFlat = { name: 'RC-Alice', phone: '123' };
    });

    it('hasManualInfoForKey', () => {
      expect(store.hasManualInfoForKey('name')).toBe(true);
      expect(store.hasManualInfoForKey('tags')).toBe(false);
      expect(store.hasManualInfoForKey('empty')).toBe(false);
      expect(store.hasManualInfoForKey('missing')).toBe(false);
    });

    it('getValueSource returns manual/redcap/empty appropriately', () => {
      expect(store.getValueSource('name')).toBe('manual');
      expect(store.getValueSource('phone')).toBe('redcap');
      expect(store.getValueSource('nowhere')).toBe('empty');
    });

    it('hasManualInfo is true when any manual field is populated', () => {
      expect(store.hasManualInfo).toBe(true);
      store.manualData = { tags: [], empty: '' };
      expect(store.hasManualInfo).toBe(false);
    });

    it('getDisplayValue prefers manual over redcap', () => {
      expect(store.getDisplayValue('name')).toBe('Alice');
      expect(store.getDisplayValue('phone')).toBe('123');
      expect(store.getDisplayValue('nowhere')).toBeUndefined();
    });
  });

  describe('form editing helpers', () => {
    it('setField updates formData', () => {
      store.setField('name', 'Bob');
      expect(store.formData.name).toBe('Bob');
    });

    it('setMultiSelect stores values from selected options', () => {
      store.setMultiSelect('tags', [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ]);
      expect(store.formData.tags).toEqual(['a', 'b']);
    });

    it('setMultiSelect handles null selection', () => {
      store.setMultiSelect('tags', null);
      expect(store.formData.tags).toEqual([]);
    });

    it('setCommaSeparated keeps raw text', () => {
      store.setCommaSeparated('lifestyle', 'active, healthy');
      expect(store.formData.lifestyle).toBe('active, healthy');
    });

    it('arrayToDisplay joins array values and passes through strings', () => {
      expect(store.arrayToDisplay(['a', 'b', ''])).toBe('a, b');
      expect(store.arrayToDisplay('already a string')).toBe('already a string');
      expect(store.arrayToDisplay(null)).toBe('');
    });
  });

  describe('fetchPatientData', () => {
    it('loads patient data and derives REDCap identifiers', async () => {
      (mockApiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/users/patient-1/profile') {
          return Promise.resolve({
            data: { name: 'Alice', redcap_project: 'P1', patient_code: 'PC-1' },
          });
        }
        if (url === '/redcap/patient/') return Promise.resolve({ data: { matches: [] } });
        if (url === '/patients/patient-1/thresholds/') return Promise.resolve({ data: {} });
        return Promise.resolve({ data: {} });
      });

      await store.fetchPatientData(t);

      expect(store.rawPatient).toEqual({
        name: 'Alice',
        redcap_project: 'P1',
        patient_code: 'PC-1',
      });
      expect(store.redcapProject).toBe('P1');
      expect(store.redcapIdentifier).toBe('PC-1');
      expect(store.loading).toBe(false);
    });

    it('surfaces a load error', async () => {
      (mockApiClient.get as jest.Mock).mockRejectedValueOnce(new Error('down'));
      await store.fetchPatientData(t);
      expect(store.error).toBe('down');
      expect(store.loading).toBe(false);
    });

    it('leaves all REDCap identifiers null for a fully empty profile response', async () => {
      (mockApiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/users/patient-1/profile') return Promise.resolve({ data: {} });
        if (url === '/redcap/patient/') return Promise.resolve({ data: { matches: [] } });
        if (url === '/patients/patient-1/thresholds/') return Promise.resolve({ data: {} });
        return Promise.resolve({ data: {} });
      });

      await store.fetchPatientData(t);

      expect(store.redcapProject).toBeNull();
      expect(store.redcapIdentifier).toBeNull();
      expect(store.redcapRecordId).toBeNull();
      expect(store.redcapPatId).toBeNull();
      expect(store.redcapDag).toBeNull();
    });

    it('derives REDCap identifiers from the camelCase field variants', async () => {
      (mockApiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/users/patient-1/profile') {
          return Promise.resolve({
            data: {
              redcapProject: 'P2',
              redcapIdentifier: 'ID2',
              redcapRecordId: 'R2',
              redcapPatId: 'PID2',
              redcapDag: 'DAG2',
            },
          });
        }
        if (url === '/redcap/patient/') return Promise.resolve({ data: { matches: [] } });
        if (url === '/patients/patient-1/thresholds/') return Promise.resolve({ data: {} });
        return Promise.resolve({ data: {} });
      });

      await store.fetchPatientData(t);

      expect(store.redcapProject).toBe('P2');
      expect(store.redcapIdentifier).toBe('ID2');
      expect(store.redcapRecordId).toBe('R2');
      expect(store.redcapPatId).toBe('PID2');
      expect(store.redcapDag).toBe('DAG2');
    });

    it('falls back to the camelCase patientCode when patient_code is absent', async () => {
      (mockApiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/users/patient-1/profile') {
          return Promise.resolve({ data: { patientCode: 'PC-CAMEL' } });
        }
        if (url === '/redcap/patient/') return Promise.resolve({ data: { matches: [] } });
        if (url === '/patients/patient-1/thresholds/') return Promise.resolve({ data: {} });
        return Promise.resolve({ data: {} });
      });

      await store.fetchPatientData(t);

      expect(store.redcapIdentifier).toBe('PC-CAMEL');
    });
  });

  describe('fetchRedcapIfPossible', () => {
    it('clears redcap data when there is no identifier', async () => {
      store.redcapIdentifier = null;
      await store.fetchRedcapIfPossible(t);
      expect(store.redcapRows).toEqual([]);
      expect(store.redcapFlat).toEqual({});
    });

    it('populates redcap rows on success', async () => {
      store.redcapIdentifier = 'PC-1';
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          matches: [
            {
              project: 'P1',
              rows: [{ record_id: 'R1', pat_id: 'PID1', phone: '555' }],
            },
          ],
        },
      });

      await store.fetchRedcapIfPossible(t);

      expect(store.redcapRows).toHaveLength(1);
      expect(store.redcapFlat.phone).toBe('555');
      expect(store.redcapRecordId).toBe('R1');
      expect(store.redcapPatId).toBe('PID1');
      expect(store.redcapLoading).toBe(false);
    });

    it('surfaces a coded error message', async () => {
      store.redcapIdentifier = 'PC-1';
      (mockApiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { code: 'redcap_down' } },
      });

      await store.fetchRedcapIfPossible(t);

      expect(store.redcapError).toBe('redcap_down');
      expect(store.redcapRows).toEqual([]);
    });

    it('falls back to a generic error message without a code', async () => {
      store.redcapIdentifier = 'PC-1';
      (mockApiClient.get as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      await store.fetchRedcapIfPossible(t);
      expect(store.redcapError).toBe('boom');
    });

    it('keeps the previously known record/pat ids when a match has no rows', async () => {
      store.redcapIdentifier = 'PC-1';
      store.redcapRecordId = 'OLD-R';
      store.redcapPatId = 'OLD-P';
      store.redcapProject = 'OLD-PROJECT';
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { matches: [{ project: null, rows: [] }] },
      });

      await store.fetchRedcapIfPossible(t);

      expect(store.redcapRows).toEqual([]);
      expect(store.redcapFlat).toEqual({});
      expect(store.redcapRecordId).toBe('OLD-R');
      expect(store.redcapPatId).toBe('OLD-P');
      expect(store.redcapProject).toBe('OLD-PROJECT');
    });

    it('sends the project filter param when a redcapProject is already known', async () => {
      store.redcapIdentifier = 'PC-1';
      store.redcapProject = 'P9';
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({ data: { matches: [] } });

      await store.fetchRedcapIfPossible(t);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/redcap/patient/',
        expect.objectContaining({ params: expect.objectContaining({ project: 'P9' }) })
      );
    });
  });

  describe('fetchThresholds', () => {
    it('normalizes and stores thresholds on success', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          thresholds: { steps_goal: 7000 },
          history: [{ effective_from: null, thresholds: {} }],
        },
      });

      await store.fetchThresholds(t);

      expect(store.thresholds?.steps_goal).toBe(7000);
      expect(store.thresholdsHistory).toHaveLength(1);
      expect(store.thresholdsLoading).toBe(false);
    });

    it('falls back to defaults and surfaces an error on failure', async () => {
      (mockApiClient.get as jest.Mock).mockRejectedValueOnce(new Error('down'));
      await store.fetchThresholds(t);
      expect(store.thresholds?.steps_goal).toBe(10000);
      expect(store.thresholdsError).toBe('down');
    });
  });

  describe('saveThresholds', () => {
    it('is a no-op when thresholds are not dirty', async () => {
      const ok = await store.saveThresholds(t);
      expect(ok).toBe(true);
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('saves the merged thresholds and refetches', async () => {
      store.setThresholdField('steps_goal', 12000);
      store.setThresholdReason('doctor advice');
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { thresholds: { steps_goal: 12000 } },
      });

      const ok = await store.saveThresholds(t);

      expect(ok).toBe(true);
      const [url, payload] = (mockApiClient.post as jest.Mock).mock.calls[0];
      expect(url).toBe('/patients/patient-1/thresholds/');
      expect(payload.thresholds.steps_goal).toBe(12000);
      expect(payload.reason).toBe('doctor advice');
    });

    it('surfaces an error on failure', async () => {
      store.setThresholdField('steps_goal', 12000);
      (mockApiClient.post as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const ok = await store.saveThresholds(t);

      expect(ok).toBe(false);
      expect(store.thresholdsError).toBe('boom');
    });
  });

  describe('save', () => {
    it('is a no-op when profile is not dirty', async () => {
      const ok = await store.save(t);
      expect(ok).toBe(true);
      expect(mockApiClient.put).not.toHaveBeenCalled();
    });

    it('normalizes comma-separated fields and refetches on success', async () => {
      store.isEditing = true;
      store.manualData = { lifestyle: '' };
      store.formData = { lifestyle: 'active, healthy ,  ' };
      (mockApiClient.put as jest.Mock).mockResolvedValueOnce({ data: {} });
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { lifestyle: ['active', 'healthy'] },
      });

      const ok = await store.save(t);

      expect(ok).toBe(true);
      const [url, payload] = (mockApiClient.put as jest.Mock).mock.calls[0];
      expect(url).toBe('/users/patient-1/profile/');
      expect(payload.lifestyle).toEqual(['active', 'healthy']);
      expect(store.manualData.lifestyle).toEqual(['active', 'healthy']);
      expect(store.isEditing).toBe(false);
    });

    it('surfaces an error on failure', async () => {
      store.isEditing = true;
      store.manualData = { name: 'Alice' };
      store.formData = { name: 'Bob' };
      (mockApiClient.put as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const ok = await store.save(t);

      expect(ok).toBe(false);
      expect(store.error).toBe('boom');
    });
  });

  describe('saveAll', () => {
    it('exits editing with no network calls when nothing changed', async () => {
      store.isEditing = true;
      const ok = await store.saveAll(t);
      expect(ok).toBe(true);
      expect(store.isEditing).toBe(false);
      expect(mockApiClient.put).not.toHaveBeenCalled();
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('saves only the profile when only profile is dirty', async () => {
      store.isEditing = true;
      store.manualData = { name: 'Alice' };
      store.formData = { name: 'Bob' };
      (mockApiClient.put as jest.Mock).mockResolvedValueOnce({ data: {} });
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({ data: { name: 'Bob' } });

      const ok = await store.saveAll(t);

      expect(ok).toBe(true);
      expect(mockApiClient.put).toHaveBeenCalled();
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('short-circuits when the profile save fails', async () => {
      store.isEditing = true;
      store.manualData = { name: 'Alice' };
      store.formData = { name: 'Bob' };
      (mockApiClient.put as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const ok = await store.saveAll(t);

      expect(ok).toBe(false);
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('saves only thresholds when only thresholds are dirty', async () => {
      store.isEditing = true;
      store.setThresholdField('steps_goal', 12000);
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { thresholds: { steps_goal: 12000 } },
      });

      const ok = await store.saveAll(t);

      expect(ok).toBe(true);
      expect(mockApiClient.put).not.toHaveBeenCalled();
      expect(mockApiClient.post).toHaveBeenCalled();
      expect(store.isEditing).toBe(false);
    });
  });

  describe('deletePatient', () => {
    it('succeeds', async () => {
      (mockApiClient.delete as jest.Mock).mockResolvedValueOnce({ data: {} });
      const ok = await store.deletePatient(t);
      expect(ok).toBe(true);
      expect(mockApiClient.delete).toHaveBeenCalledWith('/users/patient-1/profile/');
      expect(store.saving).toBe(false);
    });

    it('surfaces an error on failure', async () => {
      (mockApiClient.delete as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const ok = await store.deletePatient(t);
      expect(ok).toBe(false);
      expect(store.error).toBe('boom');
    });
  });

  describe('syncWearablesToRedcap', () => {
    it('sends optional event params and stores results', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: true,
          patient_code: 'P-1',
          first_measurement_date: '2024-01-01',
          periods: {
            baseline: { status: 'sent' },
            followup: { status: 'skipped', skip_reason: 'future_window' },
          },
        },
      });

      await store.syncWearablesToRedcap(t, 'baseline_arm_1', 'followup_arm_1', true);

      const [url, body] = (mockApiClient.post as jest.Mock).mock.calls[0];
      expect(url).toBe('/wearables/sync-to-redcap/patient-1/');
      expect(body).toEqual({
        event_baseline: 'baseline_arm_1',
        event_followup: 'followup_arm_1',
        force: true,
      });
      expect(store.wearablesSyncPeriods).toEqual({
        baseline: { status: 'sent' },
        followup: { status: 'skipped', skip_reason: 'future_window' },
      });
      expect(store.wearablesSyncFirstDate).toBe('2024-01-01');
      expect(store.wearablesSyncing).toBe(false);
    });

    it('surfaces a coded error', async () => {
      (mockApiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { code: 'sync_failed' } },
      });

      await store.syncWearablesToRedcap(t);

      expect(store.wearablesSyncError).toBe('sync_failed');
    });
  });

  describe('copyRedcapIntoManual', () => {
    it('fills only empty manual fields from redcap', () => {
      store.formData = { name: 'Alice', phone: '' };
      store.redcapFlat = { name: 'RC-Alice', phone: '555', email: 'a@b.com' };

      store.copyRedcapIntoManual();

      expect(store.formData.name).toBe('Alice');
      expect(store.formData.phone).toBe('555');
      expect(store.formData.email).toBe('a@b.com');
    });
  });
});
