import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HelpCenter from '@/components/help/HelpCenter';
import authStore from '@/stores/authStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { userType: '' },
}));

const manifest = {
  version: 1,
  extensions: ['png'],
  languages: ['en', 'de'],
  assets: { en: { basePath: 'en' }, de: { basePath: 'de' } },
  keys: [
    'Instructions.common.Overview.Info',
    'Instructions.therapist.Dashboard.Add',
    'Instructions.patient.Home.Info',
  ],
};

const mockFetchOk = (body: any = manifest) => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });
};

describe('HelpCenter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn();
    (authStore as any).userType = '';
  });

  // ------------------------------------------------------------------
  // Visibility / basic states
  // ------------------------------------------------------------------
  describe('open/close and loading', () => {
    it('renders nothing when open=false', () => {
      render(<HelpCenter open={false} onClose={jest.fn()} />);
      expect(screen.queryByText('Help')).not.toBeInTheDocument();
    });

    it('shows a loading state while the manifest is fetching', () => {
      (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('shows an error message when the manifest fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      expect(await screen.findByText('Manifest fetch failed: 500')).toBeInTheDocument();
    });

    it('shows an error message for an unsupported manifest version', async () => {
      mockFetchOk({ ...manifest, version: 2 });
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      expect(
        await screen.findByText('Unsupported help manifest format (expected version 1).')
      ).toBeInTheDocument();
    });

    it('calls onClose when the close button is clicked', async () => {
      mockFetchOk();
      const onClose = jest.fn();
      render(<HelpCenter open={true} onClose={onClose} />);
      await screen.findByText(/Help —/);
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Loaded content
  // ------------------------------------------------------------------
  describe('loaded content', () => {
    it('defaults to the Common group and shows its first key', async () => {
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      expect(await screen.findByText(/Help — Common • Overview • Info/)).toBeInTheDocument();
    });

    it('shows a Loading state indefinitely when no keys are allowed', async () => {
      mockFetchOk({ ...manifest, keys: [] });
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides the Therapist tab for a non-therapist viewer', async () => {
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);
      expect(screen.queryByRole('button', { name: 'Therapist' })).not.toBeInTheDocument();
    });

    it('shows the Therapist tab for a therapist viewer', async () => {
      (authStore as any).userType = 'Therapist';
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);
      expect(screen.getByRole('button', { name: 'Therapist' })).toBeInTheDocument();
    });

    it('falls back to localStorage userType when authStore has none', async () => {
      localStorage.setItem('userType', 'Therapist');
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);
      expect(screen.getByRole('button', { name: 'Therapist' })).toBeInTheDocument();
    });

    it('renders the image for the active key', async () => {
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);
      const img = screen.getByAltText('Instructions.common.Overview.Info') as HTMLImageElement;
      expect(img.src).toContain('/help/en/Instructions.common.Overview.Info.png');
    });

    it('cycles to the next image candidate on load error', async () => {
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);
      const img = screen.getByAltText('Instructions.common.Overview.Info') as HTMLImageElement;
      const firstSrc = img.src;
      fireEvent.error(img);
      await waitFor(() => expect(img.src).not.toBe(firstSrc));
    });

    it('shows a Download Image link for the current image', async () => {
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);
      expect(screen.getByRole('link', { name: 'Download Image' })).toBeInTheDocument();
    });

    it('switches to the Patient group and shows its content', async () => {
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);

      fireEvent.click(screen.getByRole('button', { name: 'Patient' }));
      expect(await screen.findByText(/Help — Patient • Home • Info/)).toBeInTheDocument();
    });

    it('switches to the Therapist group (as a therapist) and shows its subgroup tabs', async () => {
      (authStore as any).userType = 'Therapist';
      mockFetchOk();
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);

      fireEvent.click(screen.getByRole('button', { name: 'Therapist' }));
      expect(await screen.findByText(/Help — Therapist • Dashboard • Add/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    });

    it('selects a specific key within the current subgroup', async () => {
      const bigManifest = {
        ...manifest,
        keys: [...manifest.keys, 'Instructions.patient.Home.Add'],
      };
      mockFetchOk(bigManifest);
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);

      fireEvent.click(screen.getByRole('button', { name: 'Patient' }));
      expect(await screen.findByText(/Help — Patient • Home • Info/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(await screen.findByText(/Help — Patient • Home • Add/)).toBeInTheDocument();
    });

    it('switches subgroups directly within the Patient group', async () => {
      const bigManifest = {
        ...manifest,
        keys: [...manifest.keys, 'Instructions.patient.Exercises.Info'],
      };
      mockFetchOk(bigManifest);
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);

      fireEvent.click(screen.getByRole('button', { name: 'Patient' }));
      await screen.findByText(/Help — Patient • Home • Info/);

      fireEvent.click(screen.getByRole('button', { name: 'Exercises' }));
      expect(await screen.findByText(/Help — Patient • Exercises • Info/)).toBeInTheDocument();
    });

    it('falls back to the Loading state when switching to a group with no allowed items', async () => {
      (authStore as any).userType = 'Therapist';
      const noTherapistItems = {
        ...manifest,
        keys: manifest.keys.filter((k) => !k.includes('.therapist.')),
      };
      mockFetchOk(noTherapistItems);
      render(<HelpCenter open={true} onClose={jest.fn()} />);
      await screen.findByText(/Help —/);

      fireEvent.click(screen.getByRole('button', { name: 'Therapist' }));
      await waitFor(() => expect(screen.getByText('Loading...')).toBeInTheDocument());
    });

    it('honors defaultKey when it is allowed and present', async () => {
      mockFetchOk();
      render(
        <HelpCenter open={true} onClose={jest.fn()} defaultKey="Instructions.patient.Home.Info" />
      );
      expect(await screen.findByText(/Help — Patient • Home • Info/)).toBeInTheDocument();
    });

    it('ignores a defaultKey for the therapist group when viewer is not a therapist', async () => {
      mockFetchOk();
      render(
        <HelpCenter
          open={true}
          onClose={jest.fn()}
          defaultKey="Instructions.therapist.Dashboard.Add"
        />
      );
      // Falls back to the first allowed key (Common) instead of the disallowed therapist key.
      expect(await screen.findByText(/Help — Common • Overview • Info/)).toBeInTheDocument();
    });
  });
});
