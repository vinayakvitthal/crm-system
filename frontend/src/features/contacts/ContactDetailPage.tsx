import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useContact, useContactTimeline, useCompany } from './hooks';
import ContactFormModal from './ContactFormModal';
import { Button } from '@/components/ui/button';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

const typeBadgeClass: Record<string, string> = {
  activity: 'bg-blue-100 text-blue-700',
  deal: 'bg-green-100 text-green-700',
  ticket: 'bg-orange-100 text-orange-700',
  email_thread: 'bg-purple-100 text-purple-700',
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);

  const { data: contact, isLoading, isError } = useContact(id ?? '');
  const { data: timeline = [] } = useContactTimeline(id ?? '');
  const { data: company } = useCompany(contact?.company_id ?? '');

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="p-8">
        <p className="text-destructive">Contact not found.</p>
        <Link to="/contacts" className="text-primary hover:underline text-sm mt-2 inline-block">
          ← Back to Contacts
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/contacts" className="text-primary hover:underline text-sm mb-4 inline-block">
        ← Back to Contacts
      </Link>

      <div className="flex items-start justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {contact.first_name} {contact.last_name}
        </h1>
        <Button variant="outline" onClick={() => setShowEdit(true)}>
          Edit
        </Button>
      </div>

      <div className="space-y-2 text-sm mb-8">
        <div>
          <span className="text-muted-foreground">Email: </span>
          {contact.email}
        </div>
        <div>
          <span className="text-muted-foreground">Phone: </span>
          {contact.phone ?? '—'}
        </div>
        <div>
          <span className="text-muted-foreground">Company: </span>
          {company ? (
            <Link to={`/companies/${company.id}`} className="text-primary hover:underline">
              {company.name}
            </Link>
          ) : '—'}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">Tags: </span>
          {contact.tags.length > 0
            ? contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                >
                  {tag}
                </span>
              ))
            : '—'}
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Timeline</h2>
      {timeline.length === 0 ? (
        <p className="text-muted-foreground text-sm">No timeline items yet.</p>
      ) : (
        <div className="space-y-3">
          {timeline.map((item) => (
            <div key={item.id} className="flex gap-3 items-start border-b pb-3">
              <span
                className={`px-2 py-0.5 text-xs rounded-full font-medium ${typeBadgeClass[item.type] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {item.type.replace('_', ' ')}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{item.subject}</p>
                {item.detail && (
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(item.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {showEdit && (
        <ContactFormModal contact={contact} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}
