import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeals, useMoveDealStage } from '@/features/sales/hooks';
import * as apiModule from '@/lib/api';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockApi = apiModule.api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockDeal = {
  id: 'd1',
  title: 'Big Deal',
  value: 10000,
  currency: 'USD',
  pipeline_id: 'p1',
  stage_id: 's1',
  stage_entered_at: '2024-01-01T00:00:00Z',
  status: 'open' as const,
  owner_id: 'u1',
  created_at: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDeals', () => {
  it('fetches from /deals/ endpoint', async () => {
    mockApi.get.mockResolvedValue([mockDeal]);
    const { result } = renderHook(() => useDeals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/deals/');
    expect(result.current.data).toEqual([mockDeal]);
  });
});

describe('useMoveDealStage', () => {
  it('calls PATCH /deals/{id}/stage with stage_id', async () => {
    mockApi.patch.mockResolvedValue({ ...mockDeal, stage_id: 's2' });
    mockApi.get.mockResolvedValue([]);

    const { result } = renderHook(() => useMoveDealStage(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'd1', stage_id: 's2' });
    });

    expect(mockApi.patch).toHaveBeenCalledWith('/deals/d1/stage', { stage_id: 's2' });
  });

  it('invalidates deals query on success', async () => {
    mockApi.patch.mockResolvedValue({ ...mockDeal, stage_id: 's2' });
    mockApi.get.mockResolvedValue([]);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useMoveDealStage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'd1', stage_id: 's2' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['deals'] })
    );
  });
});
