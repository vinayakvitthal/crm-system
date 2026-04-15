export interface Lead {
  id: string;
  name: string;
  email: string;
  source?: string;
  status: 'new' | 'contacted' | 'qualified' | 'disqualified';
  owner_id: string;
  created_at: string;
  converted_at?: string;
  converted_contact_id?: string;
  converted_deal_id?: string;
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

export interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  pipeline_id: string;
  stage_id: string;
  stage_entered_at: string;
  expected_close_date?: string;
  status: 'open' | 'won' | 'lost';
  won_lost_reason?: string;
  contact_id?: string;
  company_id?: string;
  owner_id: string;
  created_at: string;
}
