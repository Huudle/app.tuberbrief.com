create table public.notification_emails (
  id uuid not null default extensions.uuid_generate_v4 (),
  profile_id uuid null,
  channel_id text null,
  video_id text not null,
  email_content text not null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone null default now(),
  sent_at timestamp with time zone null,
  title text null,
  constraint notification_emails_pkey primary key (id),
  constraint notification_emails_channel_id_fkey foreign KEY (channel_id) references youtube_channels (id) on delete CASCADE,
  constraint notification_emails_profile_id_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE,
  constraint notification_emails_video_id_fkey foreign KEY (video_id) references video_captions (video_id)
) TABLESPACE pg_default;

create table public.notification_limit_alerts (
  id uuid not null default gen_random_uuid (),
  profile_id uuid not null,
  alert_type text not null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone null default now(),
  sent_at timestamp with time zone null,
  email_content text null,
  constraint notification_limit_alerts_pkey primary key (id),
  constraint notification_limit_alerts_profile_id_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE,
  constraint notification_limit_alerts_alert_type_check check (
    (
      alert_type = any (
        array['limit_reached'::text, 'monthly_reset'::text]
      )
    )
  ),
  constraint notification_limit_alerts_status_check check (
    (
      status = any (
        array['pending'::text, 'sent'::text, 'failed'::text]
      )
    )
  )
) TABLESPACE pg_default;

create table public.notification_alert_logs (
  profile_id uuid not null,
  alert_type text not null,
  sent_at timestamp with time zone null default now(),
  constraint notification_alert_logs_profile_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE,
  constraint notification_alert_logs_alert_type_check check (
    (
      alert_type = any (
        array['limit_reached'::text, 'monthly_reset'::text]
      )
    )
  )
) TABLESPACE pg_default;

create table public.plans (
  id uuid not null default gen_random_uuid (),
  plan_name text not null,
  monthly_email_limit integer not null default 100,
  monthly_cost numeric(10, 2) not null default 0,
  created_at timestamp with time zone not null default now(),
  is_active boolean not null default true,
  features jsonb null,
  stripe_price_id text null,
  channel_limit integer not null default 3,
  constraint plans_pkey primary key (id),
  constraint plans_stripe_price_id_key unique (stripe_price_id)
) TABLESPACE pg_default;

create index IF not exists idx_plans_id on public.plans using btree (id) TABLESPACE pg_default;

create table public.profiles_youtube_channels (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  profile_id uuid not null,
  youtube_channel_id text not null,
  subscribed_at timestamp with time zone null,
  callback_url text null,
  constraint profiles_youtube_channels_pkey primary key (id),
  constraint profiles_youtube_channels_profile_id_youtube_channel_id_key unique (profile_id, youtube_channel_id),
  constraint profiles_youtube_channels_profile_id_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE,
  constraint profiles_youtube_channels_youtube_channel_id_fkey foreign KEY (youtube_channel_id) references youtube_channels (id)
) TABLESPACE pg_default;

create table public.profiles (
  id uuid not null,
  updated_at timestamp with time zone null default now(),
  first_name text null,
  last_name text null,
  plan text not null default 'free'::text,
  email text null,
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.subscription_usage_logs (
  id uuid not null default gen_random_uuid (),
  profile_id uuid not null,
  usage_count integer not null,
  monthly_limit integer not null,
  recorded_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  constraint subscription_usage_logs_pkey primary key (id),
  constraint subscription_usage_logs_profile_recorded_idx unique (profile_id, recorded_at),
  constraint subscription_usage_logs_profile_id_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.subscriptions (
  id uuid not null default gen_random_uuid (),
  profile_id uuid not null,
  plan_id uuid not null,
  usage_count integer not null default 0,
  start_date timestamp with time zone not null default now(),
  end_date timestamp with time zone null,
  status text not null default 'active'::text,
  stripe_subscription_id text null,
  stripe_customer_id text null,
  constraint subscriptions_pkey primary key (id),
  constraint one_active_subscription_per_profile unique (profile_id),
  constraint subscriptions_plan_id_fkey foreign KEY (plan_id) references plans (id),
  constraint subscriptions_profile_id_fkey foreign KEY (profile_id) references profiles (id) on delete CASCADE,
  constraint valid_status check (
    (
      status = any (
        array[
          'active'::text,
          'cancelled'::text,
          'expired'::text,
          'suspended'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create table public.video_ai_content (
create table public.video_ai_data (
  video_id text not null,
  content jsonb null,
  model text null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint video_ai_data_pkey primary key (video_id)
) TABLESPACE pg_default;

create table public.video_captions (
  video_id text not null,
  transcript text null,
  language text null default 'en'::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  title text null,
  constraint video_captions_pkey primary key (video_id)
) TABLESPACE pg_default;

create table public.youtube_channels (
  id text not null,
  title text null,
  thumbnail text null,
  subscriber_count bigint not null,
  last_video_id text null,
  last_video_date timestamp with time zone null,
  custom_url text null,
  identifier text null,
  processing_status text null default 'pending'::text,
  last_sync_at timestamp with time zone null default now(),
  sync_error text null,
  constraint youtube_channels_pkey primary key (id)
) TABLESPACE pg_default;