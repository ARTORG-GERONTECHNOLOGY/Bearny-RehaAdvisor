import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import ActiveUsersCard, { type ActiveUsers } from '@/components/AdminDashboard/ActiveUsersCard';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
import apiClient from '@/api/client';

const active = (overrides: Partial<ActiveUsers> = {}): ActiveUsers => ({
  as_of: '2026-10-02T10:42:00Z',
  window_minutes: 15,
  total: 7,
  by_role: { Patient: 5, Therapist: 2, Admin: 0 },
  ...overrides,
});

const mockActive = (data: ActiveUsers) => (apiClient.get as jest.Mock).mockResolvedValue({ data });

const countFor = (label: string) => screen.getByText(label).previousElementSibling?.textContent;

describe('ActiveUsersCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches on mount and shows the total and per-role counts', async () => {
    mockActive(active());
    render(<ActiveUsersCard />);

    expect(await screen.findByText('Total')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/analytics/active-users/');
    expect(countFor('Total')).toBe('7');
    expect(countFor('Patients')).toBe('5');
    expect(countFor('Therapists')).toBe('2');
    expect(countFor('Admins')).toBe('0');
  });

  it('shows when the count was taken and what it counts', async () => {
    mockActive(active());
    render(<ActiveUsersCard />);

    const card = await screen.findByTestId('active-users');
    expect(await within(card).findByText(/^As of /)).toBeInTheDocument();
    expect(
      within(card).getByText(
        'Counts only users who did something that is logged, such as opening a patient or completing an exercise.'
      )
    ).toBeInTheDocument();
  });

  it('takes the window length in the heading from the response', async () => {
    mockActive(active({ window_minutes: 30 }));
    render(<ActiveUsersCard />);
    expect(await screen.findByText('Active in the last 30 min')).toBeInTheDocument();
  });

  it('treats a missing role as zero', async () => {
    mockActive(active({ total: 1, by_role: { Patient: 1 } }));
    render(<ActiveUsersCard />);
    await screen.findByText('Total');
    expect(countFor('Therapists')).toBe('0');
  });

  it('refetches when Refresh is clicked', async () => {
    mockActive(active());
    render(<ActiveUsersCard />);
    await screen.findByText('Total');

    mockActive(active({ total: 9, by_role: { Patient: 9, Therapist: 0, Admin: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(countFor('Total')).toBe('9'));
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('shows an error when loading fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('network'));
    render(<ActiveUsersCard />);
    expect(await screen.findByText('Failed to load active users.')).toBeInTheDocument();
  });

  it('can retry with Refresh after loading fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('network'));
    render(<ActiveUsersCard />);
    await screen.findByText('Failed to load active users.');

    mockActive(active());
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(countFor('Total')).toBe('7'));
    expect(screen.queryByText('Failed to load active users.')).not.toBeInTheDocument();
  });
});
