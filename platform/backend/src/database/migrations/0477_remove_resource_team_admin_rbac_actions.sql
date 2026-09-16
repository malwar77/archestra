-- Remove legacy `team-admin` actions from all resource keys in custom roles.
-- Resource-level team administration is now governed by literal team membership roles.

WITH cleaned_roles AS (
  SELECT
    r.id,
    COALESCE(
      (
        SELECT jsonb_object_agg(
          filtered.key,
          filtered.clean_actions
        )
        FROM (
          SELECT
            key,
            (
              SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
              FROM jsonb_array_elements_text(value) AS elem
              WHERE elem <> 'team-admin'
            ) AS clean_actions
          FROM jsonb_each(r.permission::jsonb)
        ) filtered
        WHERE jsonb_array_length(filtered.clean_actions) > 0
      ),
      '{}'::jsonb
    ) AS new_permission
  FROM organization_role r
  WHERE r.permission LIKE '%team-admin%'
)
UPDATE organization_role
SET
  permission = cleaned_roles.new_permission::text,
  updated_at = NOW()
FROM cleaned_roles
WHERE organization_role.id = cleaned_roles.id;
