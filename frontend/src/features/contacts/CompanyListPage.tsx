import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCompanies, useDeleteCompany } from './hooks';
import CompanyFormModal from './CompanyFormModal';
import type { Company } from './types';

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
}

export default function CompanyListPage() {
  const [showModal, setShowModal] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | undefined>();

  const { data: companies, isLoading, isError } = useCompanies();
  const deleteCompany = useDeleteCompany();

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this company?')) {
      void deleteCompany.mutate(id);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Companies</h1>
        <Button onClick={() => { setEditCompany(undefined); setShowModal(true); }}>
          New Company
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="text-destructive py-4">Failed to load companies.</p>
      )}
      {!isLoading && !isError && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Name</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Website</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Industry</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(companies ?? []).map((company) => (
              <tr key={company.id}>
                <td className="py-3 px-4 border-b">
                  <Link
                    to={`/companies/${company.id}`}
                    className="text-primary hover:underline"
                  >
                    {company.name}
                  </Link>
                </td>
                <td className="py-3 px-4 border-b">
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
                </td>
                <td className="py-3 px-4 border-b">{company.industry ?? '—'}</td>
                <td className="py-3 px-4 border-b">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditCompany(company); setShowModal(true); }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(company.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {(companies ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No companies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showModal && (
        <CompanyFormModal
          company={editCompany}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
