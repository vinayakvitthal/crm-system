import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useLeads, useCreateLead, useUpdateLead } from './hooks';
import LeadConvertModal from '@/features/contacts/LeadConvertModal';
import type { Lead } from './types';

const STATUS_COLORS: Record<Lead['status'], string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  contacted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  qualified: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  disqualified: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  source: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

function CreateLeadModal({ onClose }: { onClose: () => void }) {
  const createLead = useCreateLead();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const onSubmit = async (values: CreateForm) => {
    try {
      await createLead.mutateAsync({ ...values, source: values.source || undefined });
      onClose();
    } catch {
      // handled in hook
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">New Lead</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="source">Source (optional)</Label>
            <Input id="source" {...register('source')} placeholder="e.g. website, referral" />
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

function UpdateStatusModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const updateLead = useUpdateLead();
  const [status, setStatus] = useState<Lead['status']>(lead.status);

  const handleSave = async () => {
    try {
      await updateLead.mutateAsync({ id: lead.id, status });
      onClose();
    } catch {
      // handled in hook
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Update Status</h2>
        <div className="space-y-1 mb-4">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Lead['status'])}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="disqualified">Disqualified</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleSave()}>Save</Button>
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { user } = useAuth();
  const { data: leads, isLoading, isError } = useLeads();
  const [showCreate, setShowCreate] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [convertLeadId, setConvertLeadId] = useState<string | null>(null);

  const canWrite = user?.role === 'admin' || user?.role === 'sales_rep';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leads</h1>
        {canWrite && (
          <Button onClick={() => setShowCreate(true)}>New Lead</Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}
      {isError && (
        <p className="text-destructive py-4">Failed to load leads.</p>
      )}
      {!isLoading && !isError && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Name</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Email</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Status</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Source</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Created</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => (
              <tr key={lead.id}>
                <td className="py-3 px-4 border-b font-medium">{lead.name}</td>
                <td className="py-3 px-4 border-b">{lead.email}</td>
                <td className="py-3 px-4 border-b">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="py-3 px-4 border-b">{lead.source ?? '—'}</td>
                <td className="py-3 px-4 border-b">
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 border-b">
                  <div className="flex gap-2">
                    {canWrite && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditLead(lead)}>
                          Status
                        </Button>
                        {!lead.converted_at && (
                          <Button size="sm" variant="outline" onClick={() => setConvertLeadId(lead.id)}>
                            Convert
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(leads ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} />}
      {editLead && <UpdateStatusModal lead={editLead} onClose={() => setEditLead(null)} />}
      {convertLeadId && (
        <LeadConvertModal leadId={convertLeadId} onClose={() => setConvertLeadId(null)} />
      )}
    </div>
  );
}
