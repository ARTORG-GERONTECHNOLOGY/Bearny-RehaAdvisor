import { renderHook, act } from '@testing-library/react';
import { useInterventionsLibrary } from '@/hooks/useInterventionsLibrary';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => ({
  get: jest.fn(),
}));

const mockGet = apiClient.get as jest.Mock;

const makeItem = (id: string, is_private = false) => ({
  _id: id,
  title: `Item ${id}`,
  description: '',
  content_type: 'video',
  tags: [],
  benefitFor: [],
  patient_types: [],
  is_private,
});

describe('useInterventionsLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with empty items, not loading, no error', () => {
    mockGet.mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useInterventionsLibrary());

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('sets loading to true during fetch then false after', async () => {
    let resolve: (v: any) => void;
    mockGet.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useInterventionsLibrary());

    act(() => {
      result.current.fetchLibrary();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve!({ data: [] });
    });

    expect(result.current.loading).toBe(false);
  });

  it('populates items after successful fetch', async () => {
    const items = [makeItem('1'), makeItem('2')];
    mockGet.mockResolvedValue({ data: items });

    const { result } = renderHook(() => useInterventionsLibrary());

    await act(async () => {
      await result.current.fetchLibrary();
    });

    expect(result.current.items).toEqual(items);
    expect(result.current.error).toBe('');
  });

  it('filters out private interventions', async () => {
    const items = [makeItem('1', false), makeItem('2', true), makeItem('3', false)];
    mockGet.mockResolvedValue({ data: items });

    const { result } = renderHook(() => useInterventionsLibrary());

    await act(async () => {
      await result.current.fetchLibrary();
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.map((i) => i._id)).toEqual(['1', '3']);
  });

  it('handles non-array response gracefully', async () => {
    mockGet.mockResolvedValue({ data: null });

    const { result } = renderHook(() => useInterventionsLibrary());

    await act(async () => {
      await result.current.fetchLibrary();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBe('');
  });

  it('sets error and clears items on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useInterventionsLibrary());

    await act(async () => {
      await result.current.fetchLibrary();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBe('Error fetching recommendations. Please try again later.');
    expect(result.current.loading).toBe(false);
  });

  it('clears error on subsequent successful fetch', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'));
    mockGet.mockResolvedValueOnce({ data: [makeItem('1')] });

    const { result } = renderHook(() => useInterventionsLibrary());

    await act(async () => {
      await result.current.fetchLibrary();
    });
    expect(result.current.error).not.toBe('');

    await act(async () => {
      await result.current.fetchLibrary();
    });
    expect(result.current.error).toBe('');
    expect(result.current.items).toHaveLength(1);
  });
});
