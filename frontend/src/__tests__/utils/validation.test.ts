import { isValidEmail, isValidPhone, validateForm } from '@/utils/validation';

describe('Validation Utilities', () => {
  describe('isValidEmail', () => {
    it('accepts valid email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('user+tag@sub.domain.org')).toBe(true);
    });

    it('rejects invalid email addresses', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('missing@tld')).toBe(false);
      expect(isValidEmail('@nodomain.com')).toBe(false);
      expect(isValidEmail('spaces in@email.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('accepts valid phone numbers', () => {
      expect(isValidPhone('1234567')).toBe(true); // 7 digits minimum
      expect(isValidPhone('+41791234567')).toBe(true); // with country code
      expect(isValidPhone('123456789012345')).toBe(true); // 15 digits maximum
    });

    it('rejects invalid phone numbers', () => {
      expect(isValidPhone('123456')).toBe(false); // too short (6 digits)
      expect(isValidPhone('1234567890123456')).toBe(false); // too long (16 digits)
      expect(isValidPhone('+1-800-555-0199')).toBe(false); // contains hyphens
      expect(isValidPhone('abc1234567')).toBe(false); // letters
      expect(isValidPhone('')).toBe(false);
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

  it('flags invalid password', () => {
    const formData = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      password: 'weak',
      repeatPassword: 'weak',
    };
    const result = validateForm(formData);
    expect(result.valid).toBe(false);
    expect(result.newErrors.password).toBe(
      'Password must be 8-16 characters, include upper/lowercase letters, a number, and a special character.'
    );
  });
});
