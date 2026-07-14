import { InterventionRepeatModalStore } from '@/stores/interventionRepeatModalStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1' },
}));
jest.mock('i18next', () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    key.replace(/{{(\w+)}}/g, (_match, name) => String(values?.[name] ?? '')),
}));

describe('InterventionRepeatModalStore', () => {
  let store: InterventionRepeatModalStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new InterventionRepeatModalStore();
  });

  // ------------------------------------------------------------------
  // reset
  // ------------------------------------------------------------------
  describe('reset', () => {
    it('does nothing when show is false', () => {
      store.interval = 5;
      store.reset(false, 'create');
      expect(store.interval).toBe(5);
    });

    it('applies defaults for a create reset', () => {
      store.reset(true, 'create', {
        interval: 3,
        unit: 'week',
        selectedDays: ['Mon', 'Wed'],
        end: { type: 'count', count: 5 },
        startTime: '09:30',
        require_video_feedback: true,
        notes: 'careful',
      });

      expect(store.mode).toBe('create');
      expect(store.interval).toBe(3);
      expect(store.unit).toBe('week');
      expect(store.selectedDays).toEqual(['Mon', 'Wed']);
      expect(store.endOption).toBe('count');
      expect(store.occurrenceCount).toBe(5);
      expect(store.startTime).toBe('09:30');
      expect(store.requireVideoFeedback).toBe(true);
      expect(store.personalNote).toBe('careful');
      expect(store.startDateCreate).toBeInstanceOf(Date);
    });

    it('falls back to defaults when no overrides are given', () => {
      store.reset(true, 'create');
      expect(store.interval).toBe(1);
      expect(store.unit).toBe('day');
      expect(store.selectedDays).toEqual([]);
      expect(store.endOption).toBe('never');
      expect(store.occurrenceCount).toBe(10);
      expect(store.startTime).toBe('08:00');
      expect(store.requireVideoFeedback).toBe(false);
      expect(store.keepCurrent).toBe(false);
      expect(store.personalNote).toBe('');
    });

    it('does not set startDateCreate in modify mode', () => {
      store.reset(true, 'modify');
      expect(store.startDateCreate).toBeNull();
      expect(store.effectiveFrom).toBeInstanceOf(Date);
    });

    it('parses endDate and effectiveFrom from defaults', () => {
      store.reset(true, 'modify', {
        end: { type: 'date', date: '2026-05-01T00:00:00Z' },
        effectiveFrom: '2026-04-01T00:00:00Z',
      });
      expect(store.endDate).toEqual(new Date('2026-05-01T00:00:00Z'));
      expect(store.effectiveFrom).toEqual(new Date('2026-04-01T00:00:00Z'));
    });

    it('clears submission state', () => {
      store.submitting = true;
      store.success = true;
      store.error = 'oops';
      store.fieldErrors = { foo: 'bar' };

      store.reset(true, 'create');

      expect(store.submitting).toBe(false);
      expect(store.success).toBe(false);
      expect(store.error).toBe('');
      expect(store.fieldErrors).toEqual({});
    });
  });

  // ------------------------------------------------------------------
  // toggleDay
  // ------------------------------------------------------------------
  describe('toggleDay', () => {
    it('adds a day when not selected', () => {
      store.toggleDay('Mon');
      expect(store.selectedDays).toEqual(['Mon']);
    });

    it('removes a day when already selected', () => {
      store.selectedDays = ['Mon', 'Tue'];
      store.toggleDay('Mon');
      expect(store.selectedDays).toEqual(['Tue']);
    });
  });

  // ------------------------------------------------------------------
  // isModify
  // ------------------------------------------------------------------
  describe('isModify', () => {
    it('is true in modify mode', () => {
      store.mode = 'modify';
      expect(store.isModify).toBe(true);
    });

    it('is false in create mode', () => {
      store.mode = 'create';
      expect(store.isModify).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // summary
  // ------------------------------------------------------------------
  describe('summary', () => {
    it('describes a daily interval of 1', () => {
      store.unit = 'day';
      store.interval = 1;
      expect(store.summary).toBe('Occurs every day.');
    });

    it('describes a daily interval > 1 with an ordinal', () => {
      store.unit = 'day';
      store.interval = 2;
      expect(store.summary).toBe('Occurs every 2nd day.');
    });

    it('describes a weekly interval of 1 with selected days', () => {
      store.unit = 'week';
      store.interval = 1;
      store.selectedDays = ['Mon', 'Wed'];
      expect(store.summary).toBe('Occurs weekly on Mon, Wed.');
    });

    it('describes a weekly interval > 1 with an ordinal and days', () => {
      store.unit = 'week';
      store.interval = 3;
      store.selectedDays = [];
      expect(store.summary).toBe('Occurs every 3rd weeks on ….');
    });

    it('describes a monthly interval of 1', () => {
      store.unit = 'month';
      store.interval = 1;
      expect(store.summary).toBe('Occurs monthly on the same date.');
    });

    it('describes a monthly interval > 1 with an ordinal', () => {
      store.unit = 'month';
      store.interval = 11;
      expect(store.summary).toBe('Occurs every 11th months on the same date.');
    });
  });

  // ------------------------------------------------------------------
  // canSubmit
  // ------------------------------------------------------------------
  describe('canSubmit', () => {
    it('is false in create mode without a start date', () => {
      store.mode = 'create';
      store.startDateCreate = null;
      expect(store.canSubmit).toBe(false);
    });

    it('is false in create mode with weekly unit and no selected days', () => {
      store.mode = 'create';
      store.startDateCreate = new Date();
      store.unit = 'week';
      store.selectedDays = [];
      expect(store.canSubmit).toBe(false);
    });

    it('is true in create mode with valid data', () => {
      store.mode = 'create';
      store.startDateCreate = new Date();
      store.unit = 'day';
      expect(store.canSubmit).toBe(true);
    });

    it('is false in modify mode without effectiveFrom', () => {
      store.mode = 'modify';
      store.effectiveFrom = null;
      expect(store.canSubmit).toBe(false);
    });

    it('is true in modify mode when keepCurrent is set, regardless of weekday selection', () => {
      store.mode = 'modify';
      store.effectiveFrom = new Date();
      store.keepCurrent = true;
      store.unit = 'week';
      store.selectedDays = [];
      expect(store.canSubmit).toBe(true);
    });

    it('is false in modify mode with weekly unit and no selected days', () => {
      store.mode = 'modify';
      store.effectiveFrom = new Date();
      store.keepCurrent = false;
      store.unit = 'week';
      store.selectedDays = [];
      expect(store.canSubmit).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // validate
  // ------------------------------------------------------------------
  describe('validate', () => {
    it('passes for a valid create form', () => {
      store.mode = 'create';
      store.startDateCreate = new Date();
      store.startTime = '08:00';
      expect(store.validate()).toBe(true);
      expect(store.fieldErrors).toEqual({});
    });

    it('flags a missing start time', () => {
      store.startTime = '';
      store.validate();
      expect(store.fieldErrors.startTime).toBe('Please choose a start time.');
    });

    it('flags an interval below 1', () => {
      store.interval = 0;
      store.validate();
      expect(store.fieldErrors.interval).toBe('Interval must be >= 1.');
    });

    it('flags a missing start date in create mode', () => {
      store.mode = 'create';
      store.startDateCreate = null;
      store.validate();
      expect(store.fieldErrors.startDateCreate).toBe('Please choose a start date.');
    });

    it('flags a missing effective date in modify mode', () => {
      store.mode = 'modify';
      store.effectiveFrom = null;
      store.validate();
      expect(store.fieldErrors.effectiveFrom).toBe('Please choose an effective date.');
    });

    it('flags missing weekday selection when unit is week', () => {
      store.unit = 'week';
      store.selectedDays = [];
      store.mode = 'create';
      store.startDateCreate = new Date();
      store.validate();
      expect(store.fieldErrors.selectedDays).toBe('Select at least one weekday.');
    });

    it('skips weekday/end validation in modify mode with keepCurrent', () => {
      store.mode = 'modify';
      store.effectiveFrom = new Date();
      store.keepCurrent = true;
      store.unit = 'week';
      store.selectedDays = [];
      store.endOption = 'date';
      store.endDate = null;
      expect(store.validate()).toBe(true);
    });

    it('flags a missing end date when endOption is date', () => {
      store.mode = 'create';
      store.startDateCreate = new Date();
      store.endOption = 'date';
      store.endDate = null;
      store.validate();
      expect(store.fieldErrors.endDate).toBe('Pick an end date.');
    });

    it('flags an invalid occurrence count when endOption is count', () => {
      store.mode = 'create';
      store.startDateCreate = new Date();
      store.endOption = 'count';
      store.occurrenceCount = 0;
      store.validate();
      expect(store.fieldErrors.occurrenceCount).toBe('Number of occurrences must be >= 1.');
    });
  });

  // ------------------------------------------------------------------
  // submit — create mode
  // ------------------------------------------------------------------
  describe('submit (create)', () => {
    beforeEach(() => {
      store.mode = 'create';
      store.startDateCreate = new Date('2026-01-01T00:00:00Z');
      store.startTime = '08:00';
    });

    it('aborts without calling the API when validation fails', async () => {
      store.startTime = '';
      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('posts to add-to-patient for a non-diagnosis target', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201 });
      const onSuccess = jest.fn();

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false, onSuccess });

      expect(apiClient.post).toHaveBeenCalledWith(
        'interventions/add-to-patient/',
        expect.objectContaining({
          therapistId: 'therapist-1',
          patientId: 'p1',
        })
      );
      expect(store.success).toBe(true);
      expect(onSuccess).toHaveBeenCalled();
    });

    it('posts to assign-to-patient-types for a diagnosis target', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      await store.submit({ patient: 'all', intervention: 'i1', isDiagnosis: true });

      expect(apiClient.post).toHaveBeenCalledWith(
        'interventions/assign-to-patient-types/',
        expect.anything()
      );
    });

    it('accepts an intervention object and extracts its _id', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      await store.submit({ patient: 'p1', intervention: { _id: 'obj-id' }, isDiagnosis: false });

      const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
      expect(payload.interventions[0].interventionId).toBe('obj-id');
    });

    it('uses explicit therapistId over authStore.id', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      await store.submit({
        patient: 'p1',
        intervention: 'i1',
        isDiagnosis: false,
        therapistId: 'therapist-9',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ therapistId: 'therapist-9' })
      );
    });

    it('sets an error message when the response status is unexpected', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 500 });

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      expect(store.error).toBe('Failed to add intervention.');
      expect(store.success).toBe(false);
    });

    it('resets submitting to false after completion', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });
      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });
      expect(store.submitting).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // submit — modify mode
  // ------------------------------------------------------------------
  describe('submit (modify)', () => {
    beforeEach(() => {
      store.mode = 'modify';
      store.effectiveFrom = new Date('2026-01-01T00:00:00Z');
      store.startTime = '08:00';
    });

    it('posts to modify-patient endpoint', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/interventions/modify-patient/',
        expect.objectContaining({ patientId: 'p1', interventionId: 'i1' })
      );
      expect(store.success).toBe(true);
    });

    it('omits the schedule field when keepCurrent is true', async () => {
      store.keepCurrent = true;
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
      expect(payload.schedule).toBeUndefined();
      expect(payload.keep_current).toBe(true);
    });

    it('includes a schedule payload when keepCurrent is false', async () => {
      store.keepCurrent = false;
      store.unit = 'day';
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
      expect(payload.schedule).toBeDefined();
      expect(payload.schedule.unit).toBe('day');
    });

    it('sets an error message when the modify response status is unexpected', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 400 });

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      expect(store.error).toBe('Failed to modify intervention.');
    });
  });

  // ------------------------------------------------------------------
  // submit — error handling
  // ------------------------------------------------------------------
  describe('submit error handling', () => {
    beforeEach(() => {
      store.mode = 'create';
      store.startDateCreate = new Date();
      store.startTime = '08:00';
    });

    it('formats field_errors and non_field_errors into a combined message', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {
          data: {
            message: 'Validation failed',
            field_errors: { patient: ['is required'] },
            non_field_errors: ['overlap detected'],
          },
        },
      });

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      expect(store.error).toBe('Validation failed\n• patient: is required\n• overlap detected');
    });

    it('falls back to err.message when no backend payload is present', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      expect(store.error).toBe('Network Error');
    });

    it('falls back to a generic message when nothing else is available', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({});

      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });

      expect(store.error).toBe('Something went wrong.');
    });

    it('resets submitting to false after an error', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      await store.submit({ patient: 'p1', intervention: 'i1', isDiagnosis: false });
      expect(store.submitting).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // weekdays
  // ------------------------------------------------------------------
  describe('weekdays', () => {
    it('exposes the fixed weekday list', () => {
      expect(store.weekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });
  });
});
