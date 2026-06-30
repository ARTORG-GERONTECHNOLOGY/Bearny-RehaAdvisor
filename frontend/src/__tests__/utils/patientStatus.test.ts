import {
  adherenceLevel,
  ampelComposite,
  daysSince,
  feedbackLevel,
  fmtDate,
  getPatientIdStr,
  getPatientMongoId,
  loginLevel,
} from '@/utils/patientStatus';
import type { PatientType } from '@/types';

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

const makePatient = (overrides: Record<string, unknown> = {}): PatientType =>
  ({
    _id: 'patient-1',
    username: 'jdoe',
    first_name: 'Jane',
    name: 'Doe',
    age: '1990-01-01',
    diagnosis: [],
    sex: 'Female',
    duration: 30,
    ...overrides,
  }) as unknown as PatientType;

describe('daysSince', () => {
  it('returns Infinity for missing or invalid input', () => {
    expect(daysSince(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(daysSince('not-a-date')).toBe(Number.POSITIVE_INFINITY);
  });

  it('computes whole days between now and the given ISO date', () => {
    expect(daysSince(isoDaysAgo(5))).toBe(5);
  });
});

describe('fmtDate', () => {
  it('returns empty string for falsy input', () => {
    expect(fmtDate(undefined)).toBe('');
    expect(fmtDate('')).toBe('');
  });

  it('returns the original string for unparseable input', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid ISO date', () => {
    expect(fmtDate('2024-01-15')).toBe(new Date('2024-01-15').toLocaleDateString());
  });
});

describe('getPatientIdStr / getPatientMongoId', () => {
  it('prefers patient_code, then username, then a trailing slice of the mongo id', () => {
    expect(getPatientIdStr(makePatient({ patient_code: 'P-001' }))).toBe('P-001');
    expect(getPatientIdStr(makePatient({ patient_code: undefined, username: 'jdoe' }))).toBe(
      'jdoe'
    );
    expect(
      getPatientIdStr(
        makePatient({ patient_code: undefined, username: undefined, _id: 'abcdefghij12' })
      )
    ).toBe('efghij12');
  });

  it('falls back to an em dash when nothing identifying is present', () => {
    expect(
      getPatientIdStr(makePatient({ patient_code: undefined, username: undefined, _id: undefined }))
    ).toBe('—');
  });

  it('returns the raw mongo id', () => {
    expect(getPatientMongoId(makePatient({ _id: 'mongo-id-1' }))).toBe('mongo-id-1');
  });
});

describe('loginLevel', () => {
  it('is unknown when the patient never logged in', () => {
    expect(loginLevel(makePatient())).toBe('unknown');
  });

  it('is good within 3 days, warn within 7, bad beyond that', () => {
    expect(loginLevel(makePatient({ last_online: isoDaysAgo(1) }))).toBe('good');
    expect(loginLevel(makePatient({ last_online: isoDaysAgo(5) }))).toBe('warn');
    expect(loginLevel(makePatient({ last_online: isoDaysAgo(10) }))).toBe('bad');
  });
});

describe('adherenceLevel', () => {
  it('is unknown when adherence_rate is missing or not numeric', () => {
    expect(adherenceLevel(makePatient())).toBe('unknown');
  });

  it('is good >= 80, warn >= 50, bad otherwise', () => {
    expect(adherenceLevel(makePatient({ adherence_rate: 85 }))).toBe('good');
    expect(adherenceLevel(makePatient({ adherence_rate: 60 }))).toBe('warn');
    expect(adherenceLevel(makePatient({ adherence_rate: 20 }))).toBe('bad');
  });
});

describe('feedbackLevel', () => {
  it('is unknown when no feedback has ever been answered', () => {
    expect(feedbackLevel(makePatient())).toBe('unknown');
    expect(
      feedbackLevel(
        makePatient({ intervention_feedback: { answered_days_total: 0, last_answered_at: null } })
      )
    ).toBe('unknown');
  });

  it('is bad when stale beyond 30 days or >=7 low ratings in 14 days', () => {
    expect(
      feedbackLevel(
        makePatient({
          intervention_feedback: {
            answered_days_total: 5,
            last_answered_at: isoDaysAgo(31),
            days_since_last: 31,
            low_ratings_14d: 0,
          },
        })
      )
    ).toBe('bad');

    expect(
      feedbackLevel(
        makePatient({
          intervention_feedback: {
            answered_days_total: 5,
            last_answered_at: isoDaysAgo(1),
            days_since_last: 1,
            low_ratings_14d: 7,
          },
        })
      )
    ).toBe('bad');
  });

  it('is warn between 15-30 days stale or 3-6 low ratings', () => {
    expect(
      feedbackLevel(
        makePatient({
          intervention_feedback: {
            answered_days_total: 5,
            last_answered_at: isoDaysAgo(20),
            days_since_last: 20,
            low_ratings_14d: 0,
          },
        })
      )
    ).toBe('warn');
  });

  it('is good when recent and few low ratings', () => {
    expect(
      feedbackLevel(
        makePatient({
          intervention_feedback: {
            answered_days_total: 5,
            last_answered_at: isoDaysAgo(1),
            days_since_last: 1,
            low_ratings_14d: 0,
          },
        })
      )
    ).toBe('good');
  });
});

describe('ampelComposite', () => {
  it('ranks a patient with all-bad signals higher (worse) than an all-good one', () => {
    const badPatient = makePatient({
      last_online: isoDaysAgo(40),
      adherence_rate: 10,
      intervention_feedback: {
        answered_days_total: 5,
        last_answered_at: isoDaysAgo(40),
        days_since_last: 40,
        low_ratings_14d: 8,
      },
    });
    const goodPatient = makePatient({
      last_online: isoDaysAgo(1),
      adherence_rate: 95,
      intervention_feedback: {
        answered_days_total: 5,
        last_answered_at: isoDaysAgo(1),
        days_since_last: 1,
        low_ratings_14d: 0,
      },
    });

    expect(ampelComposite(badPatient)).toBeGreaterThan(ampelComposite(goodPatient));
  });
});
