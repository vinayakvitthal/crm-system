import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useDeals, useStages, useMoveDealStage } from './hooks';
import type { Deal, Stage } from './types';

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

// ── Deal Card ──────────────────────────────────────────────────────────────

function DealCard({ deal, isDragging = false }: { deal: Deal; isDragging?: boolean }) {
  return (
    <div
      className={`bg-background border rounded-lg p-3 shadow-sm select-none ${
        isDragging ? 'opacity-50' : 'hover:shadow-md transition-shadow'
      }`}
    >
      <p className="font-medium text-sm truncate">{deal.title}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {deal.value.toLocaleString()} {deal.currency}
      </p>
      {deal.contact_id && (
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          Contact: {deal.contact_id}
        </p>
      )}
    </div>
  );
}

// ── Draggable Deal Card ────────────────────────────────────────────────────

function DraggableDealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
      <DealCard deal={deal} isDragging={isDragging} />
    </div>
  );
}

// ── Stage Column ───────────────────────────────────────────────────────────

function StageColumn({ stage, deals }: { stage: Stage; deals: Deal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="flex flex-col min-w-[240px] w-64 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{stage.name}</h3>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {deals.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[200px] rounded-lg p-2 space-y-2 transition-colors ${
          isOver ? 'bg-primary/10 border-2 border-primary/30' : 'bg-muted/40'
        }`}
      >
        {deals.map((deal) => (
          <DraggableDealCard key={deal.id} deal={deal} />
        ))}
        {deals.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No deals</p>
        )}
      </div>
    </div>
  );
}

// ── KanbanBoard ────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  pipelineId: string;
}

export default function KanbanBoard({ pipelineId }: KanbanBoardProps) {
  const { data: allDeals, isLoading: dealsLoading } = useDeals();
  const { data: stages, isLoading: stagesLoading } = useStages(pipelineId);
  const moveDealStage = useMoveDealStage();

  // Local optimistic state: map of dealId → stageId overrides
  const [optimisticStages, setOptimisticStages] = useState<Record<string, string>>({});
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const sortedStages = stages ? [...stages].sort((a, b) => a.position - b.position) : [];

  // Filter to open deals for this pipeline, applying optimistic overrides
  const openDeals: Deal[] = (allDeals ?? [])
    .filter((d) => d.pipeline_id === pipelineId && d.status === 'open')
    .map((d) => optimisticStages[d.id] ? { ...d, stage_id: optimisticStages[d.id] } : d);

  const dealsByStage = useCallback(
    (stageId: string) => openDeals.filter((d) => d.stage_id === stageId),
    [openDeals],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const deal = (event.active.data.current as { deal: Deal }).deal;
    setActiveDeal(deal);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const newStageId = over.id as string;

    // Find the deal's current stage (with optimistic override applied)
    const deal = openDeals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === newStageId) return;

    const previousStageId = deal.stage_id;

    // Optimistic update
    setOptimisticStages((prev) => ({ ...prev, [dealId]: newStageId }));

    moveDealStage.mutate(
      { id: dealId, stage_id: newStageId },
      {
        onError: () => {
          // Revert optimistic update
          setOptimisticStages((prev) => ({ ...prev, [dealId]: previousStageId }));
        },
        onSuccess: () => {
          // Clear optimistic override — server data will take over after invalidation
          setOptimisticStages((prev) => {
            const next = { ...prev };
            delete next[dealId];
            return next;
          });
        },
      },
    );
  };

  if (dealsLoading || stagesLoading) return <Spinner />;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {sortedStages.map((stage) => (
          <StageColumn key={stage.id} stage={stage} deals={dealsByStage(stage.id)} />
        ))}
        {sortedStages.length === 0 && (
          <p className="text-muted-foreground text-sm">No stages configured for this pipeline.</p>
        )}
      </div>
      <DragOverlay>
        {activeDeal ? <DealCard deal={activeDeal} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
