-- Keep the editable report boundary under a descriptive column name.
ALTER TABLE PHIL_IRI_SCREENING
  DROP CHECK ck_screening_cutoff,
  RENAME COLUMN screening_cutoff TO score_threshold,
  ADD CONSTRAINT ck_screening_score_threshold
    CHECK (score_threshold BETWEEN 1 AND literal_max + inferential_max + critical_max);
