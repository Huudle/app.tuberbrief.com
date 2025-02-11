create table
  public.email_notifications (
    id uuid not null default extensions.uuid_generate_v4 (),
    profile_id uuid null,
    channel_id text null,
    video_id text not null,
    email_content text not null,
    status text not null default 'pending'::text,
    created_at timestamp with time zone null default now(),
    sent_at timestamp with time zone null,
    title text null,
    constraint email_notifications_pkey primary key (id),
    constraint email_notifications_channel_id_fkey foreign key (channel_id) references youtube_channels (id) on delete cascade,
    constraint email_notifications_profile_id_fkey foreign key (profile_id) references profiles (id) on delete cascade,
    constraint email_notifications_video_id_fkey foreign key (video_id) references video_captions (video_id)
  ) tablespace pg_default;


  create table
  public.profile_youtube_channels (
    id uuid not null default gen_random_uuid (),
    created_at timestamp with time zone not null default now(),
    profile_id uuid not null,
    youtube_channel_id text not null,
    subscribed_at timestamp with time zone null,
    callback_url text null,
    constraint profile_youtube_channels_pkey primary key (id),
    constraint profile_youtube_channels_profile_id_youtube_channel_id_key unique (profile_id, youtube_channel_id),
    constraint profile_youtube_channels_profile_id_fkey foreign key (profile_id) references profiles (id) on delete cascade,
    constraint profile_youtube_channels_youtube_channel_id_fkey foreign key (youtube_channel_id) references youtube_channels (id)
  ) tablespace pg_default;

  create table
  public.profiles (
    id uuid not null,
    updated_at timestamp with time zone null default now(),
    first_name text null,
    last_name text null,
    plan text not null default 'free'::text,
    email text null,
    constraint profiles_pkey primary key (id),
    constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade
  ) tablespace pg_default;

  create table
  public.video_ai_content (
    video_id text not null,
    content jsonb null,
    model text null,
    created_at timestamp with time zone null default timezone ('utc'::text, now()),
    constraint video_ai_content_pkey primary key (video_id)
  ) tablespace pg_default;

  create table
  public.video_captions (
    video_id text not null,
    transcript text null,
    language text null default 'en'::text,
    created_at timestamp with time zone null default now(),
    updated_at timestamp with time zone null default now(),
    title text null,
    constraint video_captions_pkey primary key (video_id)
  ) tablespace pg_default;

  create table
  public.youtube_channels (
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
  ) tablespace pg_default;

create table public.plans (
  id uuid not null default gen_random_uuid (),
  plan_name text not null,
  monthly_email_limit integer not null default 100,
  monthly_cost numeric(10, 2) not null default 0,
  created_at timestamp with time zone not null default now(),
  is_active boolean not null default true,
  features jsonb null,
  stripe_price_id text null,
  constraint plans_pkey primary key (id),
  constraint plans_stripe_price_id_key unique (stripe_price_id)
) TABLESPACE pg_default;


create table public.subscriptions (
  id uuid not null default gen_random_uuid (),
  profile_id uuid not null,
  plan_id uuid not null,
  usage_count integer not null default 0,
  usage_period date not null default date_trunc(
    'month'::text,
    (CURRENT_DATE)::timestamp with time zone
  ),
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