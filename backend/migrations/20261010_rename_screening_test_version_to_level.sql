-- PHIL-IRI screening metadata is the assessment level shown in the UI, not a version label.
ALTER TABLE PHIL_IRI_SCREENING
  RENAME COLUMN test_version TO screening_level;
