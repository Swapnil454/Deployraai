-- Drop the existing constraint
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_route_type_check;

-- Add the new constraint with 'status_page' included
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_route_type_check 
  CHECK (route_type IN ('dashboard', 'email', 'slack_webhook', 'webhook', 'status_page'));

-- Add auto_resolve column
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS auto_resolve BOOLEAN DEFAULT TRUE;
