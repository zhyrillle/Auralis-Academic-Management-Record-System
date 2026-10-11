-- Restore the subject-to-department relationships required by Academic Period
-- reporting. Only subjects that currently have no department are changed.
UPDATE SUBJECT s
INNER JOIN DEPARTMENT d
  ON d.department_name = CASE s.subject_code
    WHEN 'ENG' THEN 'English'
    WHEN 'FIL' THEN 'Filipino'
    WHEN 'MATH' THEN 'Mathematics'
    WHEN 'SCI' THEN 'Science'
    WHEN 'AP' THEN 'Araling Panlipunan'
    WHEN 'MAPEH' THEN 'MAPEH'
    WHEN 'ESP' THEN 'Edukasyon sa Pagpapakatao'
    WHEN 'TLE' THEN 'Technology and Livelihood Education'
    WHEN 'SPA' THEN 'Special Programs of Arts'
    WHEN 'SPJ' THEN 'Special Program of Journalism'
    WHEN 'STE' THEN 'Science Technology and Engineering'
  END
SET s.department_id = d.department_id
WHERE s.department_id IS NULL
  AND s.subject_code IN (
    'ENG', 'FIL', 'MATH', 'SCI', 'AP', 'MAPEH',
    'ESP', 'TLE', 'SPA', 'SPJ', 'STE'
  );
