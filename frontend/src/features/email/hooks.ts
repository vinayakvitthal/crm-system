import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { EmailThread, EmailMessage, EmailCredential } from './types';

function errMsg(err: unknown) {
  return (err as { detail?: string }).detail ?? 'Something went wrong';
}

export function useEmailThreads() {
  return useQuery<EmailThread[]>({
    queryKey: ['email', 'threads'],
    queryFn: () => api.get<EmailThread[]>('/email/inbox'),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useEmailThread(id: string) {
  return useQuery<EmailMessage[]>({
    queryKey: ['email', 'threads', id],
    queryFn: () => api.get<EmailMessage[]>(`/email/threads/${id}`),
    enabled: !!id,
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { to: string; subject: string; body: string }) =>
      api.post('/email/send', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['email', 'threads'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useReplyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ thread_id, body }: { thread_id: string; body: string }) =>
      api.post(`/email/reply/${thread_id}`, { body }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['email', 'threads'] });
      void qc.invalidateQueries({ queryKey: ['email', 'threads', vars.thread_id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useSaveEmailCredential() {
  return useMutation({
    mutationFn: (data: Omit<EmailCredential, 'id' | 'user_id'> & { password: string }) =>
      api.post('/email/credentials', data),
    onSuccess: () => { toast.success('Email credentials saved'); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}
