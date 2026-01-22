import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const analyticsRouter = Router();

// All analytics routes require authentication
analyticsRouter.use(authenticate);

// Validation schemas
const dateRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// ============================================================================
// GET USER ANALYTICS
// ============================================================================

analyticsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const query = dateRangeSchema.parse(req.query);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);
    startDate.setHours(0, 0, 0, 0);

    // Get aggregate stats
    const [
      totalPrompts,
      favoriteCount,
      totalTokens,
      promptsByDay,
      topCategories,
      modelUsage,
    ] = await Promise.all([
      // Total prompts
      prisma.prompt.count({
        where: { userId: req.user.id },
      }),

      // Favorite count
      prisma.prompt.count({
        where: { userId: req.user.id, isFavorite: true },
      }),

      // Total tokens
      prisma.prompt.aggregate({
        where: { userId: req.user.id },
        _sum: { totalTokens: true },
      }),

      // Prompts by day (for chart)
      prisma.prompt.groupBy({
        by: ['createdAt'],
        where: {
          userId: req.user.id,
          createdAt: { gte: startDate },
        },
        _count: { id: true },
        orderBy: { createdAt: 'asc' },
      }),

      // Top tags/categories
      prisma.prompt.findMany({
        where: {
          userId: req.user.id,
          tags: { isEmpty: false },
        },
        select: { tags: true },
        take: 100,
      }),

      // Model usage breakdown
      prisma.prompt.groupBy({
        by: ['model'],
        where: { userId: req.user.id },
        _count: { id: true },
      }),
    ]);

    // Process prompts by day for chart data
    const dailyData = new Map<string, number>();
    const today = new Date();
    for (let i = query.days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyData.set(dateStr!, 0);
    }

    for (const entry of promptsByDay) {
      const dateStr = new Date(entry.createdAt).toISOString().split('T')[0];
      const current = dailyData.get(dateStr!) || 0;
      dailyData.set(dateStr!, current + entry._count.id);
    }

    const chartData = Array.from(dailyData.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // Count tag occurrences
    const tagCounts = new Map<string, number>();
    for (const prompt of topCategories) {
      for (const tag of prompt.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Get usage records for trend calculation
    const usageRecords = await prisma.usageRecord.findMany({
      where: {
        userId: req.user.id,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        promptCount: true,
        tokenCount: true,
      },
    });

    // Calculate averages
    const avgPromptsPerDay = query.days > 0 ? totalPrompts / query.days : 0;
    const avgTokensPerPrompt = totalPrompts > 0 ? (totalTokens._sum.totalTokens || 0) / totalPrompts : 0;

    // Get collection count
    const collectionCount = await prisma.collection.count({
      where: { userId: req.user.id },
    });

    // Get template count
    const templateCount = await prisma.template.count({
      where: { userId: req.user.id },
    });

    res.json({
      summary: {
        totalPrompts,
        favoriteCount,
        totalTokens: Number(totalTokens._sum.totalTokens || 0),
        avgPromptsPerDay: Math.round(avgPromptsPerDay * 10) / 10,
        avgTokensPerPrompt: Math.round(avgTokensPerPrompt),
        collectionCount,
        templateCount,
      },
      charts: {
        promptsByDay: chartData,
        modelUsage: modelUsage.map((m) => ({
          model: m.model,
          count: m._count.id,
        })),
        topTags,
      },
      usageHistory: usageRecords.map((r) => ({
        date: r.date.toISOString().split('T')[0],
        prompts: r.promptCount,
        tokens: Number(r.tokenCount),
      })),
      period: {
        days: query.days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// ============================================================================
// GET STREAK INFO
// ============================================================================

analyticsRouter.get('/streak', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Get all days with prompts in the last 365 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 365);

    const dailyActivity = await prisma.usageRecord.findMany({
      where: {
        userId: req.user.id,
        date: { gte: startDate },
        promptCount: { gt: 0 },
      },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    const activityDates = new Set(
      dailyActivity.map((d) => d.date.toISOString().split('T')[0])
    );

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (activityDates.has(dateStr!)) {
        currentStreak++;
      } else if (i > 0) {
        // Allow for today not having activity yet
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    const sortedDates = Array.from(activityDates).sort();

    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prevDate = new Date(sortedDates[i - 1]!);
        const currDate = new Date(sortedDates[i]!);
        const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }

    res.json({
      currentStreak,
      longestStreak,
      totalActiveDays: activityDates.size,
    });
  } catch (error) {
    console.error('Get streak error:', error);
    res.status(500).json({ error: 'Failed to get streak info' });
  }
});
