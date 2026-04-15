import { useState, useEffect } from 'react';
import { usePipelines } from './hooks';
import KanbanBoard from './KanbanBoard';

export default function KanbanPage() {
  const { data: pipelines = [], isLoading } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');

  // Default to the is_default pipeline once loaded
  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      const defaultPipeline = pipelines.find((p) => p.is_default) ?? pipelines[0];
      setSelectedPipelineId(defaultPipeline.id);
    }
  }, [pipelines, selectedPipelineId]);

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Kanban Board</h1>
        {!isLoading && pipelines.length > 0 && (
          <select
            value={selectedPipelineId}
            onChange={(e) => setSelectedPipelineId(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && selectedPipelineId && (
        <KanbanBoard pipelineId={selectedPipelineId} />
      )}

      {!isLoading && pipelines.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No pipelines found. Create a pipeline first.
        </p>
      )}
    </div>
  );
}
