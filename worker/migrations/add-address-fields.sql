-- Add structured address fields for Google Places Autocomplete
ALTER TABLE leads ADD COLUMN address_city TEXT;
ALTER TABLE leads ADD COLUMN address_county TEXT;
ALTER TABLE leads ADD COLUMN address_lat TEXT;
ALTER TABLE leads ADD COLUMN address_lng TEXT;
