import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import {
  useDeals,
  useCreateDeal,
  useMarkDealWon,
  useMarkDealLost,
  usePipelines,
  useStages,
} from './hooks';
import type { Deal } from './types';

const STATUS_COLORS: Record<Deal['status'], string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  won: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  lost: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

// ── Create Deal Modal ──────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  value: z.coerce.number().min(0, 'Value must be ≥ 0'),
  currency: z.string().min(1, 'Currency is required'),
  pipeline_id: z.string().min(1, 'Pipeline is required'),
  stage_id: z.string().min(1, 'Stage is required'),
});
type CreateForm = z.infer<typeof createSchema>;

function CreateDealModal({ onClose }: { onClose: () => void }) {
  const createDeal = useCreateDeal();
  const { data: pipelines = [] } = usePipelines();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { currency: 'USD' },
  });

  const pipelineId = watch('pipeline_id');
  const { data: stages = [] } = useStages(pipelineId);
  const sortedStages = [...stages].sort((a, b) => a.position - b.position);

  const onSubmit = async (values: CreateForm) => {
    try {
      await createDeal.mutateAsync(values);
      onClose();
    } catch {
      // handled in hook
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">New Deal</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>
          <div className="flex gap-3">
            <div className="space-y-1 flex-1">
              <Label htmlFor="value">Value</Label>
              <Input id="value" type="number" step="0.01" min="0" {...register('value')} />
              {errors.value && <p className="text-sm text-destructive">{errors.value.message}</p>}
            </div>
            <div className="space-y-1 w-28">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" {...register('currency')} />
              {errors.currency && <p className="text-sm text-destructive">{errors.currency.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pipeline_id">Pipeline</Label>
            <select
              id="pipeline_id"
              {...register('pipeline_id')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— Select pipeline —</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.pipeline_id && <p className="text-sm text-destructive">{errors.pipeline_id.message}</p>}
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
              {sortedStages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {errors.stage_id && <p className="text-sm text-destructive">{errors.stage_id.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Create</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Won/Lost Modal ─────────────────────────────────────────────────────────

function WonLostModal({
  deal,
  action,
  onClose,
}: {
  deal: Deal;
  action: 'won' | 'lost';
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const markWon = useMarkDealWon();
  const markLost = useMarkDealLost();

  const handleConfirm = async () => {
    try {
      if (action === 'won') {
        await markWon.mutateAsync({ id: deal.id, reason: reason || undefined });
      } else {
        await markLost.mutateAsync({ id: deal.id, reason: reason || undefined });
      }
      onClose();
    } catch {
      // handled in hook
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-4">
          Mark as {action === 'won' ? 'Won' : 'Lost'}
        </h2>
        <div className="space-y-1 mb-4">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Budget approved"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={action === 'won' ? 'default' : 'destructive'}
            onClick={() => void handleConfirm()}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const { user } = useAuth();
  const { data: deals, isLoading, isError } = useDeals();
  const { data: pipelines = [] } = usePipelines();
  const [showCreate, setShowCreate] = useState(false);
  const [wonLostDeal, setWonLostDeal] = useState<{ deal: Deal; action: 'won' | 'lost' } | null>(null);

  const canWrite = user?.role === 'admin' || user?.role === 'sales_rep';

  const pipelineName = (id: string) =>
    pipelines.find((p) => p.id === id)?.name ?? '—';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Deals</h1>
        {canWrite && (
          <Button onClick={() => setShowCreate(true)}>New Deal</Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}
      {isError && (
        <p className="text-destructive py-4">Failed to load deals.</p>
      )}
      {!isLoading && !isError && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Title</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Value</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Pipeline</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Status</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Created</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(deals ?? []).map((deal) => (
              <tr key={deal.id}>
                <td className="py-3 px-4 border-b font-medium">{deal.title}</td>
                <td className="py-3 px-4 border-b">
                  {deal.value.toLocaleString()} {deal.currency}
                </td>
                <td className="py-3 px-4 border-b">{pipelineName(deal.pipeline_id)}</td>
                <td className="py-3 px-4 border-b">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[deal.status]}`}>
                    {deal.status}
                  </span>
                </td>
                <td className="py-3 px-4 border-b">
                  {new Date(deal.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 border-b">
                  {canWrite && deal.status === 'open' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => setWonLostDeal({ deal, action: 'won' })}
                      >
                        Won
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-700 border-red-300 hover:bg-red-50"
                        onClick={() => setWonLostDeal({ deal, action: 'lost' })}
                      >
                        Lost
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {(deals ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No deals found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showCreate && <CreateDealModal onClose={() => setShowCreate(false)} />}
      {wonLostDeal && (
        <WonLostModal
          deal={wonLostDeal.deal}
          action={wonLostDeal.action}
          onClose={() => setWonLostDeal(null)}
        />
      )}
    </div>
  );
}
