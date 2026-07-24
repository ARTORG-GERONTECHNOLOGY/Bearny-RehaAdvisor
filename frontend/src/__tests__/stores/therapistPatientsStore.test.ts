import { TherapistPatientsStore, RedcapCandidate } from '@/stores/therapistPatientsStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1' },
}));

const t = (key: string) => key;

const makePatient = (overrides: Record<string, any> = {}) => ({
  _id: 'p1',
  first_name: 'Jane',
  name: 'Doe',
  sex: 'Female',
  diagnosis: 'Stroke',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('TherapistPatientsStore', () => {
  let store: TherapistPatientsStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new TherapistPatientsStore();
  });

  // ------------------------------------------------------------------
  // simple setters
  // ------------------------------------------------------------------
  describe('filter/sort setters', () => {
    it('sets each filter field independently', () => {
      store.setSearchTerm('jane');
      store.setSexFilter('Female');
      store.setDurationFilter('30-60 days');
      store.setBirthdateFilter('2026-01-01');
      store.setDiseaseFilter('Stroke');
      store.setShowCompleted(true);
      store.setSortBy('adherence');

      expect(store.searchTerm).toBe('jane');
      expect(store.sexFilter).toBe('Female');
      expect(store.durationFilter).toBe('30-60 days');
      expect(store.birthdateFilter).toBe('2026-01-01');
      expect(store.diseaseFilter).toBe('Stroke');
      expect(store.showCompleted).toBe(true);
      expect(store.sortBy).toBe('adherence');
    });

    it('resetFilters clears everything back to defaults', () => {
      store.setSearchTerm('jane');
      store.setSexFilter('Female');
      store.setDurationFilter('30-60 days');
      store.setBirthdateFilter('2026-01-01');
      store.setDiseaseFilter('Stroke');
      store.setShowCompleted(true);
      store.setSortBy('adherence');

      store.resetFilters();

      expect(store.searchTerm).toBe('');
      expect(store.sexFilter).toBe('');
      expect(store.durationFilter).toBe('');
      expect(store.birthdateFilter).toBe('');
      expect(store.diseaseFilter).toBe('');
      expect(store.showCompleted).toBe(false);
      expect(store.sortBy).toBe('ampel');
    });
  });

  // ------------------------------------------------------------------
  // popups
  // ------------------------------------------------------------------
  describe('add-patient popup', () => {
    it('opens and closes', () => {
      store.openAddPatient();
      expect(store.showAddPatientPopup).toBe(true);
      store.closeAddPatient();
      expect(store.showAddPatientPopup).toBe(false);
    });
  });

  describe('error details toggle', () => {
    it('flips showErrorDetails', () => {
      expect(store.showErrorDetails).toBe(false);
      store.toggleErrorDetails();
      expect(store.showErrorDetails).toBe(true);
      store.toggleErrorDetails();
      expect(store.showErrorDetails).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // REDCap modal controls
  // ------------------------------------------------------------------
  describe('REDCap modal controls', () => {
    it('opens the modal', () => {
      store.openImportRedcap();
      expect(store.showImportRedcapModal).toBe(true);
    });

    it('closes the modal and resets its state', () => {
      store.showImportRedcapModal = true;
      store.redcapError = 'oops';
      store.redcapRowPasswords = { a: 'pw' };
      store.importedKeys = { a: true };

      store.closeImportRedcap();

      expect(store.showImportRedcapModal).toBe(false);
      expect(store.redcapError).toBe('');
      expect(store.redcapRowPasswords).toEqual({});
      expect(store.importedKeys).toEqual({});
    });

    it('refuses to close while an import is in progress', () => {
      store.showImportRedcapModal = true;
      store.importingKey = 'proj::p1';

      store.closeImportRedcap();

      expect(store.showImportRedcapModal).toBe(true);
    });

    it('sets a per-row password', () => {
      store.setRedcapRowPassword('proj::p1', 'Secret1!');
      expect(store.redcapRowPasswords).toEqual({ 'proj::p1': 'Secret1!' });

      store.setRedcapRowPassword('proj::p2', 'Other1!');
      expect(store.redcapRowPasswords).toEqual({
        'proj::p1': 'Secret1!',
        'proj::p2': 'Other1!',
      });
    });
  });

  // ------------------------------------------------------------------
  // fetchRedcapCandidates
  // ------------------------------------------------------------------
  describe('fetchRedcapCandidates', () => {
    const candidate = (overrides: Partial<RedcapCandidate> = {}): RedcapCandidate => ({
      project: 'ProjA',
      identifier: 'P01',
      ...overrides,
    });

    it('loads candidates and requests them scoped to the current therapist', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { candidates: [candidate()] },
      });

      await store.fetchRedcapCandidates(t);

      expect(apiClient.get).toHaveBeenCalledWith('/redcap/available-patients/', {
        params: { therapistUserId: 'therapist-1' },
      });
      expect(store.redcapCandidates).toEqual([candidate()]);
      expect(store.redcapLoading).toBe(false);
    });

    it('surfaces per-project errors returned in a 200 response', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { candidates: [], errors: [{ project: 'ProjA', error: 'timeout' }] },
      });

      await store.fetchRedcapCandidates(t);

      expect(store.redcapError).toBe('ProjA: timeout');
    });

    it('keeps existing row passwords only for candidates still present', async () => {
      store.redcapRowPasswords = { 'ProjA::P01': 'keep', 'ProjA::gone': 'drop' };
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { candidates: [candidate()] },
      });

      await store.fetchRedcapCandidates(t);

      expect(store.redcapRowPasswords).toEqual({ 'ProjA::P01': 'keep' });
    });

    it('keeps importedKeys only for candidates still present', async () => {
      store.importedKeys = { 'ProjA::P01': true, 'ProjA::gone': true };
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { candidates: [candidate()] },
      });

      await store.fetchRedcapCandidates(t);

      expect(store.importedKeys).toEqual({ 'ProjA::P01': true });
    });

    it('defaults to an empty candidates array when the response shape is unexpected', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });
      await store.fetchRedcapCandidates(t);
      expect(store.redcapCandidates).toEqual([]);
    });

    it('sets an error message on failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Server down' } },
      });

      await store.fetchRedcapCandidates(t);

      expect(store.redcapError).toBe('Server down');
      expect(store.redcapLoading).toBe(false);
    });

    it('falls back to the translated default message when nothing else is available', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({});
      await store.fetchRedcapCandidates(t);
      expect(store.redcapError).toBe('Failed to fetch REDCap patients.');
    });
  });

  // ------------------------------------------------------------------
  // importOneFromRedcap
  // ------------------------------------------------------------------
  describe('importOneFromRedcap', () => {
    const candidate: RedcapCandidate = { project: 'ProjA', identifier: 'P01' };

    it('requires a non-empty password', async () => {
      await store.importOneFromRedcap(candidate, t);
      expect(store.redcapError).toBe('Please provide a password for this patient.');
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only password', async () => {
      store.redcapRowPasswords = { 'ProjA::P01': '   ' };
      await store.importOneFromRedcap(candidate, t);
      expect(store.redcapError).toBe('Please provide a password for this patient.');
    });

    it('is a no-op when the row is already imported', async () => {
      store.redcapRowPasswords = { 'ProjA::P01': 'Secret1!' };
      store.importedKeys = { 'ProjA::P01': true };
      await store.importOneFromRedcap(candidate, t);
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('is a no-op while another row is importing', async () => {
      store.redcapRowPasswords = { 'ProjA::P01': 'Secret1!' };
      store.importingKey = 'ProjA::other';
      await store.importOneFromRedcap(candidate, t);
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('imports, marks the row imported, and refreshes patients + candidates', async () => {
      store.redcapRowPasswords = { 'ProjA::P01': 'Secret1!' };
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});
      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({ data: [] }) // fetchPatients
        .mockResolvedValueOnce({ data: { candidates: [candidate] } }); // fetchRedcapCandidates (still listed)

      await store.importOneFromRedcap(candidate, t);

      expect(apiClient.post).toHaveBeenCalledWith('/redcap/import-patient/', {
        project: 'ProjA',
        therapistUserId: 'therapist-1',
        patient_code: 'P01',
        password: 'Secret1!',
      });
      // importedKeys survives the post-import fetchRedcapCandidates refresh only
      // because the candidate is still present in that response.
      expect(store.importedKeys).toEqual({ 'ProjA::P01': true });
      expect(store.importingKey).toBeNull();
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('drops importedKeys for a row that no longer appears in the refreshed candidate list', async () => {
      store.redcapRowPasswords = { 'ProjA::P01': 'Secret1!' };
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});
      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({ data: [] }) // fetchPatients
        .mockResolvedValueOnce({ data: { candidates: [] } }); // fetchRedcapCandidates: gone now

      await store.importOneFromRedcap(candidate, t);

      expect(store.importedKeys).toEqual({});
    });

    it('sets an error message when the import request fails', async () => {
      store.redcapRowPasswords = { 'ProjA::P01': 'Secret1!' };
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Duplicate patient' } },
      });

      await store.importOneFromRedcap(candidate, t);

      expect(store.redcapError).toBe('Duplicate patient');
      expect(store.importingKey).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // fetchPatients
  // ------------------------------------------------------------------
  describe('fetchPatients', () => {
    it('loads and stores patients sorted by created_at desc', async () => {
      const older = makePatient({ _id: 'p-old', created_at: '2025-01-01T00:00:00Z' });
      const newer = makePatient({ _id: 'p-new', created_at: '2026-01-01T00:00:00Z' });
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [older, newer] });

      await store.fetchPatients(t);

      expect(apiClient.get).toHaveBeenCalledWith('therapists/therapist-1/patients');
      expect(store.patients.map((p) => p._id)).toEqual(['p-new', 'p-old']);
      expect(store.loading).toBe(false);
      expect(store.error).toBe('');
    });

    it('accepts a { data: [...] } envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { data: [makePatient()] } });
      await store.fetchPatients(t);
      expect(store.patients).toHaveLength(1);
    });

    it('defaults to an empty list for an unrecognized payload shape', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { foo: 'bar' } });
      await store.fetchPatients(t);
      expect(store.patients).toEqual([]);
    });

    it('surfaces a success:false envelope as an error', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { success: false, error: 'Clinic not found' },
      });

      await store.fetchPatients(t);

      expect(store.error).toBe('Clinic not found');
      expect(store.patients).toEqual([]);
    });

    it('uses the translated fallback message for a success:false envelope with no message', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { success: false } });
      await store.fetchPatients(t);
      expect(store.error).toBe('Failed to fetch patients. Please try again later.');
    });

    it('sets error and errorDetails on request failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Timeout', details: 'upstream 504' } },
      });

      await store.fetchPatients(t);

      expect(store.error).toBe('Timeout');
      expect(store.errorDetails).toBe('upstream 504');
      expect(store.patients).toEqual([]);
      expect(store.loading).toBe(false);
    });

    it('stringifies non-string details and falls back to field_errors text', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Bad request', details: { code: 42 } } },
      });
      await store.fetchPatients(t);
      expect(store.errorDetails).toBe('{"code":42}');
    });

    it('joins field_errors into readable text when no explicit details are given', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: {
          data: { error: 'Validation failed', field_errors: { name: ['is required'] } },
        },
      });
      await store.fetchPatients(t);
      expect(store.errorDetails).toBe('name: is required');
    });

    it('surfaces a success:false envelope with non-string details, stringified', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { success: false, error: 'Bad envelope', details: { reason: 'x' } },
      });
      await store.fetchPatients(t);
      expect(store.errorDetails).toBe('{"reason":"x"}');
    });

    it('surfaces a success:false envelope field_errors as details text', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Bad envelope',
          field_errors: { patient_code: ['already used'] },
        },
      });
      await store.fetchPatients(t);
      expect(store.errorDetails).toBe('patient_code: already used');
    });

    it('surfaces a success:false envelope non_field_errors as the message', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { success: false, non_field_errors: ['Clinic suspended'] },
      });
      await store.fetchPatients(t);
      expect(store.error).toBe('Clinic suspended');
    });

    it('resets error state at the start of each call', async () => {
      store.error = 'stale error';
      store.errorDetails = 'stale details';
      store.showErrorDetails = true;
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });

      await store.fetchPatients(t);

      expect(store.error).toBe('');
      expect(store.errorDetails).toBeNull();
      expect(store.showErrorDetails).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // diseaseOptions
  // ------------------------------------------------------------------
  describe('diseaseOptions', () => {
    it('collects unique, sorted diagnoses across patients, flattening arrays', () => {
      store.patients = [
        makePatient({ diagnosis: 'Stroke' }),
        makePatient({ diagnosis: ['COPD', 'Stroke'] }),
        makePatient({ diagnosis: 'Diabetes' }),
      ] as any;

      expect(store.diseaseOptions).toEqual(['COPD', 'Diabetes', 'Stroke']);
    });

    it('is empty when no patients have a diagnosis', () => {
      store.patients = [makePatient({ diagnosis: undefined })] as any;
      expect(store.diseaseOptions).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // filteredPatients
  // ------------------------------------------------------------------
  describe('filteredPatients', () => {
    beforeEach(() => {
      store.patients = [
        makePatient({
          _id: 'p1',
          first_name: 'Jane',
          name: 'Doe',
          sex: 'Female',
          diagnosis: 'Stroke',
          duration: 20,
        }),
        makePatient({
          _id: 'p2',
          first_name: 'John',
          name: 'Smith',
          sex: 'Male',
          diagnosis: ['COPD'],
          duration: 45,
        }),
        makePatient({
          _id: 'p3',
          first_name: 'Amy',
          name: 'Lee',
          sex: 'Female',
          diagnosis: 'Diabetes',
          duration: 120,
        }),
      ] as any;
    });

    it('filters by sex', () => {
      store.setSexFilter('Female');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p1', 'p3']);
    });

    it('filters by duration bucket "< 30 days"', () => {
      store.setDurationFilter('< 30 days');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p1']);
    });

    it('filters by duration bucket "30-60 days"', () => {
      store.setDurationFilter('30-60 days');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p2']);
    });

    it('filters by duration bucket "60-90 days" (none match here)', () => {
      store.setDurationFilter('60-90 days');
      expect(store.filteredPatients).toEqual([]);
    });

    it('filters by the ">90 days" fallback bucket', () => {
      store.setDurationFilter('> 90 days');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p3']);
    });

    it('excludes patients with a non-numeric duration', () => {
      store.patients = [...store.patients, makePatient({ _id: 'p4', duration: 'n/a' })] as any;
      store.setDurationFilter('< 30 days');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p1']);
    });

    it('filters by disease, matching within array diagnoses too', () => {
      store.setDiseaseFilter('COPD');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p2']);
    });

    it('excludes patients without a diagnosis when a disease filter is set', () => {
      store.patients = [...store.patients, makePatient({ _id: 'p5', diagnosis: undefined })] as any;
      store.setDiseaseFilter('Stroke');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p1']);
    });

    it('searches by first name, last name, and combined name', () => {
      store.setSearchTerm('john smith');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p2']);
    });

    it('searches by username, patient_code, or _id', () => {
      store.patients = [
        makePatient({ _id: 'p9', first_name: 'Z', name: 'Z', username: 'zzuser' }),
      ] as any;
      store.setSearchTerm('zzuser');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p9']);
    });

    it('ignores an empty/whitespace search term', () => {
      store.setSearchTerm('   ');
      expect(store.filteredPatients).toHaveLength(3);
    });

    it('filters by birthdate (matching the first 10 chars of age)', () => {
      store.patients = [makePatient({ _id: 'p6', age: '2000-05-05T00:00:00Z' })] as any;
      store.setBirthdateFilter('2000-05-05');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p6']);
    });

    it('combines multiple filters (AND semantics)', () => {
      store.setSexFilter('Female');
      store.setDiseaseFilter('Diabetes');
      expect(store.filteredPatients.map((p) => p._id)).toEqual(['p3']);
    });
  });

  // ------------------------------------------------------------------
  // sortByCreatedDesc
  // ------------------------------------------------------------------
  describe('sortByCreatedDesc', () => {
    it('sorts newest first', () => {
      const a = makePatient({ _id: 'a', created_at: '2025-01-01T00:00:00Z' });
      const b = makePatient({ _id: 'b', created_at: '2026-01-01T00:00:00Z' });
      expect(store.sortByCreatedDesc([a, b] as any).map((p: any) => p._id)).toEqual(['b', 'a']);
    });

    it('treats a missing created_at as epoch 0', () => {
      const a = makePatient({ _id: 'a', created_at: undefined });
      const b = makePatient({ _id: 'b', created_at: '2026-01-01T00:00:00Z' });
      expect(store.sortByCreatedDesc([a, b] as any).map((p: any) => p._id)).toEqual(['b', 'a']);
    });
  });

  // ------------------------------------------------------------------
  // isCompletedPatient / splitCompleted
  // ------------------------------------------------------------------
  describe('isCompletedPatient', () => {
    it('is true when study_end_date is in the past', () => {
      expect(store.isCompletedPatient(makePatient({ study_end_date: '2020-01-01' }) as any)).toBe(
        true
      );
    });

    it('is false when study_end_date is in the future', () => {
      expect(store.isCompletedPatient(makePatient({ study_end_date: '2099-01-01' }) as any)).toBe(
        false
      );
    });

    it('is false when study_end_date is not set', () => {
      expect(store.isCompletedPatient(makePatient() as any)).toBe(false);
    });

    it('is false when only rehab_end_date is set (no study_end_date)', () => {
      expect(store.isCompletedPatient(makePatient({ rehab_end_date: '2020-01-01' }) as any)).toBe(
        false
      );
    });
  });

  describe('splitCompleted', () => {
    it('splits active vs completed and sorts completed by study_end_date desc', () => {
      const active = makePatient({ _id: 'active-1' });
      const doneOld = makePatient({ _id: 'done-old', study_end_date: '2025-01-01T00:00:00Z' });
      const doneNew = makePatient({ _id: 'done-new', study_end_date: '2026-01-01T00:00:00Z' });

      const { active: activeList, completed } = store.splitCompleted([
        active,
        doneOld,
        doneNew,
      ] as any);

      expect(activeList.map((p: any) => p._id)).toEqual(['active-1']);
      expect(completed.map((p: any) => p._id)).toEqual(['done-new', 'done-old']);
    });

    it('keeps patient active when study_end_date is in the future', () => {
      const stillActive = makePatient({
        _id: 'still-active',
        study_end_date: '2099-01-01T00:00:00Z',
      });
      const done = makePatient({ _id: 'done', study_end_date: '2025-01-01T00:00:00Z' });

      const { active: activeList, completed } = store.splitCompleted([stillActive, done] as any);

      expect(activeList.map((p: any) => p._id)).toEqual(['still-active']);
      expect(completed.map((p: any) => p._id)).toEqual(['done']);
    });
  });

  // ------------------------------------------------------------------
  // toggleFlag
  // ------------------------------------------------------------------
  describe('toggleFlag', () => {
    it('is a no-op when the patient has no _id', async () => {
      await store.toggleFlag(makePatient({ _id: '' }) as any, t);
      expect(apiClient.patch).not.toHaveBeenCalled();
    });

    it('is a no-op while another flag toggle is in flight', async () => {
      store.flagTogglingId = 'some-other-patient';
      await store.toggleFlag(makePatient({ _id: 'p1' }) as any, t);
      expect(apiClient.patch).not.toHaveBeenCalled();
    });

    it('flags an unflagged patient and updates it in place from the response', async () => {
      store.patients = [makePatient({ _id: 'p1', flagged: false })] as any;
      (apiClient.patch as jest.Mock).mockResolvedValueOnce({
        data: { flagged: true, flagged_at: '2026-01-01T00:00:00Z', flagged_by: 'Dr. House' },
      });

      await store.toggleFlag(store.patients[0], t);

      expect(apiClient.patch).toHaveBeenCalledWith('/patients/p1/flag/', { flagged: true });
      expect(store.patients[0].flagged).toBe(true);
      expect(store.patients[0].flagged_at).toBe('2026-01-01T00:00:00Z');
      expect(store.patients[0].flagged_by).toBe('Dr. House');
      expect(store.flagTogglingId).toBeNull();
    });

    it('unflags an already-flagged patient', async () => {
      store.patients = [makePatient({ _id: 'p1', flagged: true })] as any;
      (apiClient.patch as jest.Mock).mockResolvedValueOnce({
        data: { flagged: false, flagged_at: null, flagged_by: '' },
      });

      await store.toggleFlag(store.patients[0], t);

      expect(apiClient.patch).toHaveBeenCalledWith('/patients/p1/flag/', { flagged: false });
      expect(store.patients[0].flagged).toBe(false);
    });

    it('falls back to the optimistic value and defaults when the response omits fields', async () => {
      store.patients = [makePatient({ _id: 'p1', flagged: false })] as any;
      (apiClient.patch as jest.Mock).mockResolvedValueOnce({ data: {} });

      await store.toggleFlag(store.patients[0], t);

      expect(store.patients[0].flagged).toBe(true);
      expect(store.patients[0].flagged_at).toBeNull();
      expect(store.patients[0].flagged_by).toBe('');
    });

    it('sets an error and clears flagTogglingId on failure', async () => {
      store.patients = [makePatient({ _id: 'p1', flagged: false })] as any;
      (apiClient.patch as jest.Mock).mockRejectedValueOnce({
        response: { data: { message: 'Not authorised' } },
      });

      await store.toggleFlag(store.patients[0], t);

      expect(store.error).toBe('Not authorised');
      expect(store.flagTogglingId).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Flag + comments modal controls
  // ------------------------------------------------------------------
  describe('openFlagComments / closeFlagComments / setNewCommentText', () => {
    it('opens the modal for the given patient and triggers a comments fetch', () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { comments: [] } });
      const patient = makePatient({ _id: 'p1', first_name: 'Jane', name: 'Doe' });

      store.openFlagComments(patient as any, t);

      expect(store.showFlagCommentsModal).toBe(true);
      expect(store.flagCommentsPatientId).toBe('p1');
      expect(store.flagCommentsPatientName).toBe('Jane Doe');
      expect(apiClient.get).toHaveBeenCalledWith('/patients/p1/comments/');
    });

    it('closeFlagComments resets all modal state back to defaults', () => {
      store.showFlagCommentsModal = true;
      store.flagCommentsPatientId = 'p1';
      store.flagCommentsPatientName = 'Jane Doe';
      store.comments = [{ text: 'hi', created_at: null, commented_by: 'A' }];
      store.commentsError = 'oops';
      store.newCommentText = 'draft';

      store.closeFlagComments();

      expect(store.showFlagCommentsModal).toBe(false);
      expect(store.flagCommentsPatientId).toBeNull();
      expect(store.flagCommentsPatientName).toBe('');
      expect(store.comments).toEqual([]);
      expect(store.commentsError).toBe('');
      expect(store.newCommentText).toBe('');
    });

    it('setNewCommentText updates the draft text', () => {
      store.setNewCommentText('Called patient.');
      expect(store.newCommentText).toBe('Called patient.');
    });
  });

  // ------------------------------------------------------------------
  // fetchComments
  // ------------------------------------------------------------------
  describe('fetchComments', () => {
    it('is a no-op without a target patient', async () => {
      await store.fetchComments(t);
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('loads comments for the current modal patient', async () => {
      store.flagCommentsPatientId = 'p1';
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { comments: [{ text: 'hi', created_at: '2026-01-01T00:00:00Z', commented_by: 'A' }] },
      });

      await store.fetchComments(t);

      expect(apiClient.get).toHaveBeenCalledWith('/patients/p1/comments/');
      expect(store.comments).toHaveLength(1);
      expect(store.commentsLoading).toBe(false);
    });

    it('defaults to an empty list for an unexpected response shape', async () => {
      store.flagCommentsPatientId = 'p1';
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });

      await store.fetchComments(t);

      expect(store.comments).toEqual([]);
    });

    it('sets commentsError on failure', async () => {
      store.flagCommentsPatientId = 'p1';
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { message: 'Server error' } },
      });

      await store.fetchComments(t);

      expect(store.commentsError).toBe('Server error');
      expect(store.commentsLoading).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // addComment
  // ------------------------------------------------------------------
  describe('addComment', () => {
    it('is a no-op without a target patient', async () => {
      store.newCommentText = 'hello';
      await store.addComment(t);
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('is a no-op when the draft text is empty or whitespace', async () => {
      store.flagCommentsPatientId = 'p1';
      store.newCommentText = '   ';
      await store.addComment(t);
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('is a no-op while a submission is already in flight', async () => {
      store.flagCommentsPatientId = 'p1';
      store.newCommentText = 'hello';
      store.commentSubmitting = true;
      await store.addComment(t);
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('posts the trimmed text, updates comments from the response, and clears the draft', async () => {
      store.flagCommentsPatientId = 'p1';
      store.newCommentText = '  Called patient.  ';
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          comments: [
            { text: 'Called patient.', created_at: '2026-01-01T00:00:00Z', commented_by: 'A' },
          ],
        },
      });

      await store.addComment(t);

      expect(apiClient.post).toHaveBeenCalledWith('/patients/p1/comments/', {
        text: 'Called patient.',
      });
      expect(store.comments).toHaveLength(1);
      expect(store.newCommentText).toBe('');
      expect(store.commentSubmitting).toBe(false);
    });

    it('keeps the existing comments list when the response shape is unexpected', async () => {
      store.flagCommentsPatientId = 'p1';
      store.newCommentText = 'hello';
      store.comments = [{ text: 'old', created_at: null, commented_by: 'A' }];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });

      await store.addComment(t);

      expect(store.comments).toEqual([{ text: 'old', created_at: null, commented_by: 'A' }]);
    });

    it('sets commentsError on failure and resets commentSubmitting', async () => {
      store.flagCommentsPatientId = 'p1';
      store.newCommentText = 'hello';
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { message: 'Text too long' } },
      });

      await store.addComment(t);

      expect(store.commentsError).toBe('Text too long');
      expect(store.commentSubmitting).toBe(false);
    });
  });
});
