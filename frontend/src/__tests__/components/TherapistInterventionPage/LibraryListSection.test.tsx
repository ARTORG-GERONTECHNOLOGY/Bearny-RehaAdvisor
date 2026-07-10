import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LibraryListSection from '@/components/TherapistInterventionPage/LibraryListSection';
import type { InterventionTypeTh } from '@/types';

jest.mock('@/components/TherapistInterventionPage/InterventionList', () => {
  return function InterventionListMock({ items }: { items: InterventionTypeTh[] }) {
    return <div data-testid="intervention-list">{items.length} items</div>;
  };
});

const t = (key: string) => key;

describe('LibraryListSection', () => {
  it('shows the empty state message when not loading and there are no items', () => {
    render(
      <LibraryListSection
        loading={false}
        items={[]}
        onClick={jest.fn()}
        t={t}
        translatedTitles={{}}
      />
    );
    expect(screen.getByText('No interventions match your filters.')).toBeInTheDocument();
    expect(screen.queryByTestId('intervention-list')).not.toBeInTheDocument();
  });

  it('renders the list instead of the empty state while loading', () => {
    render(
      <LibraryListSection
        loading={true}
        items={[]}
        onClick={jest.fn()}
        t={t}
        translatedTitles={{}}
      />
    );
    expect(screen.queryByText('No interventions match your filters.')).not.toBeInTheDocument();
    expect(screen.getByTestId('intervention-list')).toBeInTheDocument();
  });

  it('renders the list when there are items', () => {
    const items = [{ _id: '1' }, { _id: '2' }] as unknown as InterventionTypeTh[];
    render(
      <LibraryListSection
        loading={false}
        items={items}
        onClick={jest.fn()}
        t={t}
        translatedTitles={{}}
      />
    );
    expect(screen.getByTestId('intervention-list')).toHaveTextContent('2 items');
  });
});
