import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSaveEmailCredential } from './hooks';

const schema = z.object({
  imap_host: z.string().min(1, 'IMAP host is required'),
  imap_port: z.coerce.number().int().min(1).max(65535, 'Port must be 1–65535'),
  smtp_host: z.string().min(1, 'SMTP host is required'),
  smtp_port: z.coerce.number().int().min(1).max(65535, 'Port must be 1–65535'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type CredentialForm = z.infer<typeof schema>;

export default function EmailCredentialForm({ onClose }: { onClose: () => void }) {
  const saveCredential = useSaveEmailCredential();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CredentialForm>({
    resolver: zodResolver(schema),
    defaultValues: { imap_port: 993, smtp_port: 587 },
  });

  const onSubmit = async (values: CredentialForm) => {
    try {
      await saveCredential.mutateAsync(values);
      onClose();
    } catch {
      // handled in hook via toast
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Email Settings</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="imap_host">IMAP Host</Label>
              <Input id="imap_host" {...register('imap_host')} placeholder="imap.example.com" />
              {errors.imap_host && (
                <p className="text-sm text-destructive">{errors.imap_host.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="imap_port">IMAP Port</Label>
              <Input id="imap_port" type="number" {...register('imap_port')} />
              {errors.imap_port && (
                <p className="text-sm text-destructive">{errors.imap_port.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input id="smtp_host" {...register('smtp_host')} placeholder="smtp.example.com" />
              {errors.smtp_host && (
                <p className="text-sm text-destructive">{errors.smtp_host.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="smtp_port">SMTP Port</Label>
              <Input id="smtp_port" type="number" {...register('smtp_port')} />
              {errors.smtp_port && (
                <p className="text-sm text-destructive">{errors.smtp_port.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="username">Username / Email</Label>
            <Input id="username" {...register('username')} placeholder="you@example.com" />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register('password')} />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
