import { useState } from 'react';
import { EmailInbox, EmailCredentialForm } from '@/features/email';
import { Button } from '@/components/ui/button';

export default function EmailPage() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <h1 className="text-xl font-bold">Email</h1>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
          Settings
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <EmailInbox />
      </div>
      {showSettings && <EmailCredentialForm onClose={() => setShowSettings(false)} />}
    </div>
  );
}
