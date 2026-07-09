jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// SVG icon stubs
jest.mock('@/assets/icons/arrow-left-fill.svg?react', () => ({
  __esModule: true,
  default: function ArrowLeft(props: any) {
    return <svg data-testid="arrow-left" {...props} />;
  },
}));
jest.mock('@/assets/icons/arrow-right-fill.svg?react', () => ({
  __esModule: true,
  default: function ArrowRight(props: any) {
    return <svg data-testid="arrow-right" {...props} />;
  },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PatientInterventionPopUp from '@/components/PatientPage/PatientInterventionPopUp';
import '@testing-library/jest-dom';

jest.mock(
  'react-player',
  () =>
    function ReactPlayer(props: any) {
      return <div data-testid="video-player" {...props} />;
    }
);
jest.mock(
  'react-audio-player',
  () =>
    function ReactAudioPlayer(props: any) {
      return <div data-testid="audio-player" {...props} />;
    }
);
jest.mock(
  '@microlink/react',
  () =>
    function Microlink(props: any) {
      return <div data-testid="microlink-preview" {...props} />;
    }
);

jest.mock('@/utils/interventions', () => ({
  generateTagColors: () => ({}),
  getMediaTypeLabelFromUrl: jest.fn(),
  getTaxonomyTags: jest.fn(() => []),
  getBadgeVariantFromIntervention: jest.fn(() => 'primary'),
  getMediaTypeLabelFromIntervention: jest.fn(() => 'Unknown'),
  getTagColor: jest.fn(() => '#6f2dbd'),
}));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// identity by default so existing assertions on raw text keep working
jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({ translatedText: text, detectedSourceLanguage: 'unknown' })
  ),
}));

import { getMediaTypeLabelFromUrl } from '@/utils/interventions';
import { translateText } from '@/utils/translate';
import apiClient from '@/api/client';

const defaultItem = {
  title: 'Test Intervention',
  content_type: 'Exercise',
  description: 'This is a test intervention.',
  media_file: '',
  media_url: '',
  link: '',
  tags: ['mobility'],
  benefitFor: ['Flexibility'],
};

// Helper: build an item with an explicit media array (the structured format)
const itemWithMedia = (
  ...mediaEntries: Array<{ media_type: string; url: string; title: string }>
) => ({
  ...defaultItem,
  media: mediaEntries.map((m) => ({ kind: 'external', ...m })),
});

describe('PatientInterventionPopUp Component', () => {
  it('renders title, description, and tags correctly', () => {
    render(<PatientInterventionPopUp show={true} item={defaultItem} handleClose={jest.fn()} />);

    expect(screen.getByText('Test Intervention')).toBeInTheDocument();
    expect(screen.getByText('Exercise')).toBeInTheDocument();
    expect(screen.getByText('This is a test intervention.')).toBeInTheDocument();
    expect(screen.getByText('Flexibility')).toBeInTheDocument();
  });

  it('calls handleClose when the close button is clicked', () => {
    const handleClose = jest.fn();
    render(<PatientInterventionPopUp show={true} item={defaultItem} handleClose={handleClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders "No media available" if no media_file or link is provided', () => {
    render(<PatientInterventionPopUp show={true} item={defaultItem} handleClose={jest.fn()} />);
    expect(screen.getByText(/No media available/i)).toBeInTheDocument();
  });

  it('renders video player for Video type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Video');
    const item = {
      ...defaultItem,
      media_url: 'https://example.com/video.mp4',
      link: '',
      content_type: 'Video',
    };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('renders audio player for Audio type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Audio');
    const item = {
      ...defaultItem,
      media_url: 'https://example.com/audio.mp3',
      link: '',
      content_type: 'Audio',
    };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('renders PDF preview for PDF type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('PDF');
    const item = {
      ...defaultItem,
      media_url: 'https://example.com/file.pdf',
      media_file: 'https://example.com/file.pdf',
      content_type: 'PDF',
    };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

    const pdfFrame = screen.getByTitle('Test Intervention');
    expect(pdfFrame).toBeInTheDocument();
    expect(pdfFrame.tagName).toBe('IFRAME');
    expect(pdfFrame).toHaveAttribute('src', 'https://example.com/file.pdf');

    const openPdfLink = screen.getByRole('link', { name: 'Open PDF' });
    expect(openPdfLink).toBeInTheDocument();
    expect(openPdfLink).toHaveAttribute('href', 'https://example.com/file.pdf');
  });

  it('renders Microlink preview for Link type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Link');
    const item = { ...defaultItem, link: 'https://example.com', content_type: 'Link' };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('renders image for Image type', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Image');
    const item = {
      ...defaultItem,
      media_url: 'https://example.com/image.jpg',
      content_type: 'Image',
    };
    render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThan(0);
  });

  it('renders fallback link button for unknown media types', () => {
    (getMediaTypeLabelFromUrl as jest.Mock).mockReturnValue('Unknown');
    const fallbackItem = {
      ...defaultItem,
      media_url: 'https://example.com/unknown.xyz',
    };
    render(<PatientInterventionPopUp show={true} item={fallbackItem} handleClose={jest.fn()} />);

    const fallbackLink = screen.getByText(/Open link/i).closest('a');
    expect(fallbackLink).toBeInTheDocument();
    expect(fallbackLink).toHaveAttribute('href', 'https://example.com/unknown.xyz');
    expect(fallbackLink).toHaveClass('no-underline');
  });

  // ── Media carousel ────────────────────────────────────────────────────────

  describe('media carousel', () => {
    it('does not show carousel controls when there is only one media item', () => {
      const item = itemWithMedia({
        media_type: 'video',
        url: 'https://example.com/a.mp4',
        title: 'Only',
      });
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      expect(screen.queryByTestId('media-carousel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('media-prev')).not.toBeInTheDocument();
      expect(screen.queryByTestId('media-next')).not.toBeInTheDocument();
    });

    it('shows carousel with prev/next buttons and counter for multiple media items', () => {
      const item = itemWithMedia(
        { media_type: 'video', url: 'https://example.com/a.mp4', title: 'Video A' },
        { media_type: 'video', url: 'https://example.com/b.mp4', title: 'Video B' },
        { media_type: 'video', url: 'https://example.com/c.mp4', title: 'Video C' }
      );
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      expect(screen.getByTestId('media-carousel')).toBeInTheDocument();
      expect(screen.getByTestId('media-prev')).toBeInTheDocument();
      expect(screen.getByTestId('media-next')).toBeInTheDocument();
      // Counter shows "1 / 3" on first item
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('prev button is disabled on the first item and enabled on subsequent items', () => {
      const item = itemWithMedia(
        { media_type: 'video', url: 'https://example.com/a.mp4', title: 'A' },
        { media_type: 'video', url: 'https://example.com/b.mp4', title: 'B' }
      );
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      expect(screen.getByTestId('media-prev')).toBeDisabled();
      expect(screen.getByTestId('media-next')).not.toBeDisabled();
    });

    it('clicking next advances to the next media item', () => {
      const item = itemWithMedia(
        { media_type: 'video', url: 'https://example.com/a.mp4', title: 'Video A' },
        { media_type: 'video', url: 'https://example.com/b.mp4', title: 'Video B' }
      );
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      expect(screen.getByText('1 / 2')).toBeInTheDocument();
      expect(screen.getByText('Video A')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('media-next'));

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      expect(screen.getByText('Video B')).toBeInTheDocument();
      // next is now disabled, prev is enabled
      expect(screen.getByTestId('media-next')).toBeDisabled();
      expect(screen.getByTestId('media-prev')).not.toBeDisabled();
    });

    it('clicking prev goes back to the previous media item', () => {
      const item = itemWithMedia(
        { media_type: 'video', url: 'https://example.com/a.mp4', title: 'Video A' },
        { media_type: 'video', url: 'https://example.com/b.mp4', title: 'Video B' }
      );
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      fireEvent.click(screen.getByTestId('media-next'));
      expect(screen.getByText('2 / 2')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('media-prev'));
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
      expect(screen.getByText('Video A')).toBeInTheDocument();
    });

    it('renders dot indicators for 7 or fewer media items', () => {
      const item = itemWithMedia(
        { media_type: 'video', url: 'https://example.com/a.mp4', title: 'A' },
        { media_type: 'video', url: 'https://example.com/b.mp4', title: 'B' },
        { media_type: 'video', url: 'https://example.com/c.mp4', title: 'C' }
      );
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      expect(screen.getByTestId('media-dot-0')).toBeInTheDocument();
      expect(screen.getByTestId('media-dot-1')).toBeInTheDocument();
      expect(screen.getByTestId('media-dot-2')).toBeInTheDocument();
    });

    it('clicking a dot jumps directly to that media item', () => {
      const item = itemWithMedia(
        { media_type: 'video', url: 'https://example.com/a.mp4', title: 'Video A' },
        { media_type: 'video', url: 'https://example.com/b.mp4', title: 'Video B' },
        { media_type: 'video', url: 'https://example.com/c.mp4', title: 'Video C' }
      );
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      fireEvent.click(screen.getByTestId('media-dot-2'));

      expect(screen.getByText('3 / 3')).toBeInTheDocument();
      expect(screen.getByText('Video C')).toBeInTheDocument();
    });

    it('does not render dots when there are more than 7 media items', () => {
      const entries = Array.from({ length: 8 }, (_, i) => ({
        media_type: 'video',
        url: `https://example.com/${i}.mp4`,
        title: `Video ${i + 1}`,
      }));
      const item = itemWithMedia(...entries);
      render(<PatientInterventionPopUp show={true} item={item} handleClose={jest.fn()} />);

      expect(screen.queryByTestId('media-dot-0')).not.toBeInTheDocument();
      // Counter still visible
      expect(screen.getByText('1 / 8')).toBeInTheDocument();
    });
  });

  // ── Language options ──────────────────────────────────────────────────────

  describe('language options', () => {
    const langItem = {
      ...defaultItem,
      language: 'de',
      external_id: 'ext-123',
      available_languages: ['de', 'en', 'fr'],
    };

    beforeEach(() => {
      (apiClient.get as jest.Mock).mockReset();
    });

    it('renders a language button for each entry in available_languages', () => {
      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'DE' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'FR' })).toBeInTheDocument();
    });

    it('does not duplicate the current language when it also appears in available_languages', () => {
      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);
      expect(screen.getAllByRole('button', { name: 'DE' })).toHaveLength(1);
    });

    it('marks the current language button as active via aria-pressed', () => {
      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'DE' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('sorts preferred language (en in test env) first, then de, then remaining alphabetically', () => {
      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);
      const allButtons = screen.getAllByRole('button');
      const langBtns = allButtons.filter((b) => /^[A-Z]{2}$/.test((b.textContent ?? '').trim()));
      expect(langBtns[0]).toHaveTextContent('EN');
      expect(langBtns[1]).toHaveTextContent('DE');
      expect(langBtns[2]).toHaveTextContent('FR');
    });

    it('does not render language buttons when the item has only one language', () => {
      const singleLangItem = { ...defaultItem, language: 'de' };
      render(
        <PatientInterventionPopUp show={true} item={singleLangItem} handleClose={jest.fn()} />
      );
      expect(screen.queryByRole('button', { name: 'DE' })).not.toBeInTheDocument();
    });

    it('calls apiClient.get with the correct path and params when switching language', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: [{ ...langItem, language: 'en', title: 'Test EN' }],
      });
      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'EN' }));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('interventions/all/', {
          params: { external_id: 'ext-123', lang: 'en' },
        });
      });
    });

    it('updates the displayed title after a successful language switch', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: [{ ...langItem, language: 'en', title: 'English Title' }],
      });
      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'EN' }));

      await waitFor(() => {
        expect(screen.getByText('English Title')).toBeInTheDocument();
      });
    });

    it('shows a manually picked variant as-is instead of re-translating it to the app language', async () => {
      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: `[translated] ${text}`, detectedSourceLanguage: 'de' })
      );
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: [
          {
            ...langItem,
            language: 'en',
            title: 'English Title',
            description: 'English description',
          },
        ],
      });

      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);

      // initial variant is translated to the app language (default behavior)
      await waitFor(() =>
        expect(screen.getByText('[translated] Test Intervention')).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole('button', { name: 'EN' }));

      // the picked variant is shown verbatim, not re-translated back
      await waitFor(() => expect(screen.getByText('English Title')).toBeInTheDocument());
      expect(screen.getByText('English description')).toBeInTheDocument();
      expect(screen.queryByText(/\[translated\] English Title/)).not.toBeInTheDocument();

      expect(
        (translateText as jest.Mock).mock.calls.some(([text]: [string]) => text === 'English Title')
      ).toBe(false);

      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: text, detectedSourceLanguage: 'unknown' })
      );
    });

    it('ignores a stale switch response when a newer switch was triggered first', async () => {
      let resolveEn: (v: unknown) => void = () => {};
      let resolveFr: (v: unknown) => void = () => {};
      const enPromise = new Promise((res) => {
        resolveEn = res;
      });
      const frPromise = new Promise((res) => {
        resolveFr = res;
      });

      (apiClient.get as jest.Mock).mockImplementation(
        (url: string, config: { params?: { lang?: string } }) => {
          if (config?.params?.lang === 'en') return enPromise;
          if (config?.params?.lang === 'fr') return frPromise;
          return Promise.resolve({ data: [] });
        }
      );

      render(<PatientInterventionPopUp show={true} item={langItem} handleClose={jest.fn()} />);

      // click EN, then FR before EN's (slower) request resolves
      fireEvent.click(screen.getByRole('button', { name: 'EN' }));
      fireEvent.click(screen.getByRole('button', { name: 'FR' }));

      // FR (the newer click) resolves first
      resolveFr({ data: [{ ...langItem, language: 'fr', title: 'Titre français' }] });
      await waitFor(() => expect(screen.getByText('Titre français')).toBeInTheDocument());

      // EN (the stale, older click) resolves after — it must not overwrite FR
      resolveEn({ data: [{ ...langItem, language: 'en', title: 'English Title' }] });
      await new Promise((r) => setTimeout(r, 50));

      expect(screen.getByText('Titre français')).toBeInTheDocument();
      expect(screen.queryByText('English Title')).not.toBeInTheDocument();
    });
  });
});
