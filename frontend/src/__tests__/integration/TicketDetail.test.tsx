import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TicketDetail from '@/features/support/TicketDetail';

vi.mock('@/features/support/hooks', () => ({
  useTicket: vi.fn(),
  useTicketComments: vi.fn(),
  useUpdateTicketStatus: vi.fn(),
  useAssignTicket: vi.fn(),
  useAddComment: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn((opts: { queryKey: unknown[] }) => {
      // Only intercept the users query
      if (Array.isArray(opts.queryKey) && opts.queryKey[0] === 'users') {
        return { data: [], isLoading: false, isError: false };
      }
      // Fall through to actual for other queries (won't be called since hooks are mocked)
      return { data: undefined, isLoading: false, isError: false };
    }),
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
  useTicket,
  useTicketComments,
  useUpdateTicketStatus,
  useAssignTicket,
  useAddComment,
} from '@/features/support/hooks';
import { useAuth } from '@/hooks/useAuth';

const mockUseTicket = useTicket as ReturnType<typeof vi.fn>;
const mockUseTicketComments = useTicketComments as ReturnType<typeof vi.fn>;
const mockUseUpdateTicketStatus = useUpdateTicketStatus as ReturnType<typeof vi.fn>;
const mockUseAssignTicket = useAssignTicket as ReturnType<typeof vi.fn>;
const mockUseAddComment = useAddComment as ReturnType<typeof vi.fn>;
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

const mockTicket = {
  id: 't1',
  subject: 'Login issue',
  description: 'Cannot log in to the system.',
  status: 'open' as const,
  priority: 'high' as const,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
};

const mockComment = {
  id: 'c1',
  ticket_id: 't1',
  author_id: 'u1',
  body: 'Looking into this.',
  created_at: '2024-01-02T00:00:00Z',
};

function renderTicketDetail(ticketId = 't1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tickets/${ticketId}`]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseUpdateTicketStatus.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseAssignTicket.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
});

describe('TicketDetail', () => {
  it('renders ticket subject and description', () => {
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: { role: 'viewer' } });
    mockUseAddComment.mockReturnValue({ mutateAsync: vi.fn() });

    renderTicketDetail();

    expect(screen.getByText('Login issue')).toBeInTheDocument();
    expect(screen.getByText('Cannot log in to the system.')).toBeInTheDocument();
  });

  it('shows status badge', () => {
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: { role: 'viewer' } });
    mockUseAddComment.mockReturnValue({ mutateAsync: vi.fn() });

    renderTicketDetail();

    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows comments list', () => {
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [mockComment] });
    mockUseAuth.mockReturnValue({ user: { role: 'viewer' } });
    mockUseAddComment.mockReturnValue({ mutateAsync: vi.fn() });

    renderTicketDetail();

    expect(screen.getByText('Looking into this.')).toBeInTheDocument();
  });

  it('shows "No comments yet" when empty', () => {
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: { role: 'viewer' } });
    mockUseAddComment.mockReturnValue({ mutateAsync: vi.fn() });

    renderTicketDetail();

    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });

  it('renders AddCommentForm for admin users', () => {
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    mockUseAddComment.mockReturnValue({ mutateAsync: vi.fn() });

    renderTicketDetail();

    expect(screen.getByLabelText('Add a comment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post Comment' })).toBeInTheDocument();
  });

  it('renders AddCommentForm for support_agent users', () => {
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: { role: 'support_agent' } });
    mockUseAddComment.mockReturnValue({ mutateAsync: vi.fn() });

    renderTicketDetail();

    expect(screen.getByLabelText('Add a comment')).toBeInTheDocument();
  });

  it('submits a comment successfully', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: { role: 'support_agent' } });
    mockUseAddComment.mockReturnValue({ mutateAsync });

    renderTicketDetail();

    await userEvent.type(screen.getByLabelText('Add a comment'), 'This is my comment');
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        ticketId: 't1',
        body: 'This is my comment',
      });
    });
  });

  it('shows validation error when submitting empty comment', async () => {
    mockUseTicket.mockReturnValue({ data: mockTicket, isLoading: false, isError: false });
    mockUseTicketComments.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: { role: 'support_agent' } });
    mockUseAddComment.mockReturnValue({ mutateAsync: vi.fn() });

    renderTicketDetail();

    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }));

    await waitFor(() => {
      expect(screen.getByText('Comment cannot be empty')).toBeInTheDocument();
    });
  });
});
