import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as apiModule from '@/lib/api';
import * as authLib from '@/lib/auth';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  getAccessToken: vi.fn(() => null),
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

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

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'admin' as const,
  is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAuth', () => {
  it('returns null user when not authenticated (api returns null)', async () => {
    mockApi.get.mockRejectedValue(new Error('Unauthorized'));
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('returns user when authenticated', async () => {
    mockApi.get.mockResolvedValue(mockUser);
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('isAuthenticated is false when user is null', async () => {
    mockApi.get.mockRejectedValue(new Error('Unauthorized'));
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('isAuthenticated is true when user exists', async () => {
    mockApi.get.mockResolvedValue(mockUser);
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login mutation calls api.post and sets access token', async () => {
    mockApi.get.mockRejectedValue(new Error('Unauthorized'));
    mockApi.post.mockResolvedValue({ access_token: 'test-token' });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.login({ email: 'test@example.com', password: 'password' });

    expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password',
    });
    expect(authLib.setAccessToken).toHaveBeenCalledWith('test-token');
  });

  it('logout mutation calls api.post and clears access token', async () => {
    mockApi.get.mockResolvedValue(mockUser);
    mockApi.post.mockResolvedValue({});

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.logout();

    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout');
    expect(authLib.clearAccessToken).toHaveBeenCalled();
  });
});
