export interface EmailThread {
  id: string;
  subject: string;
  last_message_at: string;
  contact_id?: string;
  deal_id?: string;
  ticket_id?: string;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  message_id: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  body_text: string;
  body_html?: string;
  sent_at: string;
  direction: 'inbound' | 'outbound';
  owner_id: string;
}

export interface EmailCredential {
  id: string;
  user_id: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
}
