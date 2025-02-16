CREATE OR REPLACE FUNCTION get_eligible_notification_profiles(channel_id_param text)
    RETURNS TABLE(
        profile_id uuid,
        email text,
        current_usage int,
        monthly_limit int
    )
    AS $$
BEGIN
    RETURN QUERY WITH subscribed_profiles AS(
        -- Get all profiles subscribed to this channel
        SELECT
            pyc.profile_id,
            p.email,
            coalesce(s.usage_count, 0) AS usage_count,
            pl.monthly_email_limit AS monthly_limit
        FROM
            profiles_youtube_channels pyc
            JOIN profiles p ON pyc.profile_id = p.id
            JOIN subscriptions s ON p.id = s.profile_id
            JOIN plans pl ON s.plan_id = pl.id
        WHERE
            pyc.youtube_channel_id = channel_id_param
            AND s.status = 'active'
            AND CURRENT_TIMESTAMP >= s.start_date
            AND(s.end_date IS NULL
                OR CURRENT_TIMESTAMP <= s.end_date))
    SELECT
        sp.profile_id,
        sp.email,
        sp.usage_count AS current_usage,
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

