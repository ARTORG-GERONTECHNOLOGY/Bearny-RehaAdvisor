import {
  isValidName,
  validateForm,
  hasNonEmptyValue,
  validateCurrentStep,
} from '../../utils/validation';

describe('Validation Utilities', () => {
  describe('isValidName', () => {
    it('validates correct names', () => {
      expect(isValidName('John')).toBe(true);
    });

    it('rejects names with numbers or symbols', () => {
      expect(isValidName('John123')).toBe(false);
      expect(isValidName('!@#')).toBe(false);
    });
  });

  describe('validateForm', () => {
    it('returns valid=true for correct input', () => {
      const formData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Aa!12345',
        repeatPassword: 'Aa!12345',
      };
      const result = validateForm(formData);
      expect(result.valid).toBe(true);
      expect(Object.values(result.newErrors).every((e) => e === '')).toBe(true);
    });

    it('detects invalid email and mismatched passwords', () => {
      const formData = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'Aa!12345',
        repeatPassword: 'WrongPassword1!',
      };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.newErrors.email).toBe('Invalid email address.');
      expect(result.newErrors.repeatPassword).toBe('Passwords do not match.');
    });
  });

  describe('hasNonEmptyValue', () => {
    it('detects when there is at least one non-empty value', () => {
      const data = { a: '', b: null, c: 'value' };
      expect(hasNonEmptyValue(data)).toBe(true);
    });

    it('returns false if all values are empty', () => {
      const data = { a: '', b: null, c: '' };
      expect(hasNonEmptyValue(data)).toBe(false);
    });
  });

  describe('validateCurrentStep', () => {
    it('validates step with no empty fields', () => {
      const data = { field1: 'yes', field2: 'present' };
      const { validity, newErrors } = validateCurrentStep(data);
      expect(validity).toBe(true);
      expect(Object.keys(newErrors).length).toBe(0);
    });

    it('returns errors for empty fields', () => {
      const data = { field1: '', field2: null };
      const { validity, newErrors } = validateCurrentStep(data);
      expect(validity).toBe(false);
      expect(newErrors.field1).toBe('field1 cannot be empty');
      expect(newErrors.field2).toBe('field2 cannot be empty');
    });
  });
  it('flags invalid first and last names', () => {
    const formData = {
      firstName: '123',
      lastName: '!!@@',
      email: 'john@example.com',
      password: 'Aa!12345',
      repeatPassword: 'Aa!12345',
    };
    const result = validateForm(formData);
    expect(result.valid).toBe(false);
    expect(result.newErrors.firstName).toBe('First name should only contain letters and spaces.');
    expect(result.newErrors.lastName).toBe('Last name should only contain letters and spaces.');
  });

  it('detects valid passwords that do not match', () => {
    const formData = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      password: 'Aa!12345',
      repeatPassword: 'Aa!54321',
    };
    const result = validateForm(formData);
    expect(result.valid).toBe(false);
    expect(result.newErrors.repeatPassword).toBe('Passwords do not match.');
  });
});
