import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageHeader from '@/components/PageHeader';

describe('PageHeader', () => {
  it('renders title and subtitle', () => {
    render(<PageHeader title="Library" subtitle="Patient resources" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Patient resources' })
    ).toBeInTheDocument();
  });

  it('renders nothing when no header content is provided', () => {
    const { container } = render(<PageHeader />);

    expect(container).toBeEmptyDOMElement();
  });
});
