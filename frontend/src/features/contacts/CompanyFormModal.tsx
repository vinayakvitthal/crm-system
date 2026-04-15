import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateCompany, useUpdateCompany } from './hooks';
import type { Company } from './types';

const schema = z.object({
  name: z.string().min(1, 'Company name is required'),
  website: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  industry: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  company?: Company;
  onClose: () => void;
}

export default function CompanyFormModal({ company, onClose }: Props) {
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: company
      ? {
          name: company.name,
          website: company.website ?? '',
          industry: company.industry ?? '',
        }
      : {},
  });

  const onSubmit = async (values: FormValues) => {
    const payload = {
      ...values,
      website: values.website || undefined,
      industry: values.industry || undefined,
    };
    try {
      if (company) {
        await updateCompany.mutateAsync({ id: company.id, ...payload });
      } else {
        await createCompany.mutateAsync(payload);
      }
      onClose();
    } catch {
      // errors handled in hooks via toast
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">
          {company ? 'Edit Company' : 'New Company'}
        </h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Company Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="website">Website</Label>
            <Input id="website" placeholder="https://example.com" {...register('website')} />
            {errors.website && (
              <p className="text-sm text-destructive">{errors.website.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" {...register('industry')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {company ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
