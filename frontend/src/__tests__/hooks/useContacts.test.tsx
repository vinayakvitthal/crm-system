import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContacts, useCreateContact } from '@/features/contacts/hooks';
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

const mockContacts = [
  {
    id: 'c1',
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@example.com',
    owner_id: 'u1',
    tags: [],
    created_at: '2024-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useContacts', () => {
  it('fetches from /contacts/ endpoint', async () => {
    mockApi.get.mockResolvedValue(mockContacts);
    const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/contacts/');
    expect(result.current.data).toEqual(mockContacts);
  });

  it('passes filter params as query string', async () => {
    mockApi.get.mockResolvedValue([]);
    const { result } = renderHook(
      () => useContacts({ name: 'Alice', email: 'alice@example.com' }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith(
      expect.stringContaining('name=Alice')
    );
    expect(mockApi.get).toHaveBeenCalledWith(
      expect.stringContaining('email=alice%40example.com')
    );
  });
});

describe('useCreateContact', () => {
  it('calls POST /contacts/ with payload', async () => {
    const newContact = { ...mockContacts[0] };
    mockApi.post.mockResolvedValue(newContact);
    mockApi.get.mockResolvedValue([]);

    const { result } = renderHook(() => useCreateContact(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
        tags: [],
      });
    });

    expect(mockApi.post).toHaveBeenCalledWith('/contacts/', expect.objectContaining({
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice@example.com',
    }));
  });

  it('invalidates contacts query on success', async () => {
    const newContact = { ...mockContacts[0] };
    mockApi.post.mockResolvedValue(newContact);
    mockApi.get.mockResolvedValue([]);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateContact(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com', tags: [] });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['contacts'] })
    );
  });
});
