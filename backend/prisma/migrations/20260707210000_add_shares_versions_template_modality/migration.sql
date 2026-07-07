-- AlterTable
ALTER TABLE "Prompt" ADD COLUMN     "rootPromptId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "modality" TEXT NOT NULL DEFAULT 'text';

-- CreateTable
CREATE TABLE "SharedPrompt" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SharedPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrompt_slug_key" ON "SharedPrompt"("slug");

-- CreateIndex
CREATE INDEX "SharedPrompt_promptId_idx" ON "SharedPrompt"("promptId");

-- CreateIndex
CREATE INDEX "SharedPrompt_userId_createdAt_idx" ON "SharedPrompt"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Prompt_rootPromptId_version_idx" ON "Prompt"("rootPromptId", "version" DESC);

-- CreateIndex
CREATE INDEX "Template_isPublic_modality_createdAt_idx" ON "Template"("isPublic", "modality", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "SharedPrompt" ADD CONSTRAINT "SharedPrompt_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed built-in templates (idempotent: fixed ids, skip if already present).
INSERT INTO "Template" ("id", "userId", "name", "content", "description", "category", "modality", "icon", "isBuiltIn", "isPublic", "usageCount", "createdAt", "updatedAt")
VALUES
  ('tpl_builtin_blog_post', NULL, 'Blog Post Draft',
   'Write a blog post about [TOPIC] for [AUDIENCE]. Structure: a hook that names the reader''s problem, 3-5 sections each making one point with a concrete example, and a closing takeaway. Tone: [TONE]. Length: about [WORD COUNT] words. Avoid generic openers like "In today''s world".',
   'Structured long-form article draft with hook, sections, and takeaway', 'Writing', 'text', 'doc.text', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_product_desc', NULL, 'Product Description',
   'Write a product description for [PRODUCT]. Audience: [TARGET CUSTOMER]. Lead with the single biggest benefit, then 3 bullet points pairing a feature with the outcome it produces, then one sentence handling the most common objection: [OBJECTION]. Under 150 words.',
   'Benefit-led e-commerce copy with objection handling', 'Marketing', 'text', 'tag', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_email_outreach', NULL, 'Cold Outreach Email',
   'Write a cold email to [ROLE] at [COMPANY TYPE] about [OFFER]. Under 120 words. First line must reference something specific about their situation: [SPECIFIC CONTEXT]. One clear ask: [CALL TO ACTION]. No "I hope this finds you well", no exclamation marks.',
   'Short, specific cold email with a single call to action', 'Marketing', 'text', 'envelope', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_code_review', NULL, 'Code Review Request',
   'Review the following [LANGUAGE] code. Priorities in order: correctness bugs, security issues, performance problems, then readability. For each finding give the line, why it matters, and a concrete fix. Do not restate the code or praise it. Code: [PASTE CODE]',
   'Focused code review with prioritized, actionable findings', 'Engineering', 'code', 'chevron.left.forwardslash.chevron.right', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_refactor_plan', NULL, 'Refactoring Plan',
   'I need to refactor [DESCRIBE CODE/SYSTEM]. Current pain: [PAIN POINT]. Constraints: [CONSTRAINTS, e.g. cannot change public API]. Produce a step-by-step plan where every step leaves the system working and shippable, with a rough risk level per step and what test coverage each step needs first.',
   'Incremental, always-shippable refactoring roadmap', 'Engineering', 'code', 'wrench', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_photo_portrait', NULL, 'Portrait Photography',
   'Portrait photograph of [SUBJECT], [EMOTION/EXPRESSION], shot on 85mm f/1.4 lens, shallow depth of field, [LIGHTING: e.g. golden hour rim light / soft window light], background of [SETTING], skin texture preserved, no beauty-filter smoothing, color graded like [FILM STOCK OR STYLE].',
   'Photorealistic portrait with lens, lighting, and grading control', 'Photography', 'image', 'camera', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_logo_design', NULL, 'Logo Concept',
   'Minimal vector logo for [BRAND], a [INDUSTRY] company. Core idea: [CONCEPT TO COMMUNICATE]. Flat design, works at 16px favicon size, maximum two colors: [COLOR 1] and [COLOR 2], plenty of negative space, no gradients, no text in the mark itself, white background.',
   'Constraint-driven flat logo brief that survives small sizes', 'Design', 'image', 'paintbrush', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_video_scene', NULL, 'Cinematic Scene',
   'Cinematic shot: [SUBJECT AND ACTION] in [SETTING]. Camera: [SHOT TYPE, e.g. slow dolly-in / handheld tracking]. Lighting: [MOOD, e.g. low-key neon / overcast daylight]. Duration: [SECONDS]s. Style reference: [FILM OR DIRECTOR]. Keep motion physically plausible; no morphing artifacts.',
   'Single-shot video brief with camera, lighting, and duration', 'Video', 'video', 'film', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_voiceover', NULL, 'Voiceover Script',
   'Write a [DURATION]-second voiceover script for [PURPOSE, e.g. app promo]. Speaker: [VOICE PERSONA]. Pace: about 150 words per minute, so target [WORD COUNT] words. Mark emphasis words in caps and pauses with (beat). Must land the key message "[KEY MESSAGE]" in the first 5 seconds.',
   'Timed voiceover script with pacing and emphasis marks', 'Audio', 'audio', 'waveform', true, true, 0, NOW(), NOW()),
  ('tpl_builtin_3d_asset', NULL, 'Game-Ready 3D Asset',
   '3D model of [OBJECT], game-ready: under [POLY BUDGET] triangles, PBR textures (albedo, normal, roughness, metallic) at 2K, real-world scale, clean quad-dominant topology, UV-unwrapped with no overlaps, neutral lighting preview, [ART STYLE: e.g. stylized hand-painted / photoreal].',
   'Production 3D asset spec with poly budget and PBR maps', '3D', '3d', 'cube', true, true, 0, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
