declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        sessionId?: string;
      };
      subscription?: {
        tier: string;
        promptQuality: 'basic' | 'standard' | 'advanced';
        dailyPromptsUsed: number;
        dailyPromptsLimit: number;
        canExport: boolean;
        maxTokensPerPrompt: number;
      };
    }
  }
}

export {};