import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Activity } from './types';

function errMsg(err: unknown) {
  return (err as { detail?: string }).detail ?? 'Something went wrong';
}

export function useActivities() {
  return useQuery<Activity[]>({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities/feed'),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Activity>) => api.post<Activity>('/activities/', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['activities'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Activity> & { id: string }) =>
      api.patch<Activity>(`/activities/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['activities'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/activities/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['activities'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}
