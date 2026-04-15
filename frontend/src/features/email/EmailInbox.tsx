import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useEmailThreads, useEmailThread, useSendEmail, useReplyEmail } from './hooks';
import type { EmailThread, EmailMessage } from './types';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

// ── Compose Modal ──────────────────────────────────────────────────────────

const composeSchema = z.object({
  to: z.string().email('Valid email required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
});
type ComposeForm = z.infer<typeof composeSchema>;

function ComposeModal({ onClose }: { onClose: () => void }) {
  const sendEmail = useSendEmail();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
  });

  const onSubmit = async (values: ComposeForm) => {
    try {
      await sendEmail.mutateAsync(values);
      onClose();
    } catch {
      // handled in hook
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">New Email</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="to">To</Label>
            <input
              id="to"
              {...register('to')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="recipient@example.com"
            />
            {errors.to && <p className="text-sm text-destructive">{errors.to.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="subject">Subject</Label>
            <input
              id="subject"
              {...register('subject')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {errors.subject && <p className="text-sm text-destructive">{errors.subject.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="body">Body</Label>
            <textarea
              id="body"
              {...register('body')}
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Send</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Thread Detail ──────────────────────────────────────────────────────────

function ThreadDetail({ threadId }: { threadId: string }) {
  const [showReply, setShowReply] = useState(false);
  const replyEmail = useReplyEmail();
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);

  const { data: messages, isLoading } = useEmailThread(threadId);

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setReplying(true);
    try {
      await replyEmail.mutateAsync({ thread_id: threadId, body: replyBody });
      setReplyBody('');
      setShowReply(false);
    } catch {
      // handled in hook
    } finally {
      setReplying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {(messages ?? []).map((msg: EmailMessage) => (
          <div key={msg.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{msg.from_address}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    msg.direction === 'inbound'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {msg.direction}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(msg.sent_at).toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap">{msg.body_text}</p>
          </div>
        ))}
        {(messages ?? []).length === 0 && (
          <p className="text-center text-muted-foreground py-8">No messages in this thread.</p>
        )}
      </div>

      <div className="border-t p-4">
        {showReply ? (
          <div className="space-y-2">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={4}
              placeholder="Write your reply..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowReply(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleReply} disabled={replying}>
                Send Reply
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowReply(true)}>
            Reply
          </Button>
        )}
      </div>
    </div>
  );
}

// ── EmailInbox ─────────────────────────────────────────────────────────────

export default function EmailInbox() {
  const { user } = useAuth();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  const { data: threads, isLoading, isError } = useEmailThreads();

  if (user?.role === 'viewer') {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">You don't have access to email features.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left panel — thread list */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Inbox</h2>
          <Button size="sm" onClick={() => setShowCompose(true)}>Compose</Button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {isError && (
          <p className="text-destructive text-sm p-4">Failed to load inbox.</p>
        )}
        {!isLoading && !isError && (
          <div className="flex-1 overflow-y-auto">
            {(threads ?? []).length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No threads.</p>
            )}
            {(threads ?? []).map((thread: EmailThread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors ${
                  selectedThreadId === thread.id ? 'bg-muted' : ''
                }`}
              >
                <p className="font-medium text-sm truncate">{thread.subject}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(thread.last_message_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right panel — thread detail */}
      <div className="flex-1 overflow-hidden">
        {selectedThreadId ? (
          <ThreadDetail threadId={selectedThreadId} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a thread to view messages
          </div>
        )}
      </div>

      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} />}
    </div>
  );
}
