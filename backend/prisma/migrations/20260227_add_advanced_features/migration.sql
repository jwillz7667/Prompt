-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('CHATGPT', 'CLAUDE', 'GEMINI', 'MIDJOURNEY', 'DALLE', 'STABLE_DIFFUSION', 'SORA', 'RUNWAY', 'SUNO', 'UDIO');

-- CreateTable: Workflows
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "steps" JSONB NOT NULL,
    "variables" JSONB,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkflowStep
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "promptTemplate" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "tone" TEXT,
    "length" TEXT,
    "targetPlatform" TEXT,
    "inputMapping" JSONB,
    "outputVariable" TEXT,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkflowExecution
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "stepResults" JSONB,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PromptVariation
CREATE TABLE "PromptVariation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "basePromptId" TEXT,
    "originalPrompt" TEXT NOT NULL,
    "status" "VariationStatus" NOT NULL DEFAULT 'PENDING',
    "variations" JSONB NOT NULL,
    "comparisonData" JSONB,
    "selectedVariationIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VariationResult
CREATE TABLE "VariationResult" (
    "id" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "tone" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "targetPlatform" TEXT,
    "enhancedPrompt" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "userRating" INTEGER,
    "performanceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectContext
CREATE TABLE "ProjectContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contextData" TEXT NOT NULL,
    "embedding" vector(1536),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "autoApply" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ContextUsage
CREATE TABLE "ContextUsage" (
    "id" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlatformPreset
CREATE TABLE "PlatformPreset" (
    "id" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "syntaxRules" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "optimizations" JSONB NOT NULL,
    "examplePrompts" JSONB,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserPlatformSettings
CREATE TABLE "UserPlatformSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "customSettings" JSONB,
    "preferredPresetId" TEXT,
    "apiKey" TEXT,
    "apiKeyEncrypted" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SandboxTest
CREATE TABLE "SandboxTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptId" TEXT,
    "testPrompt" TEXT NOT NULL,
    "platforms" "PlatformType"[],
    "results" JSONB NOT NULL,
    "costEstimates" JSONB NOT NULL,
    "performanceMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlatformTestResult
CREATE TABLE "PlatformTestResult" (
    "id" TEXT NOT NULL,
    "sandboxTestId" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "enhancedPrompt" TEXT NOT NULL,
    "simulatedResponse" TEXT,
    "estimatedTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER,
    "syntaxValid" BOOLEAN NOT NULL DEFAULT true,
    "warnings" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTestResult_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "Workflow_userId_idx" ON "Workflow"("userId");
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");
CREATE INDEX "WorkflowExecution_workflowId_idx" ON "WorkflowExecution"("workflowId");
CREATE INDEX "WorkflowExecution_userId_idx" ON "WorkflowExecution"("userId");
CREATE INDEX "PromptVariation_userId_idx" ON "PromptVariation"("userId");
CREATE INDEX "PromptVariation_basePromptId_idx" ON "PromptVariation"("basePromptId");
CREATE INDEX "VariationResult_variationId_idx" ON "VariationResult"("variationId");
CREATE INDEX "ProjectContext_userId_idx" ON "ProjectContext"("userId");
CREATE INDEX "ProjectContext_isActive_idx" ON "ProjectContext"("isActive");
CREATE INDEX "ContextUsage_contextId_idx" ON "ContextUsage"("contextId");
CREATE INDEX "ContextUsage_promptId_idx" ON "ContextUsage"("promptId");
CREATE INDEX "PlatformPreset_platform_idx" ON "PlatformPreset"("platform");
CREATE INDEX "UserPlatformSettings_userId_platform_idx" ON "UserPlatformSettings"("userId", "platform");
CREATE INDEX "SandboxTest_userId_idx" ON "SandboxTest"("userId");
CREATE INDEX "PlatformTestResult_sandboxTestId_idx" ON "PlatformTestResult"("sandboxTestId");

-- Create unique constraints
CREATE UNIQUE INDEX "UserPlatformSettings_userId_platform_key" ON "UserPlatformSettings"("userId", "platform");
CREATE UNIQUE INDEX "WorkflowStep_workflowId_position_key" ON "WorkflowStep"("workflowId", "position");

-- Add foreign keys
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptVariation" ADD CONSTRAINT "PromptVariation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptVariation" ADD CONSTRAINT "PromptVariation_basePromptId_fkey" FOREIGN KEY ("basePromptId") REFERENCES "Prompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VariationResult" ADD CONSTRAINT "VariationResult_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "PromptVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectContext" ADD CONSTRAINT "ProjectContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextUsage" ADD CONSTRAINT "ContextUsage_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "ProjectContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextUsage" ADD CONSTRAINT "ContextUsage_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPlatformSettings" ADD CONSTRAINT "UserPlatformSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPlatformSettings" ADD CONSTRAINT "UserPlatformSettings_preferredPresetId_fkey" FOREIGN KEY ("preferredPresetId") REFERENCES "PlatformPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SandboxTest" ADD CONSTRAINT "SandboxTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SandboxTest" ADD CONSTRAINT "SandboxTest_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformTestResult" ADD CONSTRAINT "PlatformTestResult_sandboxTestId_fkey" FOREIGN KEY ("sandboxTestId") REFERENCES "SandboxTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;