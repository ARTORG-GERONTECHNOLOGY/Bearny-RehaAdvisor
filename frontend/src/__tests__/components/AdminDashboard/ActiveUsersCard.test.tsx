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
  registered: { total: 180, by_role: { Patient: 172, Therapist: 6, Admin: 2 }, inactive: 4 },
  ...overrides,
});

const mockActive = (data: ActiveUsers) => (apiClient.get as jest.Mock).mockResolvedValue({ data });

const countFor = (label: string, scope = screen.getByTestId('active-counts')) =>
  within(scope).getByText(label).previousElementSibling?.textContent;

describe('ActiveUsersCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches on mount and shows the total and per-role counts', async () => {
    mockActive(active());
    render(<ActiveUsersCard />);

    expect(await screen.findByTestId('active-counts')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/analytics/active-users/');
    expect(countFor('Total')).toBe('7');
    expect(countFor('Patients')).toBe('5');
    expect(countFor('Therapists')).toBe('2');
    expect(countFor('Admins')).toBe('0');
  });

  it('renders nothing until the first response arrives', async () => {
    (apiClient.get as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<ActiveUsersCard />);
    expect(screen.queryByTestId('active-users')).not.toBeInTheDocument();
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
    await screen.findByTestId('active-counts');
    expect(countFor('Therapists')).toBe('0');
  });

  it('refetches when Refresh is clicked', async () => {
    mockActive(active());
    render(<ActiveUsersCard />);
    await screen.findByTestId('active-counts');

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

  it('shows registered accounts per role and the inactive count', async () => {
    mockActive(active());
    render(<ActiveUsersCard />);

    const registered = await screen.findByTestId('registered-accounts');
    expect(within(registered).getByText('Registered accounts')).toBeInTheDocument();
    expect(countFor('Total', registered)).toBe('180');
    expect(countFor('Patients', registered)).toBe('172');
    expect(countFor('Therapists', registered)).toBe('6');
    expect(countFor('Admins', registered)).toBe('2');
    expect(within(registered).getByTestId('inactive-accounts')).toHaveTextContent(
      '4 inactive accounts (awaiting approval or deactivated)'
    );
    expect(countFor('Total', screen.getByTestId('active-counts'))).toBe('7');
  });

  it('uses the singular for one inactive account', async () => {
    mockActive(active({ registered: { total: 1, by_role: { Admin: 1 }, inactive: 1 } }));
    render(<ActiveUsersCard />);
    expect(await screen.findByTestId('inactive-accounts')).toHaveTextContent(
      '1 inactive account (awaiting approval or deactivated)'
    );
  });

  it('hides registered accounts when the response has none', async () => {
    mockActive(active({ registered: undefined }));
    render(<ActiveUsersCard />);
    await screen.findByTestId('active-counts');
    expect(screen.queryByTestId('registered-accounts')).not.toBeInTheDocument();
  });

  it('hides registered accounts when a refresh fails', async () => {
    mockActive(active());
    render(<ActiveUsersCard />);
    await screen.findByTestId('registered-accounts');

    (apiClient.get as jest.Mock).mockRejectedValue(new Error('network'));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await screen.findByText('Failed to load active users.');
    expect(screen.queryByTestId('registered-accounts')).not.toBeInTheDocument();
  });
});
