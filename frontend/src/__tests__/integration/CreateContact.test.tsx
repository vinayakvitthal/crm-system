import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContactFormModal from '@/features/contacts/ContactFormModal';

vi.mock('@/features/contacts/hooks', () => ({
  useCreateContact: vi.fn(),
  useUpdateContact: vi.fn(),
  useCompanies: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
  useCreateContact,
  useUpdateContact,
  useCompanies,
} from '@/features/contacts/hooks';

const mockUseCreateContact = useCreateContact as ReturnType<typeof vi.fn>;
const mockUseUpdateContact = useUpdateContact as ReturnType<typeof vi.fn>;
const mockUseCompanies = useCompanies as ReturnType<typeof vi.fn>;

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContactFormModal onClose={onClose} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCompanies.mockReturnValue({ data: [] });
  mockUseUpdateContact.mockReturnValue({ mutateAsync: vi.fn() });
});

describe('CreateContact integration', () => {
  it('shows validation errors when submitting empty form', async () => {
    mockUseCreateContact.mockReturnValue({ mutateAsync: vi.fn() });
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument();
      expect(screen.getByText('Last name is required')).toBeInTheDocument();
    });
  });

  it('shows email validation error for invalid email', async () => {
    mockUseCreateContact.mockReturnValue({ mutateAsync: vi.fn() });
    const { container } = renderModal();

    await userEvent.type(screen.getByLabelText('First Name'), 'Alice');
    await userEvent.type(screen.getByLabelText('Last Name'), 'Smith');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');

    // Use fireEvent.submit to bypass browser native email validation
    // so zod can run and show its error message
    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    });
  });

  it('successfully submits form with valid data and calls createContact mutation', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseCreateContact.mockReturnValue({ mutateAsync });
    const onClose = vi.fn();
    renderModal(onClose);

    await userEvent.type(screen.getByLabelText('First Name'), 'Alice');
    await userEvent.type(screen.getByLabelText('Last Name'), 'Smith');
    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@example.com',
        })
      );
    });
  });

  it('calls onClose after successful submission', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseCreateContact.mockReturnValue({ mutateAsync });
    const onClose = vi.fn();
    renderModal(onClose);

    await userEvent.type(screen.getByLabelText('First Name'), 'Alice');
    await userEvent.type(screen.getByLabelText('Last Name'), 'Smith');
    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
