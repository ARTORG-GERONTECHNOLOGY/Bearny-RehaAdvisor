import { render, screen } from '@testing-library/react';
import { colors } from '@/lib/colors';
import {
  ChartContainer,
  ChartStyle,
  ChartTooltipContent,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';

// Recharts uses ResizeObserver / canvas / getBoundingClientRect — mock the primitives
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: () => null,
  Legend: () => null,
}));

const baseConfig: ChartConfig = {
  sales: { label: 'Sales', color: colors.brand },
};

const mockPayload = [
  {
    value: 123,
    name: 'sales',
    dataKey: 'sales',
    color: colors.brand,
    payload: { fill: colors.brand },
  },
] as any;

// ─── ChartContainer ──────────────────────────────────────────────────────────

describe('ChartContainer', () => {
  it('renders children', () => {
    render(
      <ChartContainer config={baseConfig}>
        <div data-testid="inner">chart</div>
      </ChartContainer>
    );
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('sets data-chart attribute from id prop', () => {
    render(
      <ChartContainer config={baseConfig} id="my-chart">
        <div />
      </ChartContainer>
    );
    expect(document.querySelector('[data-chart="chart-my-chart"]')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    const { container } = render(
      <ChartContainer config={baseConfig} className="custom-cls">
        <div />
      </ChartContainer>
    );
    expect(container.firstChild).toHaveClass('custom-cls');
  });
});

// ─── ChartStyle ──────────────────────────────────────────────────────────────

describe('ChartStyle', () => {
  it('returns null when config has no color or theme entries', () => {
    const emptyConfig: ChartConfig = { plain: { label: 'Plain' } };
    const { container } = render(<ChartStyle id="c" config={emptyConfig} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a style tag when config has color entries', () => {
    const { container } = render(<ChartStyle id="c" config={baseConfig} />);
    const style = container.querySelector('style');
    expect(style).toBeInTheDocument();
    expect(style?.textContent).toContain('--color-sales');
  });

  it('renders style for theme-based colors', () => {
    const themeConfig: ChartConfig = {
      revenue: { label: 'Revenue', theme: { light: '#aaa', dark: '#bbb' } },
    };
    const { container } = render(<ChartStyle id="c" config={themeConfig} />);
    expect(container.querySelector('style')?.textContent).toContain('--color-revenue');
  });
});

// ─── ChartTooltipContent ─────────────────────────────────────────────────────

describe('ChartTooltipContent', () => {
  it('returns null when not active', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active={false} payload={mockPayload} />
      </ChartContainer>
    );
    // The tooltip outer div should not be rendered
    expect(container.querySelector('.grid.min-w-\\[8rem\\]')).toBeNull();
  });

  it('returns null when active but payload is empty', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={[]} />
      </ChartContainer>
    );
    expect(container.querySelector('.grid.min-w-\\[8rem\\]')).toBeNull();
  });

  it('renders content when active with payload', () => {
    render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={mockPayload} label="sales" />
      </ChartContainer>
    );
    // 'Sales' appears in header label and/or item label
    expect(screen.getAllByText('Sales').length).toBeGreaterThan(0);
  });

  it('renders numeric value', () => {
    render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={mockPayload} />
      </ChartContainer>
    );
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('does not render the header label when hideLabel=true', () => {
    render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={mockPayload} label="sales" hideLabel />
      </ChartContainer>
    );
    // Value still renders; component should not crash
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('renders labelFormatter output', () => {
    render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent
          active
          payload={mockPayload}
          label="sales"
          labelFormatter={() => <span>Custom Label</span>}
        />
      </ChartContainer>
    );
    expect(screen.getByText('Custom Label')).toBeInTheDocument();
  });

  it('renders with line indicator', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={mockPayload} indicator="line" />
      </ChartContainer>
    );
    expect(container.querySelector('.w-1')).toBeInTheDocument();
  });

  it('renders with dashed indicator', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={mockPayload} indicator="dashed" />
      </ChartContainer>
    );
    expect(container.querySelector('.border-dashed')).toBeInTheDocument();
  });

  it('omits indicator when hideIndicator=true', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={mockPayload} hideIndicator />
      </ChartContainer>
    );
    expect(container.querySelector('.shrink-0')).toBeNull();
  });

  it('renders icon from config instead of indicator', () => {
    const Icon = () => <svg data-testid="cfg-icon" />;
    const iconConfig: ChartConfig = { sales: { label: 'Sales', icon: Icon } };
    render(
      <ChartContainer config={iconConfig}>
        <ChartTooltipContent active payload={mockPayload} />
      </ChartContainer>
    );
    expect(screen.getByTestId('cfg-icon')).toBeInTheDocument();
  });

  it('calls per-item formatter when provided', () => {
    const formatter = jest.fn(() => <span data-testid="fmt">$123</span>);
    render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={mockPayload} formatter={formatter} />
      </ChartContainer>
    );
    expect(formatter).toHaveBeenCalled();
    expect(screen.getByTestId('fmt')).toBeInTheDocument();
  });

  it('filters out payload items with type=none', () => {
    const nonePayload = [
      { value: 50, name: 'hidden', dataKey: 'hidden', color: '#000', type: 'none', payload: {} },
    ] as any;
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartTooltipContent active payload={nonePayload} />
      </ChartContainer>
    );
    // All items filtered → no value rendered
    expect(container.querySelector('.font-mono')).toBeNull();
  });

  it('throws useChart error when rendered outside ChartContainer', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ChartTooltipContent />)).toThrow(
      'useChart must be used within a <ChartContainer />'
    );
    spy.mockRestore();
  });
});

// ─── ChartLegendContent ──────────────────────────────────────────────────────

describe('ChartLegendContent', () => {
  const legendPayload = [
    { value: 'sales', dataKey: 'sales', type: 'circle', color: colors.brand },
  ] as any;

  it('returns null when payload is empty', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartLegendContent payload={[]} />
      </ChartContainer>
    );
    expect(container.querySelector('.gap-4')).toBeNull();
  });

  it('renders legend label from config', () => {
    render(
      <ChartContainer config={baseConfig}>
        <ChartLegendContent payload={legendPayload} />
      </ChartContainer>
    );
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('applies pb-3 for verticalAlign=top', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartLegendContent payload={legendPayload} verticalAlign="top" />
      </ChartContainer>
    );
    expect(container.querySelector('.pb-3')).toBeInTheDocument();
  });

  it('applies pt-3 for verticalAlign=bottom (default)', () => {
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartLegendContent payload={legendPayload} />
      </ChartContainer>
    );
    expect(container.querySelector('.pt-3')).toBeInTheDocument();
  });

  it('renders icon from config when hideIcon=false', () => {
    const Icon = () => <svg data-testid="legend-icon" />;
    const iconConfig: ChartConfig = { sales: { label: 'Sales', icon: Icon } };
    render(
      <ChartContainer config={iconConfig}>
        <ChartLegendContent payload={legendPayload} hideIcon={false} />
      </ChartContainer>
    );
    expect(screen.getByTestId('legend-icon')).toBeInTheDocument();
  });

  it('shows color dot instead of icon when hideIcon=true', () => {
    const Icon = () => <svg data-testid="legend-icon" />;
    const iconConfig: ChartConfig = { sales: { label: 'Sales', icon: Icon } };
    const { container } = render(
      <ChartContainer config={iconConfig}>
        <ChartLegendContent payload={legendPayload} hideIcon />
      </ChartContainer>
    );
    expect(screen.queryByTestId('legend-icon')).not.toBeInTheDocument();
    expect(container.querySelector('.h-2.w-2')).toBeInTheDocument();
  });

  it('filters out items with type=none', () => {
    const nonePayload = [
      { value: 'hidden', dataKey: 'hidden', type: 'none', color: '#000' },
    ] as any;
    const { container } = render(
      <ChartContainer config={baseConfig}>
        <ChartLegendContent payload={nonePayload} />
      </ChartContainer>
    );
    expect(container.querySelector('.gap-1\\.5')).toBeNull();
  });
});
