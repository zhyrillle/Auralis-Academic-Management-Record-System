-- Apply after 20261010_rename_screening_test_version_to_level.sql.
ALTER TABLE PHIL_IRI_SCREENING
  RENAME COLUMN screening_level TO test_level;
