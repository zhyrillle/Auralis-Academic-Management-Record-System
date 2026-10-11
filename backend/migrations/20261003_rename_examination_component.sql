-- Apply separately after review. This changes component metadata only.
-- Existing IDs, subject weights, activities and saved grades are untouched.
-- A missing or duplicate QA/STE/EX component blocks the update for review.
START TRANSACTION;

SELECT component_type_id, component_code, component_name
FROM COMPONENT_TYPE
WHERE UPPER(TRIM(component_code)) IN ('QA', 'STE', 'EX')
FOR UPDATE;

SELECT COUNT(*), MIN(component_type_id)
INTO @exam_component_count, @exam_component_id
FROM COMPONENT_TYPE
WHERE UPPER(TRIM(component_code)) IN ('QA', 'STE', 'EX');

UPDATE COMPONENT_TYPE
SET component_code = 'STE',
    component_name = 'Summative Tests and Term Examination (STs-TE)'
WHERE component_type_id = @exam_component_id
  AND @exam_component_count = 1
  AND UPPER(TRIM(component_code)) IN ('QA', 'STE', 'EX');

SELECT CASE
  WHEN @exam_component_count = 1 THEN 'COMPONENT_RENAMED_OR_ALREADY_CURRENT'
  ELSE 'REVIEW_REQUIRED: expected exactly one QA/STE/EX component; no update applied'
END AS migration_status;

COMMIT;

SELECT component_type_id, component_code, component_name
FROM COMPONENT_TYPE
WHERE UPPER(TRIM(component_code)) IN ('QA', 'STE', 'EX');
