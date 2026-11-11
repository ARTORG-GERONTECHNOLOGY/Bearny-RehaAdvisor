import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import DeviceAnalyticsCard, {
  type DeviceAnalytics,
} from '@/components/AdminDashboard/DeviceAnalyticsCard';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
import apiClient from '@/api/client';

const analytics: DeviceAnalytics = {
  by_device: { Mobile: 5, Desktop: 2, Tablet: 0, Unknown: 0 },
  by_role: { Therapist: { Mobile: 3, Desktop: 1, Tablet: 0 } },
};

describe('DeviceAnalyticsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches on mount and shows device counts and the per-role table', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: analytics });
    render(<DeviceAnalyticsCard />);

    expect(await screen.findByText('Login device types')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/analytics/devices/');
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Mobile', { selector: 'div' })).toBeInTheDocument();
    expect(screen.queryByText('Tablet', { selector: 'div' })).not.toBeInTheDocument();
    expect(screen.getByText('Therapist')).toBeInTheDocument();
  });

  it('hides the per-role table when there are no roles', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { ...analytics, by_role: {} } });
    render(<DeviceAnalyticsCard />);

    expect(await screen.findByText('Login device types')).toBeInTheDocument();
    expect(screen.queryByText('By user role')).not.toBeInTheDocument();
  });

  it('shows a spinner and no Refresh button while loading', () => {
    (apiClient.get as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<DeviceAnalyticsCard />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.queryByText('Login device types')).not.toBeInTheDocument();
  });

  it('shows an error after a failed load and retries via Refresh', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    render(<DeviceAnalyticsCard />);

    expect(await screen.findByText('Failed to load analytics.')).toBeInTheDocument();

    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: analytics });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Login device types')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load analytics.')).not.toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});
