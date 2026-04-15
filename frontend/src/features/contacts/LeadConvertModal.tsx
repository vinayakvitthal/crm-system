import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Pipeline, Stage } from './types';

const schema = z.object({
  pipeline_id: z.string().min(1, 'Pipeline is required'),
  stage_id: z.string().min(1, 'Stage is required'),
  deal_value: z.coerce.number().positive('Deal value must be positive'),
});

type FormValues = z.infer<typeof schema>;

interface LeadConvertModalProps {
  leadId: string;
  onClose: () => void;
}

export default function LeadConvertModal({ leadId, onClose }: LeadConvertModalProps) {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const pipelineId = watch('pipeline_id');

  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: () => api.get<Pipeline[]>('/pipelines/'),
  });

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ['pipelines', pipelineId, 'stages'],
    queryFn: () => api.get<Stage[]>(`/pipelines/${pipelineId}/stages`),
    enabled: !!pipelineId,
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await api.post<{ contact_id: string; deal_id: string }>(
        `/leads/${leadId}/convert`,
        values
      );
      toast.success('Lead converted');
      onClose();
      void navigate(`/deals/${result.deal_id}`);
    } catch (err: unknown) {
      toast.error((err as { detail?: string }).detail ?? 'Something went wrong');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Convert Lead</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pipeline_id">Pipeline</Label>
            <select
              id="pipeline_id"
              {...register('pipeline_id')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— Select pipeline —</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.pipeline_id && (
              <p className="text-sm text-destructive">{errors.pipeline_id.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="stage_id">Stage</Label>
            <select
              id="stage_id"
              {...register('stage_id')}
              disabled={!pipelineId}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">— Select stage —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.stage_id && (
              <p className="text-sm text-destructive">{errors.stage_id.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="deal_value">Deal Value</Label>
            <Input
              id="deal_value"
              type="number"
              step="0.01"
              min="0"
              {...register('deal_value')}
            />
            {errors.deal_value && (
              <p className="text-sm text-destructive">{errors.deal_value.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Convert
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
