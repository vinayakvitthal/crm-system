import { useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import {
  useTicket,
  useTicketComments,
  useUpdateTicketStatus,
  useAssignTicket,
  useAddComment,
} from './hooks';
import type { TicketStatus, TicketPriority } from './types';
import { STATUS_TRANSITIONS } from './types';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  closed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

// ── Comment Form ───────────────────────────────────────────────────────────

const commentSchema = z.object({
  body: z.string().min(1, 'Comment cannot be empty'),
});
type CommentForm = z.infer<typeof commentSchema>;

function AddCommentForm({ ticketId }: { ticketId: string }) {
  const addComment = useAddComment();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentForm>({
    resolver: zodResolver(commentSchema),
  });

  const onSubmit = async (values: CommentForm) => {
    try {
      await addComment.mutateAsync({ ticketId, body: values.body });
      reset();
    } catch {
      // handled in hook via toast
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="comment-body">Add a comment</Label>
        <textarea
          id="comment-body"
          {...register('body')}
          rows={3}
          placeholder="Write your comment…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
        {errors.body && (
          <p className="text-sm text-destructive">{errors.body.message}</p>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} size="sm">
          Post Comment
        </Button>
      </div>
    </form>
  );
}

// ── Status Workflow Dropdown ───────────────────────────────────────────────

function StatusControl({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: TicketStatus;
}) {
  const updateStatus = useUpdateTicketStatus();
  const nextStates = STATUS_TRANSITIONS[currentStatus];

  if (nextStates.length === 0) {
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[currentStatus]}`}>
        {STATUS_LABELS[currentStatus]}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[currentStatus]}`}>
        {STATUS_LABELS[currentStatus]}
      </span>
      <span className="text-muted-foreground text-xs">→</span>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) {
            void updateStatus.mutateAsync({
              id: ticketId,
              status: e.target.value as TicketStatus,
            });
          }
        }}
        disabled={updateStatus.isPending}
        className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value="">Move to…</option>
        {nextStates.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Assignment Selector ────────────────────────────────────────────────────

interface TeamUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

function AssignmentSelector({
  ticketId,
  assignedTo,
  users,
}: {
  ticketId: string;
  assignedTo?: string;
  users: TeamUser[];
}) {
  const assignTicket = useAssignTicket();

  const handleChange = (userId: string) => {
    if (userId) {
      void assignTicket.mutateAsync({ id: ticketId, user_id: userId });
    }
  };

  const supportUsers = users.filter(
    (u) => u.role === 'support_agent' || u.role === 'admin'
  );

  return (
    <div className="space-y-1">
      <Label>Assigned To</Label>
      <select
        value={assignedTo ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={assignTicket.isPending}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value="">— Unassigned —</option>
        {supportUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function useTeamUsers() {
  return useQuery<TeamUser[]>({
    queryKey: ['users'],
    queryFn: () => api.get<TeamUser[]>('/users/'),
    retry: false,
    // Silently fail for non-admins (403)
    onError: () => undefined,
  } as Parameters<typeof useQuery>[0]);
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: ticket, isLoading, isError } = useTicket(id ?? '');
  const { data: comments = [] } = useTicketComments(id ?? '');
  const { data: teamUsers = [] } = useTeamUsers();

  const canWrite = user?.role === 'admin' || user?.role === 'support_agent';
  const isAdmin = user?.role === 'admin';

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="p-8">
        <p className="text-destructive">Ticket not found.</p>
        <Link to="/tickets" className="text-primary hover:underline text-sm mt-2 inline-block">
          ← Back to Tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/tickets" className="text-primary hover:underline text-sm mb-4 inline-block">
        ← Back to Tickets
      </Link>

      <div className="flex items-start justify-between mb-6">
        <h1 className="text-2xl font-bold">{ticket.subject}</h1>
      </div>

      {/* Ticket metadata */}
      <div className="grid grid-cols-2 gap-4 mb-6 p-4 rounded-lg border bg-muted/20">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
          {canWrite ? (
            <StatusControl ticketId={ticket.id} currentStatus={ticket.status} />
          ) : (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ticket.status]}`}>
              {STATUS_LABELS[ticket.status]}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Priority</p>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
            {ticket.priority}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Created</p>
          <p className="text-sm">{new Date(ticket.created_at).toLocaleString()}</p>
        </div>

        {ticket.resolved_at && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Resolved</p>
            <p className="text-sm">{new Date(ticket.resolved_at).toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Assignment selector (write access + admin can list users) */}
      {canWrite && isAdmin && (
        <div className="mb-6">
          <AssignmentSelector
            ticketId={ticket.id}
            assignedTo={ticket.assigned_to}
            users={teamUsers}
          />
        </div>
      )}

      {/* Description */}
      <div className="mb-8">
        <h2 className="text-base font-semibold mb-2">Description</h2>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Comments */}
      <div>
        <h2 className="text-base font-semibold mb-4">
          Comments ({comments.length})
        </h2>

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-4">No comments yet.</p>
        ) : (
          <div className="space-y-4 mb-6">
            {comments.map((comment) => (
              <div key={comment.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    {comment.author_id}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
              </div>
            ))}
          </div>
        )}

        {canWrite && <AddCommentForm ticketId={ticket.id} />}
      </div>
    </div>
  );
}
