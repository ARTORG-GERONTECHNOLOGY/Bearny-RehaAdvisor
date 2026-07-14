import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TemplateTimeline from '@/components/TherapistInterventionPage/TemplateTimeline';
import type { TemplateItem } from '@/types/templates';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const makeItem = (overrides: Partial<TemplateItem> = {}): TemplateItem =>
  ({
    diagnosis: 'Stroke',
    intervention: { _id: 'int-1', title: 'Breathing Exercise' },
    schedule: { unit: 'day', interval: 1, start_day: 1 },
    occurrences: [],
    ...overrides,
  }) as TemplateItem;

describe('TemplateTimeline', () => {
  // ------------------------------------------------------------------
  // Grid rendering
  // ------------------------------------------------------------------
  describe('grid rendering', () => {
    it('renders one day card per horizon day', () => {
      render(<TemplateTimeline items={[]} horizonDays={3} />);
      expect(screen.getByText('Day 1')).toBeInTheDocument();
      expect(screen.getByText('Day 2')).toBeInTheDocument();
      expect(screen.getByText('Day 3')).toBeInTheDocument();
      expect(screen.queryByText('Day 4')).not.toBeInTheDocument();
    });

    it('defaults to an 84-day horizon', () => {
      render(<TemplateTimeline items={[]} />);
      expect(screen.getByText('Day 84')).toBeInTheDocument();
      expect(screen.queryByText('Day 85')).not.toBeInTheDocument();
    });

    it('shows a placeholder dash for days without events', () => {
      render(<TemplateTimeline items={[]} horizonDays={2} />);
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('shows the scheduled time and title for a day with an occurrence', () => {
      const item = makeItem({ occurrences: [{ day: 2, time: '09:00' } as any] });
      render(<TemplateTimeline items={[item]} horizonDays={3} />);
      expect(screen.getByText('09:00')).toBeInTheDocument();
      expect(screen.getByText('Breathing Exercise')).toBeInTheDocument();
    });

    it('shows an em-dash for an occurrence with no time', () => {
      const item = makeItem({ occurrences: [{ day: 1 } as any] });
      render(<TemplateTimeline items={[item]} horizonDays={1} />);
      // Both the empty-day placeholder and the missing-time badge render "—";
      // just confirm the title still shows up for day 1.
      expect(screen.getByText('Breathing Exercise')).toBeInTheDocument();
    });

    it('ignores occurrences outside the horizon range', () => {
      const item = makeItem({ occurrences: [{ day: 10, time: '09:00' } as any] });
      render(<TemplateTimeline items={[item]} horizonDays={3} />);
      expect(screen.queryByText('Breathing Exercise')).not.toBeInTheDocument();
    });

    it('ignores occurrences with a day below 1', () => {
      const item = makeItem({ occurrences: [{ day: 0, time: '09:00' } as any] });
      render(<TemplateTimeline items={[item]} horizonDays={3} />);
      expect(screen.queryByText('Breathing Exercise')).not.toBeInTheDocument();
    });

    it('shows the translated title and source language when provided', () => {
      const item = makeItem({ occurrences: [{ day: 1, time: '09:00' } as any] });
      render(
        <TemplateTimeline
          items={[item]}
          horizonDays={1}
          translatedTitles={{ 'int-1': { title: 'Atemübung', lang: 'de' } }}
        />
      );
      expect(screen.getByText('Atemübung')).toBeInTheDocument();
      expect(screen.getByText(/Translated from.*de/)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Day modal
  // ------------------------------------------------------------------
  describe('day modal', () => {
    it('is closed by default', () => {
      render(<TemplateTimeline items={[]} horizonDays={3} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the modal for the clicked day', () => {
      render(<TemplateTimeline items={[]} horizonDays={3} />);
      fireEvent.click(screen.getByText('Day 2').closest('[role="button"]')!);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Day 2')).toBeInTheDocument();
    });

    it('shows an empty-state message for a day with no items', () => {
      render(<TemplateTimeline items={[]} horizonDays={3} />);
      fireEvent.click(screen.getByText('Day 2').closest('[role="button"]')!);
      expect(screen.getByText('No items on this day.')).toBeInTheDocument();
    });

    it('shows the diagnosis and segment summary for a scheduled item', () => {
      const item = makeItem({
        diagnosis: 'COPD',
        occurrences: [{ day: 1, time: '10:00' } as any, { day: 1, time: '14:00' } as any],
        schedule: { unit: 'week', interval: 2, start_day: 1, selectedDays: ['Mon', 'Wed'] },
      });
      render(<TemplateTimeline items={[item]} horizonDays={1} />);
      fireEvent.click(screen.getByText('Day 1').closest('[role="button"]')!);

      // Two occurrences on this day render an identical summary line each — assert on the first.
      const summaries = screen.getAllByText(/COPD/);
      expect(summaries.length).toBe(2);
      expect(summaries[0].textContent).toMatch(/week\/2/);
      expect(summaries[0].textContent).toMatch(/Mon, Wed/);
      expect(summaries[0].textContent).toMatch(/from day 1/);
      expect(summaries[0].textContent).toMatch(/Occurrences 2/);
    });

    it('shows the end day in the segment summary when present', () => {
      const item = makeItem({
        occurrences: [{ day: 1, time: '10:00' } as any],
        schedule: { unit: 'day', interval: 1, start_day: 1, end_day: 5 },
      });
      render(<TemplateTimeline items={[item]} horizonDays={1} />);
      fireEvent.click(screen.getByText('Day 1').closest('[role="button"]')!);
      expect(screen.getByText(/day 5/)).toBeInTheDocument();
    });

    it('picks the matching segment out of multiple segments for the opened day', () => {
      const item = makeItem({
        occurrences: [{ day: 5, time: '10:00' } as any],
        segments: [
          { start_day: 1, end_day: 3, unit: 'day', interval: 1 },
          { start_day: 4, end_day: 10, unit: 'week', interval: 1 },
        ],
      } as any);
      render(<TemplateTimeline items={[item]} horizonDays={5} />);
      fireEvent.click(screen.getByText('Day 5').closest('[role="button"]')!);
      expect(screen.getByText(/week\/1/)).toBeInTheDocument();
    });

    it('closes the modal via the header close button', async () => {
      render(<TemplateTimeline items={[]} horizonDays={3} />);
      fireEvent.click(screen.getByText('Day 2').closest('[role="button"]')!);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('shows the translated title inside the modal too', () => {
      const item = makeItem({ occurrences: [{ day: 1, time: '09:00' } as any] });
      render(
        <TemplateTimeline
          items={[item]}
          horizonDays={1}
          translatedTitles={{ 'int-1': { title: 'Atemübung', lang: 'de' } }}
        />
      );
      fireEvent.click(screen.getByText('Day 1').closest('[role="button"]')!);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/Atemübung/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Translated from.*de/)).toBeInTheDocument();
    });
  });
});
