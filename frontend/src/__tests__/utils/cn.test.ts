import { cn } from '@/lib/utils';

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('px-4')).toBe('px-4');
  });

  it('joins multiple class names with a space', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz');
  });

  it('resolves tailwind conflicts - last value wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  it('drops falsy values (false, null, undefined)', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('supports object syntax: includes truthy keys, drops falsy', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('supports array syntax', () => {
    expect(cn(['flex', 'items-center'])).toBe('flex items-center');
  });

  it('returns an empty string when given no arguments', () => {
    expect(cn()).toBe('');
  });
});
