import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Ticket, TicketComment, TicketStatus } from './types';

function errMsg(err: unknown) {
  return (err as { detail?: string }).detail ?? 'Something went wrong';
}

// ── Tickets ────────────────────────────────────────────────────────────────

export function useTickets(filters?: { status?: TicketStatus; priority?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  const qs = params.toString();

  return useQuery<Ticket[]>({
    queryKey: ['tickets', filters],
    queryFn: () => api.get<Ticket[]>(`/tickets/${qs ? `?${qs}` : ''}`),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useTicket(id: string) {
  return useQuery<Ticket>({
    queryKey: ['tickets', id],
    queryFn: () => api.get<Ticket>(`/tickets/${id}`),
    enabled: !!id,
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      subject: string;
      description: string;
      priority: string;
      contact_id?: string;
    }) => api.post<Ticket>('/tickets/', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tickets'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Ticket> & { id: string }) =>
      api.patch<Ticket>(`/tickets/${id}`, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['tickets', vars.id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) =>
      api.patch<Ticket>(`/tickets/${id}/status`, { status }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['tickets', vars.id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useAssignTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, user_id }: { id: string; user_id: string }) =>
      api.patch<Ticket>(`/tickets/${id}/assign`, { user_id }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['tickets', vars.id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tickets/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tickets'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

// ── Comments ───────────────────────────────────────────────────────────────

export function useTicketComments(ticketId: string) {
  return useQuery<TicketComment[]>({
    queryKey: ['tickets', ticketId, 'comments'],
    queryFn: () => api.get<TicketComment[]>(`/tickets/${ticketId}/comments`),
    enabled: !!ticketId,
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: string }) =>
      api.post<TicketComment>(`/tickets/${ticketId}/comments`, { body }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tickets', vars.ticketId, 'comments'] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}
