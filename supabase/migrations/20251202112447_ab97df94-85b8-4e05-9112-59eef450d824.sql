-- Make medication_courses.start_date nullable
-- Users can add treatment courses without knowing exact start date

ALTER TABLE medication_courses 
ALTER COLUMN start_date DROP NOT NULL;

COMMENT ON COLUMN medication_courses.start_date IS 'Start date of treatment course. Can be NULL if user needs to research the date later.';