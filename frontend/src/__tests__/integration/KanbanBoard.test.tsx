import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import KanbanBoard from '@/features/sales/KanbanBoard';

vi.mock('@/features/sales/hooks', () => ({
  useDeals: vi.fn(),
  useStages: vi.fn(),
  useMoveDealStage: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useDeals, useStages, useMoveDealStage } from '@/features/sales/hooks';

const mockUseDeals = useDeals as ReturnType<typeof vi.fn>;
const mockUseStages = useStages as ReturnType<typeof vi.fn>;
const mockUseMoveDealStage = useMoveDealStage as ReturnType<typeof vi.fn>;

const stages = [
  { id: 's1', pipeline_id: 'p1', name: 'Prospecting', position: 1 },
  { id: 's2', pipeline_id: 'p1', name: 'Proposal', position: 2 },
];

const deals = [
  {
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
  },
];

function renderBoard(pipelineId = 'p1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanBoard pipelineId={pipelineId} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMoveDealStage.mockReturnValue({ mutate: vi.fn() });
});

describe('KanbanBoard', () => {
  it('renders stage columns with deal cards', () => {
    mockUseDeals.mockReturnValue({ data: deals, isLoading: false });
    mockUseStages.mockReturnValue({ data: stages, isLoading: false });
    renderBoard();

    expect(screen.getByText('Prospecting')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('Big Deal')).toBeInTheDocument();
  });

  it('shows "No deals" when a stage has no deals', () => {
    mockUseDeals.mockReturnValue({ data: deals, isLoading: false });
    mockUseStages.mockReturnValue({ data: stages, isLoading: false });
    renderBoard();

    // Proposal stage has no deals
    expect(screen.getByText('No deals')).toBeInTheDocument();
  });

  it('shows spinner when loading', () => {
    mockUseDeals.mockReturnValue({ data: undefined, isLoading: true });
    mockUseStages.mockReturnValue({ data: undefined, isLoading: true });
    renderBoard();

    // Spinner is rendered as a div with animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders deal title and value in cards', () => {
    mockUseDeals.mockReturnValue({ data: deals, isLoading: false });
    mockUseStages.mockReturnValue({ data: stages, isLoading: false });
    renderBoard();

    expect(screen.getByText('Big Deal')).toBeInTheDocument();
    expect(screen.getByText(/10,000/)).toBeInTheDocument();
  });

  it('shows message when no stages configured', () => {
    mockUseDeals.mockReturnValue({ data: [], isLoading: false });
    mockUseStages.mockReturnValue({ data: [], isLoading: false });
    renderBoard();

    expect(screen.getByText('No stages configured for this pipeline.')).toBeInTheDocument();
  });
});
