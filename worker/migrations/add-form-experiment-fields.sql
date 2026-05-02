-- Add form variant + experiment arm tracking columns to leads.
-- form_variant: 'inline' | 'standard' | 'inline-short' (future variants)
-- experiment_arm: 'inline-only' | 'A' | 'B' (when an A/B test is active)
ALTER TABLE leads ADD COLUMN form_variant TEXT;
ALTER TABLE leads ADD COLUMN experiment_arm TEXT;
