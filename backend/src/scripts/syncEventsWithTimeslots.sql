-- ============================================================================
-- Script: Sync Calendar Events with Timeslots
-- Description: Updates future scheduled events to match their timeslot configuration
--
-- Usage:
--   psql -U postgres -d nomi_education -f src/scripts/syncEventsWithTimeslots.sql
--
-- Or from within psql:
--   \i src/scripts/syncEventsWithTimeslots.sql
--
-- Safety: Only affects future scheduled events (status = 'scheduled')
-- ============================================================================

\echo '============================================================================'
\echo 'Starting sync of calendar events with timeslots...'
\echo '============================================================================'
\echo ''

-- Start transaction for safety
BEGIN;

-- Create temporary table to track changes
CREATE TEMP TABLE sync_changes (
    event_id UUID,
    timeslot_id UUID,
    field_name VARCHAR(50),
    old_value TEXT,
    new_value TEXT
);

-- Track start_time changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'start_time',
    e.start_time::TEXT,
    t.start_time::TEXT
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND e.start_time != t.start_time;

-- Track end_time changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'end_time',
    e.end_time::TEXT,
    t.end_time::TEXT
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND e.end_time != t.end_time;

-- Track room_id changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'room_id',
    COALESCE(e.room_id::TEXT, 'NULL'),
    COALESCE(t.room_id::TEXT, 'NULL')
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.room_id IS DISTINCT FROM t.room_id);

-- Track teacher_id changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'teacher_id',
    COALESCE(e.teacher_id::TEXT, 'NULL'),
    COALESCE(t.teacher_id::TEXT, 'NULL')
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teacher_id IS DISTINCT FROM t.teacher_id);

-- Track class_type changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'class_type',
    e.class_type,
    t.class_type
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND e.class_type != t.class_type;

-- Track teams_meeting_id changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'teams_meeting_id',
    COALESCE(e.teams_meeting_id, 'NULL'),
    COALESCE(t.teams_meeting_id, 'NULL')
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teams_meeting_id IS DISTINCT FROM t.teams_meeting_id);

-- Track teams_meeting_url changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'teams_meeting_url',
    COALESCE(e.teams_meeting_url, 'NULL'),
    COALESCE(t.teams_meeting_url, 'NULL')
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teams_meeting_url IS DISTINCT FROM t.teams_meeting_url);

-- Track teams_created_by changes
INSERT INTO sync_changes (event_id, timeslot_id, field_name, old_value, new_value)
SELECT
    e.id,
    e.timeslot_id,
    'teams_created_by',
    COALESCE(e.teams_created_by::TEXT, 'NULL'),
    COALESCE(t.teams_created_by::TEXT, 'NULL')
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teams_created_by IS DISTINCT FROM t.teams_created_by);

-- Show summary before applying changes
\echo '--- Summary of Changes ---'
\echo ''

-- Count events to be updated
SELECT
    COUNT(DISTINCT event_id) AS events_to_update,
    COUNT(*) AS total_field_changes
FROM sync_changes;

\echo ''
\echo '--- Changes by Field ---'
\echo ''

-- Group by field
SELECT
    field_name,
    COUNT(*) AS change_count
FROM sync_changes
GROUP BY field_name
ORDER BY field_name;

\echo ''
\echo '--- Detailed Changes ---'
\echo ''

-- Show all changes
SELECT
    event_id,
    timeslot_id,
    field_name,
    old_value AS old,
    new_value AS new
FROM sync_changes
ORDER BY event_id, field_name;

\echo ''
\echo '--- Applying Updates ---'
\echo ''

-- Update start_time
UPDATE course_events e
SET
    start_time = t.start_time,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND e.start_time != t.start_time;

\echo 'Updated start_time'

-- Update end_time
UPDATE course_events e
SET
    end_time = t.end_time,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND e.end_time != t.end_time;

\echo 'Updated end_time'

-- Update room_id
UPDATE course_events e
SET
    room_id = t.room_id,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.room_id IS DISTINCT FROM t.room_id);

\echo 'Updated room_id'

-- Update teacher_id
UPDATE course_events e
SET
    teacher_id = t.teacher_id,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teacher_id IS DISTINCT FROM t.teacher_id);

\echo 'Updated teacher_id'

-- Update class_type
UPDATE course_events e
SET
    class_type = t.class_type,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND e.class_type != t.class_type;

\echo 'Updated class_type'

-- Update teams_meeting_id
UPDATE course_events e
SET
    teams_meeting_id = t.teams_meeting_id,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teams_meeting_id IS DISTINCT FROM t.teams_meeting_id);

\echo 'Updated teams_meeting_id'

-- Update teams_meeting_url
UPDATE course_events e
SET
    teams_meeting_url = t.teams_meeting_url,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teams_meeting_url IS DISTINCT FROM t.teams_meeting_url);

\echo 'Updated teams_meeting_url'

-- Update teams_created_by
UPDATE course_events e
SET
    teams_created_by = t.teams_created_by,
    updated_at = NOW()
FROM course_timeslots t
WHERE e.timeslot_id = t.id
    AND e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (e.teams_created_by IS DISTINCT FROM t.teams_created_by);

\echo 'Updated teams_created_by'

\echo ''
\echo '--- Verification ---'
\echo ''

-- Verify sync is complete
SELECT
    COUNT(*) AS remaining_mismatches
FROM course_events e
JOIN course_timeslots t ON e.timeslot_id = t.id
WHERE e.timeslot_id IS NOT NULL
    AND e.event_date >= CURRENT_DATE
    AND e.status = 'scheduled'
    AND (
        e.start_time != t.start_time
        OR e.end_time != t.end_time
        OR (e.room_id IS DISTINCT FROM t.room_id)
        OR (e.teacher_id IS DISTINCT FROM t.teacher_id)
        OR e.class_type != t.class_type
        OR (e.teams_meeting_id IS DISTINCT FROM t.teams_meeting_id)
        OR (e.teams_meeting_url IS DISTINCT FROM t.teams_meeting_url)
        OR (e.teams_created_by IS DISTINCT FROM t.teams_created_by)
    );

\echo ''
\echo '============================================================================'
\echo 'Sync completed successfully!'
\echo ''
\echo 'IMPORTANT: Review the changes above before committing.'
\echo 'Type COMMIT to save changes or ROLLBACK to cancel.'
\echo '============================================================================'

-- Leave transaction open for user to review and commit/rollback
-- User must manually type COMMIT; or ROLLBACK;
