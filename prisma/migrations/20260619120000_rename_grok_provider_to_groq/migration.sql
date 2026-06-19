UPDATE "Settings"
SET "ai_provider" = 'groq'
WHERE "ai_provider" = 'grok';

UPDATE "Settings"
SET "grok_model" = 'llama-3.3-70b-versatile'
WHERE "grok_model" IS NULL
   OR "grok_model" IN ('grok-beta', 'grok-4.3');
