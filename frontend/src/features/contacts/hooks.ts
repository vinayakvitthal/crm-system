import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Contact, Company, TimelineItem } from './types';

function errMsg(err: unknown) {
  return (err as { detail?: string }).detail ?? 'Something went wrong';
}

// Contacts

export function useContacts(filters?: {
  name?: string;
  email?: string;
  company_id?: string;
  tags?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.name) params.set('name', filters.name);
  if (filters?.email) params.set('email', filters.email);
  if (filters?.company_id) params.set('company_id', filters.company_id);
  if (filters?.tags) params.set('tags', filters.tags);
  const qs = params.toString();

  return useQuery<Contact[]>({
    queryKey: ['contacts', filters],
    queryFn: () => api.get<Contact[]>(`/contacts/${qs ? `?${qs}` : ''}`),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useContact(id: string) {
  return useQuery<Contact>({
    queryKey: ['contacts', id],
    queryFn: () => api.get<Contact>(`/contacts/${id}`),
    enabled: !!id,
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Contact>) => api.post<Contact>('/contacts/', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['contacts'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Contact> & { id: string }) =>
      api.patch<Contact>(`/contacts/${id}`, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      void qc.invalidateQueries({ queryKey: ['contacts', vars.id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['contacts'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useContactTimeline(id: string) {
  return useQuery<TimelineItem[]>({
    queryKey: ['contacts', id, 'timeline'],
    queryFn: () => api.get<TimelineItem[]>(`/contacts/${id}/timeline`),
    enabled: !!id,
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

// Companies

export function useCompanies() {
  return useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => api.get<Company[]>('/companies/'),
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCompany(id: string) {
  return useQuery<Company>({
    queryKey: ['companies', id],
    queryFn: () => api.get<Company>(`/companies/${id}`),
    enabled: !!id,
    onError: (err: unknown) => toast.error(errMsg(err)),
  } as Parameters<typeof useQuery>[0]);
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Company>) => api.post<Company>('/companies/', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['companies'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Company> & { id: string }) =>
      api.patch<Company>(`/companies/${id}`, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      void qc.invalidateQueries({ queryKey: ['companies', vars.id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/companies/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['companies'] }); },
    onError: (err: unknown) => toast.error(errMsg(err)),
  });
}
