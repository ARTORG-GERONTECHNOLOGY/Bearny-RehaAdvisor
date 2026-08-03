import React from 'react';
import { render, screen } from '@testing-library/react';

import ChartEmptyState from '@/components/Health/charts/ChartEmptyState';

describe('ChartEmptyState', () => {
  it('renders the message and no hint by default', () => {
    render(<ChartEmptyState message="No steps data" />);
    expect(screen.getByText('No steps data')).toBeInTheDocument();
  });

  it('renders the hint when given', () => {
    render(<ChartEmptyState message="No wear time data" hint="Some devices don't report this." />);
    expect(screen.getByText('No wear time data')).toBeInTheDocument();
    expect(screen.getByText("Some devices don't report this.")).toBeInTheDocument();
  });

  it('merges a caller-provided className onto the container', () => {
    const { container } = render(<ChartEmptyState message="No data" className="h-80 max-h-80" />);
    expect(container.firstChild).toHaveClass('h-80', 'max-h-80', 'flex');
  });

  it('forwards the ref to the container element', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<ChartEmptyState ref={ref} message="No data" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveTextContent('No data');
  });
});
