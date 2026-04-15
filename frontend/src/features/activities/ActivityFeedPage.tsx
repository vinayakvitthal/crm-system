import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useActivities, useCreateActivity } from './hooks';
import type { Activity, ActivityType } from './types';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

const TYPE_COLORS: Record<ActivityType, string> = {
  call: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  meeting: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  note: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  task: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  email_logged: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const createSchema = z
  .object({
    type: z.enum(['call', 'meeting', 'note', 'task', 'email_logged']),
    subject: z.string().min(1, 'Subject is required'),
    body: z.string().optional(),
    due_at: z.string().optional(),
    contact_id: z.string().optional(),
    deal_id: z.string().optional(),
    ticket_id: z.string().optional(),
  })
  .refine(
    (d) => !!(d.contact_id || d.deal_id || d.ticket_id),
    { message: 'At least one entity link (contact, deal, or ticket) is required', path: ['contact_id'] }
  );

type CreateForm = z.infer<typeof createSchema>;

function CreateActivityModal({ onClose }: { onClose: () => void }) {
  const createActivity = useCreateActivity();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { type: 'call' },
  });

  const onSubmit = async (values: CreateForm) => {
    try {
      const payload: Partial<CreateForm> = { ...values };
      if (!payload.body) delete payload.body;
      if (!payload.due_at) delete payload.due_at;
      if (!payload.contact_id) delete payload.contact_id;
      if (!payload.deal_id) delete payload.deal_id;
      if (!payload.ticket_id) delete payload.ticket_id;
      await createActivity.mutateAsync(payload);
      onClose();
    } catch {
      // handled in hook via toast
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Log Activity</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              {...register('type')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="note">Note</option>
              <option value="task">Task</option>
              <option value="email_logged">Email Logged</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" {...register('subject')} />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="body">Body</Label>
            <textarea
              id="body"
              {...register('body')}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="due_at">Due At (optional)</Label>
            <Input id="due_at" type="datetime-local" {...register('due_at')} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Entity Links (at least one required)</p>
            {errors.contact_id && (
              <p className="text-sm text-destructive">{errors.contact_id.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact_id">Contact ID</Label>
            <Input id="contact_id" {...register('contact_id')} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="deal_id">Deal ID</Label>
            <Input id="deal_id" {...register('deal_id')} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticket_id">Ticket ID</Label>
            <Input id="ticket_id" {...register('ticket_id')} placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Log Activity
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ActivityFeedPage() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const { data: activities, isLoading, isError } = useActivities();

  const canWrite =
    user?.role === 'admin' ||
    user?.role === 'sales_rep' ||
    user?.role === 'support_agent';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Activities</h1>
        {canWrite && (
          <Button onClick={() => setShowCreate(true)}>Log Activity</Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="text-destructive py-4">Failed to load activities.</p>
      )}
      {!isLoading && !isError && (
        <div className="space-y-2">
          {(activities ?? []).length === 0 && (
            <p className="text-center text-muted-foreground py-8">No activities yet.</p>
          )}
          {(activities ?? []).map((activity: Activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
            >
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TYPE_COLORS[activity.type]}`}
              >
                {activity.type.replace('_', ' ')}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{activity.subject}</p>
                {activity.body && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{activity.body}</p>
                )}
                <div className="flex gap-2 mt-1 flex-wrap">
                  {activity.contact_id && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      Contact: {activity.contact_id}
                    </span>
                  )}
                  {activity.deal_id && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      Deal: {activity.deal_id}
                    </span>
                  )}
                  {activity.ticket_id && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      Ticket: {activity.ticket_id}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(activity.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateActivityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
