import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type {
  KPIs,
  FunnelStage,
  VelocityStage,
  TicketResolution,
  ActivityBreakdownItem,
  DateRange,
} from './types';

function errMsg(err: unknown) {
  return (err as { detail?: string }).detail ?? 'Something went wrong';
}

function buildRangeParams(range: DateRange): string {
  const params = new URLSearchParams({ range: range.preset });
  if (range.preset === 'custom' && range.from && range.to) {
    params.set('from', range.from);
    params.set('to', range.to);
  }
  return params.toString();
}

export function useKPIs(range: DateRange) {
  return useQuery<KPIs, Error>({
    queryKey: ['analytics', 'kpis', range],
    queryFn: async () => {
      try {
        return await api.get<KPIs>(`/analytics/kpis?${buildRangeParams(range)}`);
      } catch (err) {
        toast.error(errMsg(err));
        throw err;
      }
    },
  });
}

export function usePipelineFunnel(pipelineId: string | null, range: DateRange) {
  return useQuery<FunnelStage[], Error>({
    queryKey: ['analytics', 'pipeline-funnel', pipelineId, range],
    queryFn: async () => {
      const params = new URLSearchParams({ range: range.preset });
      if (pipelineId) params.set('pipeline_id', pipelineId);
      if (range.preset === 'custom' && range.from && range.to) {
        params.set('from', range.from);
        params.set('to', range.to);
      }
      try {
        return await api.get<FunnelStage[]>(`/analytics/pipeline-funnel?${params.toString()}`);
      } catch (err) {
        toast.error(errMsg(err));
        throw err;
      }
    },
    enabled: !!pipelineId,
  });
}

export function useSalesVelocity(pipelineId: string | null, range: DateRange) {
  return useQuery<VelocityStage[], Error>({
    queryKey: ['analytics', 'sales-velocity', pipelineId, range],
    queryFn: async () => {
      const params = new URLSearchParams({ range: range.preset });
      if (pipelineId) params.set('pipeline_id', pipelineId);
      if (range.preset === 'custom' && range.from && range.to) {
        params.set('from', range.from);
        params.set('to', range.to);
      }
      try {
        return await api.get<VelocityStage[]>(`/analytics/sales-velocity?${params.toString()}`);
      } catch (err) {
        toast.error(errMsg(err));
        throw err;
      }
    },
    enabled: !!pipelineId,
  });
}

export function useTicketResolution(range: DateRange) {
  return useQuery<TicketResolution, Error>({
    queryKey: ['analytics', 'ticket-resolution', range],
    queryFn: async () => {
      try {
        return await api.get<TicketResolution>(`/analytics/ticket-resolution?${buildRangeParams(range)}`);
      } catch (err) {
        toast.error(errMsg(err));
        throw err;
      }
    },
  });
}

export function useActivityBreakdown(range: DateRange) {
  return useQuery<ActivityBreakdownItem[], Error>({
    queryKey: ['analytics', 'activity-breakdown', range],
    queryFn: async () => {
      try {
        return await api.get<ActivityBreakdownItem[]>(`/analytics/activity-breakdown?${buildRangeParams(range)}`);
      } catch (err) {
        toast.error(errMsg(err));
        throw err;
      }
    },
  });
}
