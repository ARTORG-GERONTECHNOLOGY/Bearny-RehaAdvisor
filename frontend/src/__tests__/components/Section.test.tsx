import { render, screen } from '@testing-library/react';

import Section from '@/components/Section';

describe('Section', () => {
  it('renders children content', () => {
    render(
      <Section>
        <p>Section content</p>
      </Section>
    );

    expect(screen.getByText('Section content')).toBeInTheDocument();
  });

  it('applies base and custom classes', () => {
    render(
      <Section className="custom-section-class" aria-label="Main section">
        <span>Inside</span>
      </Section>
    );

    const section = screen.getByLabelText('Main section');
    expect(section).toHaveClass('flex');
    expect(section).toHaveClass('flex-col');
    expect(section).toHaveClass('gap-2');
    expect(section).toHaveClass('bg-white');
    expect(section).toHaveClass('rounded-[40px]');
    expect(section).toHaveClass('p-4');
    expect(section).toHaveClass('custom-section-class');
  });

  it('forwards native section props', () => {
    render(
      <Section id="rehab-section" data-testid="rehab-section" role="region">
        <span>Props test</span>
      </Section>
    );

    const section = screen.getByTestId('rehab-section');
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveAttribute('id', 'rehab-section');
    expect(section).toHaveAttribute('role', 'region');
  });
});