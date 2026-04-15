import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useContacts, useDeleteContact, useCompanies } from './hooks';
import ContactFormModal from './ContactFormModal';
import type { Contact } from './types';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

export default function ContactListPage() {
  const [nameInput, setNameInput] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<Contact | undefined>();

  // Debounce name filter
  useEffect(() => {
    const t = setTimeout(() => setName(nameInput), 300);
    return () => clearTimeout(t);
  }, [nameInput]);

  const { data: contacts, isLoading, isError } = useContacts({
    name: name || undefined,
    email: email || undefined,
    company_id: companyId || undefined,
  });
  const { data: companies = [] } = useCompanies();
  const deleteContact = useDeleteContact();

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this contact?')) {
      void deleteContact.mutate(id);
    }
  };

  const companyName = (id?: string) =>
    id ? (companies.find((c) => c.id === id)?.name ?? '—') : '—';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <Button onClick={() => { setEditContact(undefined); setShowModal(true); }}>
          New Contact
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <Input
          placeholder="Search by name…"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by email…"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="text-destructive py-4">Failed to load contacts.</p>
      )}
      {!isLoading && !isError && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Name</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Email</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Phone</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Company</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Tags</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(contacts ?? []).map((contact) => (
              <tr key={contact.id}>
                <td className="py-3 px-4 border-b">
                  <Link
                    to={`/contacts/${contact.id}`}
                    className="text-primary hover:underline"
                  >
                    {contact.first_name} {contact.last_name}
                  </Link>
                </td>
                <td className="py-3 px-4 border-b">{contact.email}</td>
                <td className="py-3 px-4 border-b">{contact.phone ?? '—'}</td>
                <td className="py-3 px-4 border-b">{companyName(contact.company_id)}</td>
                <td className="py-3 px-4 border-b">
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4 border-b">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditContact(contact); setShowModal(true); }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(contact.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {(contacts ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No contacts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showModal && (
        <ContactFormModal
          contact={editContact}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
