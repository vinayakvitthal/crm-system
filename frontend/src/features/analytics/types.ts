export interface KPIs {
  total_contacts: number;
  open_deals: number;
  open_tickets: number;
  activities_count: number;
}

export interface FunnelStage {
  stage_id: string;
  stage_name: string;
  deal_count: number;
  total_value: number;
}

export interface VelocityStage {
  stage_id: string;
  stage_name: string;
  avg_days: number;
}

export interface TicketResolution {
  avg_resolution_hours: number | null;
  resolved_count: number;
}

export interface ActivityBreakdownItem {
  type: string;
  count: number;
}

export type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  from?: string;
  to?: string;
}
