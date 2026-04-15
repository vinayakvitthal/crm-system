import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Lead, Pipeline, Stage, Deal } from './types';

function errMsg(err: unknown) {
  return (err as { detail?: string }).detail ?? 'Something went wrong';
}

// ── Leads ──────────────────────────────────────────────────────────────────

export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: () => api.get<Lead[]>('/leads/'),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; source?: string }) =>
      api.post<Lead>('/leads/', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['leads'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Lead> & { id: string }) =>
      api.patch<Lead>(`/leads/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['leads'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

// ── Pipelines ──────────────────────────────────────────────────────────────

export function usePipelines() {
  return useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: () => api.get<Pipeline[]>('/pipelines/'),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => api.post<Pipeline>('/pipelines/', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pipelines'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useStages(pipelineId: string) {
  return useQuery<Stage[]>({
    queryKey: ['pipelines', pipelineId, 'stages'],
    queryFn: () => api.get<Stage[]>(`/pipelines/${pipelineId}/stages`),
    enabled: !!pipelineId,
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pipelineId,
      ...data
    }: { pipelineId: string; name: string; position: number }) =>
      api.post<Stage>(`/pipelines/${pipelineId}/stages`, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['pipelines', vars.pipelineId, 'stages'] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      pipelineId,
      ...data
    }: { id: string; pipelineId: string; name?: string; position?: number }) =>
      api.patch<Stage>(`/stages/${id}`, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['pipelines', vars.pipelineId, 'stages'] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

// ── Deals ──────────────────────────────────────────────────────────────────

export function useDeals() {
  return useQuery<Deal[]>({
    queryKey: ['deals'],
    queryFn: () => api.get<Deal[]>('/deals/'),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      value: number;
      currency: string;
      pipeline_id: string;
      stage_id: string;
    }) => api.post<Deal>('/deals/', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deals'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Deal> & { id: string }) =>
      api.patch<Deal>(`/deals/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deals'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useMarkDealWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<Deal>(`/deals/${id}/won`, { won_lost_reason: reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deals'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useMarkDealLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<Deal>(`/deals/${id}/lost`, { won_lost_reason: reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deals'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useMoveDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage_id }: { id: string; stage_id: string }) =>
      api.patch<Deal>(`/deals/${id}/stage`, { stage_id }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deals'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}
