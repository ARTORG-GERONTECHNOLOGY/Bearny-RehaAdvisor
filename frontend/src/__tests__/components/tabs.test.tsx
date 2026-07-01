import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function renderTabs(defaultValue = 'tab1') {
  return render(
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('renders the default tab content', () => {
    renderTabs();
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
  });

  it('switches content when a different trigger is clicked', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByText('Tab 2'));
    expect(screen.getByText('Content 2')).toBeInTheDocument();
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
  });

  it('marks the active trigger with data-state="active"', async () => {
    const user = userEvent.setup();
    renderTabs();
    expect(screen.getByText('Tab 1')).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Tab 2')).toHaveAttribute('data-state', 'inactive');

    await user.click(screen.getByText('Tab 2'));

    expect(screen.getByText('Tab 1')).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByText('Tab 2')).toHaveAttribute('data-state', 'active');
  });

  it('respects a different default value', () => {
    renderTabs('tab2');
    expect(screen.getByText('Content 2')).toBeInTheDocument();
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
  });

  it('applies base classes to TabsList', () => {
    renderTabs();
    expect(screen.getByRole('tablist')).toHaveClass('inline-flex', 'bg-muted');
  });

  it('merges custom className on TabsList', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList className="custom-list">
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole('tablist')).toHaveClass('custom-list', 'inline-flex');
  });

  it('merges custom className on TabsTrigger', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1" className="custom-trigger">
            Tab 1
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Tab 1')).toHaveClass('custom-trigger');
  });

  it('merges custom className on TabsContent', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="custom-content">
          Content 1
        </TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Content 1')).toHaveClass('custom-content');
  });

  it('disables a trigger when disabled prop is set', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2" disabled>
            Tab 2
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Tab 2')).toBeDisabled();
    await user.click(screen.getByText('Tab 2'));
    expect(screen.getByText('Content 1')).toBeInTheDocument();
  });

  it('forwards refs to the underlying DOM elements', () => {
    const listRef = { current: null as HTMLDivElement | null };
    const triggerRef = { current: null as HTMLButtonElement | null };
    const contentRef = { current: null as HTMLDivElement | null };

    render(
      <Tabs defaultValue="tab1">
        <TabsList ref={listRef}>
          <TabsTrigger ref={triggerRef} value="tab1">
            Tab 1
          </TabsTrigger>
        </TabsList>
        <TabsContent ref={contentRef} value="tab1">
          Content 1
        </TabsContent>
      </Tabs>
    );

    expect(listRef.current).toBeInstanceOf(HTMLDivElement);
    expect(triggerRef.current).toBeInstanceOf(HTMLButtonElement);
    expect(contentRef.current).toBeInstanceOf(HTMLDivElement);
  });
});
