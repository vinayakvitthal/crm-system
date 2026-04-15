import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import {
  usePipelines,
  useCreatePipeline,
  useStages,
  useCreateStage,
  useUpdateStage,
} from './hooks';
import type { Pipeline, Stage } from './types';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

// ── Create Pipeline Form ───────────────────────────────────────────────────

const pipelineSchema = z.object({ name: z.string().min(1, 'Name is required') });
type PipelineForm = z.infer<typeof pipelineSchema>;

function CreatePipelineForm() {
  const createPipeline = useCreatePipeline();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<PipelineForm>({ resolver: zodResolver(pipelineSchema) });

  const onSubmit = async (values: PipelineForm) => {
    try {
      await createPipeline.mutateAsync(values);
      reset();
    } catch {
      // handled in hook
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2 items-end mb-8">
      <div className="space-y-1">
        <Label htmlFor="pipeline-name">New Pipeline</Label>
        <Input id="pipeline-name" {...register('name')} placeholder="Pipeline name" className="w-64" />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting}>Create Pipeline</Button>
    </form>
  );
}

// ── Stage Row (inline edit) ────────────────────────────────────────────────

function StageRow({ stage, pipelineId }: { stage: Stage; pipelineId: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [position, setPosition] = useState(String(stage.position));
  const updateStage = useUpdateStage();

  const handleSave = async () => {
    try {
      await updateStage.mutateAsync({
        id: stage.id,
        pipelineId,
        name,
        position: Number(position),
      });
      setEditing(false);
    } catch {
      // handled in hook
    }
  };

  if (editing) {
    return (
      <tr>
        <td className="py-2 px-3 border-b">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-40" />
        </td>
        <td className="py-2 px-3 border-b">
          <Input
            type="number"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="h-8 w-20"
          />
        </td>
        <td className="py-2 px-3 border-b">
          <div className="flex gap-1">
            <Button size="sm" onClick={() => void handleSave()}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="py-2 px-3 border-b">{stage.name}</td>
      <td className="py-2 px-3 border-b">{stage.position}</td>
      <td className="py-2 px-3 border-b">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
      </td>
    </tr>
  );
}

// ── Add Stage Form ─────────────────────────────────────────────────────────

const stageSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  position: z.coerce.number().int().min(1, 'Position must be ≥ 1'),
});
type StageForm = z.infer<typeof stageSchema>;

function AddStageForm({ pipelineId }: { pipelineId: string }) {
  const createStage = useCreateStage();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<StageForm>({ resolver: zodResolver(stageSchema) });

  const onSubmit = async (values: StageForm) => {
    try {
      await createStage.mutateAsync({ pipelineId, ...values });
      reset();
    } catch {
      // handled in hook
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2 items-end mt-3">
      <div className="space-y-1">
        <Label htmlFor={`stage-name-${pipelineId}`}>Stage name</Label>
        <Input
          id={`stage-name-${pipelineId}`}
          {...register('name')}
          placeholder="e.g. Proposal"
          className="w-40 h-8"
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`stage-pos-${pipelineId}`}>Position</Label>
        <Input
          id={`stage-pos-${pipelineId}`}
          type="number"
          {...register('position')}
          placeholder="1"
          className="w-20 h-8"
        />
        {errors.position && <p className="text-xs text-destructive">{errors.position.message}</p>}
      </div>
      <Button type="submit" size="sm" disabled={isSubmitting}>Add Stage</Button>
    </form>
  );
}

// ── Pipeline Card ──────────────────────────────────────────────────────────

function PipelineCard({ pipeline }: { pipeline: Pipeline }) {
  const { data: stages = [], isLoading } = useStages(pipeline.id);
  const sorted = [...stages].sort((a, b) => a.position - b.position);

  return (
    <div className="border rounded-lg p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-base font-semibold">{pipeline.name}</h3>
        {pipeline.is_default && (
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">Default</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex py-4"><Spinner /></div>
      ) : (
        <>
          {sorted.length > 0 ? (
            <table className="w-full text-sm mb-2">
              <thead>
                <tr>
                  <th className="text-left py-1 px-3 font-medium text-muted-foreground">Stage</th>
                  <th className="text-left py-1 px-3 font-medium text-muted-foreground">Position</th>
                  <th className="text-left py-1 px-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((stage) => (
                  <StageRow key={stage.id} stage={stage} pipelineId={pipeline.id} />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground mb-2">No stages yet.</p>
          )}
          <AddStageForm pipelineId={pipeline.id} />
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PipelinesPage() {
  const { user } = useAuth();
  const { data: pipelines, isLoading, isError } = usePipelines();

  if (user && user.role !== 'admin') {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-destructive font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground mt-1">
            Pipeline management is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pipelines &amp; Stages</h1>
      </div>

      <CreatePipelineForm />

      {isLoading && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}
      {isError && (
        <p className="text-destructive py-4">Failed to load pipelines.</p>
      )}
      {!isLoading && !isError && (
        <>
          {(pipelines ?? []).length === 0 ? (
            <p className="text-muted-foreground">No pipelines yet. Create one above.</p>
          ) : (
            (pipelines ?? []).map((pipeline) => (
              <PipelineCard key={pipeline.id} pipeline={pipeline} />
            ))
          )}
        </>
      )}
    </div>
  );
}
