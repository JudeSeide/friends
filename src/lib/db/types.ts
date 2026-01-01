export interface Tag {
  id: string
  name: string
  count_per_period: number
  period_days: number
  color: string | null
  is_default: boolean
  sort_order: number
}

export interface Contact {
  id: string
  google_id: string | null
  name: string
  email: string | null
  phone: string | null
  photo_url: string | null
  tag_id: string | null
  last_checkin_at: number | null
  created_at: number
  updated_at: number
}

export interface Checkin {
  id: string
  contact_id: string
  checked_in_at: number
  note: string | null
  created_at: number
}

export interface ContactWithTag extends Contact {
  tag_name: string | null
  tag_color: string | null
  days_since_checkin: number | null
}

export type SettingKey =
  | 'google_access_token'
  | 'google_refresh_token'
  | 'google_token_expires_at'
  | 'last_sync_at'
  | 'notification_enabled'
  | 'notification_time'
  | 'next_notification_at'
