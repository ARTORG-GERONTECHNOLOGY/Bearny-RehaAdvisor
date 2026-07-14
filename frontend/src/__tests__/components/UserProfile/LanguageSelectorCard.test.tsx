import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LanguageSelectorCard from '@/components/UserProfile/LanguageSelectorCard';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Real Radix Select needs pointer-capture APIs jsdom doesn't implement — mock it with a
// native <select> that still wires value/onValueChange, so handleChange is exercised for real.
jest.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <select
      data-testid="language-select"
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-placeholder">{placeholder}</span>
  ),
}));

describe('LanguageSelectorCard', () => {
  it('renders an option for every supported language', () => {
    render(<LanguageSelectorCard />);
    ['English', 'Deutsch', 'Français', 'Italiano', 'Português', 'Nederlands'].forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('selects the current i18n language (falls back to resolvedLanguage/language, sliced to 2 chars)', () => {
    render(<LanguageSelectorCard />);
    expect(screen.getByTestId('language-select')).toHaveValue('en');
  });

  it('prefers i18n.resolvedLanguage over i18n.language when both are set', () => {
    const { useTranslation } = jest.requireMock('react-i18next');
    const { i18n } = useTranslation();
    i18n.resolvedLanguage = 'fr-FR';

    render(<LanguageSelectorCard />);
    expect(screen.getByTestId('language-select')).toHaveValue('fr');

    delete i18n.resolvedLanguage;
  });

  it('falls back to "en" when neither resolvedLanguage nor language is set', () => {
    const { useTranslation } = jest.requireMock('react-i18next');
    const { i18n } = useTranslation();
    const originalLanguage = i18n.language;
    i18n.language = undefined;

    render(<LanguageSelectorCard />);
    expect(screen.getByTestId('language-select')).toHaveValue('en');

    i18n.language = originalLanguage;
  });

  it('calls i18n.changeLanguage when a different language is selected', () => {
    const { useTranslation } = jest.requireMock('react-i18next');
    const { i18n } = useTranslation();

    render(<LanguageSelectorCard />);
    fireEvent.change(screen.getByTestId('language-select'), { target: { value: 'fr' } });

    expect(i18n.changeLanguage).toHaveBeenCalledWith('fr');
  });
});
