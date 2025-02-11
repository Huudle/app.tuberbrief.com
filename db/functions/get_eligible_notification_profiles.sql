CREATE OR REPLACE FUNCTION get_eligible_notification_profiles(channel_id_param text)
    RETURNS TABLE(
        profile_id uuid,
        email text,
        current_usage int,
        monthly_limit int
    )
    AS $$
BEGIN
    RETURN QUERY 
    WITH subscribed_profiles AS (
        -- Get all profiles subscribed to this channel
        SELECT
            pyc.profile_id,
            p.email,
            COALESCE(s.usage_count, 0) as usage_count,
            pl.monthly_email_limit as monthly_limit
        FROM
            profile_youtube_channels pyc
            JOIN profiles p ON pyc.profile_id = p.id
            JOIN subscriptions s ON p.id = s.profile_id
            JOIN plans pl ON s.plan_id = pl.id
        WHERE
            pyc.youtube_channel_id = channel_id_param
            AND s.status = 'active'
            AND s.usage_period = date_trunc('month', CURRENT_DATE)
    )
    SELECT
        sp.profile_id,
        sp.email,
        sp.usage_count as current_usage,
        sp.monthly_limit
    FROM
        subscribed_profiles sp
    WHERE
        sp.usage_count < sp.monthly_limit
        AND sp.email IS NOT NULL;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error getting eligible notification profiles: %', SQLERRM;
        RETURN;
END;
$$
LANGUAGE plpgsql;