import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import DownloadsPage from '@/pages/HealthSliderDownloadsPage';
import apiClient from '@/api/client';

jest.mock('axios');
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

/**
 * Form.Group in this page has no controlId, so labels aren't associated to
 * their inputs via "for"/"id" — query by placeholder/type instead of label text.
 */
const getEmailInput = () => screen.getByPlaceholderText(/researcher@example.com/i);
const getPasswordInput = (container: HTMLElement) =>
  container.querySelector('input[type="password"]') as HTMLInputElement;
const getCodeInput = (container: HTMLElement) =>
  container.querySelector('input[maxlength="6"]') as HTMLInputElement;

describe('HealthSliderDownloadsPage', () => {
  const originalAlert = window.alert;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.alert = jest.fn() as any;

    if (!URL.createObjectURL) {
      URL.createObjectURL = jest.fn();
    }
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  });

  afterEach(() => {
    window.alert = originalAlert;
  });

  // ------------------------------------------------------------------
  // Auth gate — password step
  // ------------------------------------------------------------------
  describe('auth gate — password step', () => {
    it('renders the password/email form when no token is stored', () => {
      const { container } = render(<DownloadsPage />);
      expect(screen.getByText(/ICF Monitor — Secure Access/i)).toBeInTheDocument();
      expect(getEmailInput()).toBeInTheDocument();
      expect(getPasswordInput(container)).toBeInTheDocument();
    });

    it('submits password and email and advances to the code step on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({});

      const { container } = render(<DownloadsPage />);
      fireEvent.change(getEmailInput(), { target: { value: 'researcher@example.com' } });
      fireEvent.change(getPasswordInput(container), { target: { value: 'secret' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith('/api/healthslider/auth/', {
          password: 'secret',
          email: 'researcher@example.com',
        });
      });

      expect(await screen.findByText(/Verification code/i)).toBeInTheDocument();
    });

    it('shows an error message when password submission fails', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Wrong password' } },
      });

      render(<DownloadsPage />);
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      expect(await screen.findByText('Wrong password')).toBeInTheDocument();
    });

    it('submits the password form when Enter is pressed in the password field', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({});

      const { container } = render(<DownloadsPage />);
      fireEvent.keyDown(getPasswordInput(container), { key: 'Enter' });

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          '/api/healthslider/auth/',
          expect.objectContaining({})
        );
      });
    });
  });

  // ------------------------------------------------------------------
  // Auth gate — code step
  // ------------------------------------------------------------------
  describe('auth gate — code step', () => {
    const advanceToCodeStep = async (container: HTMLElement) => {
      (axios.post as jest.Mock).mockResolvedValueOnce({});
      fireEvent.change(getEmailInput(), { target: { value: 'researcher@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));
      await screen.findByText(/Verification code/i);
    };

    it('shows the email the code was sent to', async () => {
      const { container } = render(<DownloadsPage />);
      await advanceToCodeStep(container);
      expect(screen.getByText('researcher@example.com')).toBeInTheDocument();
    });

    it('verifies the code and stores the returned token', async () => {
      const { container } = render(<DownloadsPage />);
      await advanceToCodeStep(container);
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { token: 'signed-token' } });

      fireEvent.change(getCodeInput(container), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /Verify/i }));

      await waitFor(() => {
        expect(sessionStorage.getItem('healthslider_token')).toBe('signed-token');
      });
      expect(await screen.findByText(/Admin Dashboard/i)).toBeInTheDocument();
    });

    it('shows an error message when code verification fails', async () => {
      const { container } = render(<DownloadsPage />);
      await advanceToCodeStep(container);
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Invalid code' } },
      });

      fireEvent.click(screen.getByRole('button', { name: /Verify/i }));

      expect(await screen.findByText('Invalid code')).toBeInTheDocument();
    });

    it('goes back to the password step when Back is clicked', async () => {
      const { container } = render(<DownloadsPage />);
      await advanceToCodeStep(container);
      fireEvent.click(screen.getByRole('button', { name: /Back/i }));
      expect(getPasswordInput(container)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Authenticated dashboard
  // ------------------------------------------------------------------
  describe('authenticated dashboard', () => {
    beforeEach(() => {
      sessionStorage.setItem('healthslider_token', 'existing-token');
    });

    it('renders the dashboard when a token already exists in sessionStorage', () => {
      render(<DownloadsPage />);
      expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/e.g. P01/i)).toBeInTheDocument();
    });

    it('shows the empty-state message before any search', () => {
      render(<DownloadsPage />);
      expect(
        screen.getByText(/Enter a Patient ID and click Search to display results/i)
      ).toBeInTheDocument();
    });

    it('alerts when searching with an empty Patient ID', () => {
      render(<DownloadsPage />);
      fireEvent.click(screen.getByRole('button', { name: /Search/i }));
      expect(window.alert).toHaveBeenCalledWith('Please enter a Patient ID');
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('fetches and displays items for a given Patient ID', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'q1',
              questionIndex: 0,
              questionText: 'How do you feel?',
              answerValue: 3,
              answeredAt: '2026-01-01T10:00:00Z',
              hasAudio: true,
              audioSize: 2048,
              deviceType: 'mobile',
              assistance: 'alone',
            },
          ],
        },
      });

      render(<DownloadsPage />);
      fireEvent.change(screen.getByPlaceholderText(/e.g. P01/i), { target: { value: 'P01' } });
      fireEvent.click(screen.getByRole('button', { name: /Search/i }));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/healthslider/items/',
          expect.objectContaining({
            params: { participantId: 'P01' },
            headers: { 'X-Healthslider-Token': 'existing-token' },
          })
        );
      });

      expect(await screen.findByText('How do you feel?')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Alone')).toBeInTheDocument();
    });

    it('shows N/A for an answerValue of -1', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'q1',
              questionIndex: 0,
              questionText: 'Q',
              answerValue: -1,
              hasAudio: false,
            },
          ],
        },
      });

      render(<DownloadsPage />);
      fireEvent.change(screen.getByPlaceholderText(/e.g. P01/i), { target: { value: 'P01' } });
      fireEvent.click(screen.getByRole('button', { name: /Search/i }));

      expect(await screen.findByText('N/A')).toBeInTheDocument();
      expect(screen.getByText('No recording available')).toBeInTheDocument();
    });

    it('alerts on a fetch error', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('network'));

      render(<DownloadsPage />);
      fireEvent.change(screen.getByPlaceholderText(/e.g. P01/i), { target: { value: 'P01' } });
      fireEvent.click(screen.getByRole('button', { name: /Search/i }));

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Error fetching data');
      });
    });

    it('loads audio on demand and renders a player', async () => {
      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                id: 'q1',
                questionIndex: 0,
                questionText: 'Q',
                answerValue: 1,
                hasAudio: true,
                audioSize: 1024,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: new ArrayBuffer(8),
          headers: { 'content-type': 'audio/webm' },
        });

      render(<DownloadsPage />);
      fireEvent.change(screen.getByPlaceholderText(/e.g. P01/i), { target: { value: 'P01' } });
      fireEvent.click(screen.getByRole('button', { name: /Search/i }));

      const loadBtn = await screen.findByRole('button', { name: /Load Recording/i });
      fireEvent.click(loadBtn);

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/healthslider/audio/q1/',
          expect.objectContaining({ responseType: 'arraybuffer' })
        );
      });

      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('alerts when audio playback fails to load', async () => {
      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            items: [
              { id: 'q1', questionIndex: 0, questionText: 'Q', answerValue: 1, hasAudio: true },
            ],
          },
        })
        .mockRejectedValueOnce(new Error('boom'));

      render(<DownloadsPage />);
      fireEvent.change(screen.getByPlaceholderText(/e.g. P01/i), { target: { value: 'P01' } });
      fireEvent.click(screen.getByRole('button', { name: /Search/i }));

      const loadBtn = await screen.findByRole('button', { name: /Load Recording/i });
      fireEvent.click(loadBtn);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Playback failed to load.');
      });
    });

    it('logs out and returns to the password gate', () => {
      const { container } = render(<DownloadsPage />);
      fireEvent.click(screen.getByRole('button', { name: /Logout/i }));

      expect(sessionStorage.getItem('healthslider_token')).toBeNull();
      expect(getPasswordInput(container)).toBeInTheDocument();
    });

    it('disables the download button until items are loaded', () => {
      render(<DownloadsPage />);
      expect(screen.getByRole('button', { name: /Download All/i })).toBeDisabled();
    });

    it('builds and triggers a ZIP download once items are loaded', async () => {
      const clickSpy = jest.fn();
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                id: 'q1',
                questionIndex: 0,
                questionText: 'Q',
                answerValue: 2,
                hasAudio: true,
                audioSize: 1024,
                audioName: 'q1.webm',
              },
            ],
          },
        })
        .mockResolvedValueOnce({ data: new ArrayBuffer(8) });

      render(<DownloadsPage />);
      fireEvent.change(screen.getByPlaceholderText(/e.g. P01/i), { target: { value: 'P01' } });
      fireEvent.click(screen.getByRole('button', { name: /Search/i }));

      const downloadBtn = await screen.findByRole('button', { name: /Download All/i });
      await waitFor(() => expect(downloadBtn).not.toBeDisabled());
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(clickSpy).toHaveBeenCalled();
      });

      (document.createElement as jest.Mock).mockRestore?.();
    });
  });
});
