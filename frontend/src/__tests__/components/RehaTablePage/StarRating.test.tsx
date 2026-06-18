import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StarRating, { getRatingFromDateEntry } from '@/components/RehaTablePage/StarRating';

// ---------------------------------------------------------------------------
// getRatingFromDateEntry
// ---------------------------------------------------------------------------

const starAnswer = (key: number) => ({
  key: String(key),
  translations: [{ language: 'en', text: `${'★'.repeat(key)}${'☆'.repeat(5 - key)} (${key}/5)` }],
});

const nonStarAnswer = () => ({
  key: 'good',
  translations: [{ language: 'en', text: 'Good' }],
});

describe('getRatingFromDateEntry', () => {
  it('returns null for an empty feedback array', () => {
    expect(getRatingFromDateEntry({ feedback: [] })).toBeNull();
  });

  it('returns null when feedback has no star answer', () => {
    const dateEntry = {
      feedback: [{ answer: [nonStarAnswer()] }],
    };
    expect(getRatingFromDateEntry(dateEntry)).toBeNull();
  });

  it('returns the numeric rating when a star answer is present', () => {
    const dateEntry = {
      feedback: [{ answer: [starAnswer(3)] }],
    };
    expect(getRatingFromDateEntry(dateEntry)).toBe(3);
  });

  it('returns rating from the first matching answer regardless of position', () => {
    const dateEntry = {
      feedback: [{ answer: [nonStarAnswer(), starAnswer(4)] }],
    };
    expect(getRatingFromDateEntry(dateEntry)).toBe(4);
  });

  it('returns rating from the first matching feedback entry', () => {
    const dateEntry = {
      feedback: [{ answer: [nonStarAnswer()] }, { answer: [starAnswer(2)] }],
    };
    expect(getRatingFromDateEntry(dateEntry)).toBe(2);
  });

  it('returns null when key is out of 1-5 range', () => {
    const dateEntry = {
      feedback: [
        {
          answer: [
            {
              key: '6',
              translations: [{ language: 'en', text: '★★★★★★' }],
            },
          ],
        },
      ],
    };
    expect(getRatingFromDateEntry(dateEntry)).toBeNull();
  });

  it('handles missing feedback property gracefully', () => {
    expect(getRatingFromDateEntry({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StarRating component
// ---------------------------------------------------------------------------

describe('StarRating', () => {
  it('renders nothing for null value', () => {
    const { container } = render(<StarRating value={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for zero value', () => {
    const { container } = render(<StarRating value={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the correct aria-label', () => {
    render(<StarRating value={3} />);
    expect(screen.getByLabelText('3/5')).toBeInTheDocument();
  });

  it('shows numeric value when showNumber is true', () => {
    render(<StarRating value={4} showNumber />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders max stars as SVG elements', () => {
    const { container } = render(<StarRating value={2} max={5} />);
    expect(container.querySelectorAll('svg')).toHaveLength(5);
  });
});
