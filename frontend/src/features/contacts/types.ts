export interface Company {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  owner_id: string;
  created_at: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company_id?: string;
  owner_id: string;
  tags: string[];
  created_at: string;
}

export interface TimelineItem {
  id: string;
  type: 'activity' | 'deal' | 'ticket' | 'email_thread';
  subject: string;
  timestamp: string;
  detail?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
}

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
}
