export type ActivityType = 'call' | 'meeting' | 'note' | 'task' | 'email_logged';

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string;
  body?: string;
  due_at?: string;
  completed_at?: string;
  owner_id: string;
  contact_id?: string;
  deal_id?: string;
  ticket_id?: string;
  created_at: string;
}
