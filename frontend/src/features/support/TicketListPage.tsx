import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useTickets, useCreateTicket } from './hooks';
import type { Ticket, TicketStatus, TicketPriority } from './types';

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

// ── Create Ticket Modal ────────────────────────────────────────────────────

const createSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
});
type CreateForm = z.infer<typeof createSchema>;

function CreateTicketModal({ onClose }: { onClose: () => void }) {
  const createTicket = useCreateTicket();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { priority: 'medium' },
  });

  const onSubmit = async (values: CreateForm) => {
    try {
      await createTicket.mutateAsync(values);
      onClose();
    } catch {
      // handled in hook via toast
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">New Ticket</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" {...register('subject')} />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              {...register('description')}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="priority">Priority</Label>
            <select
              id="priority"
              {...register('priority')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TicketListPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const canWrite = user?.role === 'admin' || user?.role === 'support_agent';

  const { data: tickets, isLoading, isError } = useTickets({
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        {canWrite && (
          <Button onClick={() => setShowCreate(true)}>New Ticket</Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="text-destructive py-4">Failed to load tickets.</p>
      )}
      {!isLoading && !isError && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Subject</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Status</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Priority</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Created</th>
            </tr>
          </thead>
          <tbody>
            {(tickets ?? []).map((ticket: Ticket) => (
              <tr key={ticket.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 border-b">
                  <Link
                    to={`/tickets/${ticket.id}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {ticket.subject}
                  </Link>
                </td>
                <td className="py-3 px-4 border-b">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ticket.status]}`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 border-b">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="py-3 px-4 border-b text-muted-foreground">
                  {new Date(ticket.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {(tickets ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No tickets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showCreate && <CreateTicketModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
