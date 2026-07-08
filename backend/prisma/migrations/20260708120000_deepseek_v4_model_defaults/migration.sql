-- DeepSeek V4 model-name migration: the legacy `deepseek-reasoner` and
-- `deepseek-chat` ids are deprecated upstream on 2026-07-24 and alias to
-- `deepseek-v4-flash` thinking / non-thinking modes.
-- Column defaults only — historical rows keep the model that actually
-- served them.

-- AlterTable
ALTER TABLE "Prompt" ALTER COLUMN "model" SET DEFAULT 'deepseek-v4-flash';

-- AlterTable
ALTER TABLE "ThreadTurn" ALTER COLUMN "model" SET DEFAULT 'deepseek-v4-flash';
