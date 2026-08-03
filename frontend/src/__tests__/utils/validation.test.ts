import { isValidEmail, isValidPhone } from '@/utils/validation';

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
});
