import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCompany, useContacts } from './hooks';
import CompanyFormModal from './CompanyFormModal';
import { Button } from '@/components/ui/button';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);

  const { data: company, isLoading, isError } = useCompany(id ?? '');
  const { data: contacts = [] } = useContacts({ company_id: id });

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="p-8">
        <p className="text-destructive">Company not found.</p>
        <Link to="/companies" className="text-primary hover:underline text-sm mt-2 inline-block">
          ← Back to Companies
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/companies" className="text-primary hover:underline text-sm mb-4 inline-block">
        ← Back to Companies
      </Link>

      <div className="flex items-start justify-between mb-6">
        <h1 className="text-2xl font-bold">{company.name}</h1>
        <Button variant="outline" onClick={() => setShowEdit(true)}>
          Edit
        </Button>
      </div>

      <div className="space-y-2 text-sm mb-8">
        <div>
          <span className="text-muted-foreground">Website: </span>
          {company.website ? (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {company.website}
            </a>
          ) : '—'}
        </div>
        <div>
          <span className="text-muted-foreground">Industry: </span>
          {company.industry ?? '—'}
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Contacts</h2>
      {contacts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No contacts for this company.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Name</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Email</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Phone</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showEdit && (
        <CompanyFormModal company={company} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}
