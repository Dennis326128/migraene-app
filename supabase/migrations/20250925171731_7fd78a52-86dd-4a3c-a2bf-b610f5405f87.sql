-- Fix Dortmund coordinates to correct Dortmund, Germany location
UPDATE user_profiles 
SET latitude = 51.5136, longitude = 7.4653 
WHERE user_id = '0d8e3c0f-fdcd-46d9-8463-aa8e2eda09f6' 
AND latitude = 51.5080192 
AND longitude = 7.0156288;