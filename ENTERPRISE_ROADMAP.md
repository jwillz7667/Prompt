# Enterprise Scaling Roadmap

This document outlines the enhancements required to scale Promptomize to handle **thousands of concurrent users** with enterprise-grade reliability.

## Current State vs Target

| Metric | Current | Target |
|--------|---------|--------|
| Concurrent Users | ~100 | 10,000+ |
| Request Latency (p95) | ~8s | <500ms |
| Uptime SLA | None | 99.9% |
| Offline Support | None | Full |
| Data Persistence | Server only | Local + Server |

---

## Phase 1: Backend Infrastructure (Critical)

### 1.1 Database Connection Pooling
**Status:** ⚠️ Not Configured

Update `DATABASE_URL` in production:
```
postgresql://...?connection_limit=25&pool_timeout=30
```

Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_DIRECT_URL")  // For migrations
}
```

### 1.2 Redis Caching Layer
**Status:** ✅ Created (`src/utils/redis.ts`)

**Setup:**
1. Add Redis on Railway: `railway add --plugin redis`
2. Set `REDIS_URL` in environment
3. Initialize in `src/index.ts`

**Cache Strategy:**
| Data | TTL | Impact |
|------|-----|--------|
| Subscription info | 5 min | Reduces 90% DB queries |
| User session | 15 min | Faster auth validation |
| Daily usage | 1 min | Reduces quota checks |
| Templates list | 1 hour | Static data caching |

### 1.3 Job Queue System
**Status:** ✅ Created (`src/utils/queue.ts`)

**Queues Created:**
- `prompt-enhance` - Async prompt processing
- `subscription-sync` - IAP webhook processing
- `cleanup` - Scheduled maintenance jobs

**Integration Required:**
```typescript
// In prompts.ts - change from sync to async
app.post('/api/v1/prompts/enhance', async (req, res) => {
  const job = await queues.addPromptJob({
    userId: req.user.id,
    prompt: req.body.prompt,
    ...
  });
  res.status(202).json({
    jobId: job.id,
    statusUrl: `/api/v1/prompts/jobs/${job.id}`
  });
});
```

### 1.4 Health Checks & Monitoring
**Status:** ✅ Enhanced (`src/routes/health.ts`)

**New Endpoints:**
- `GET /health` - Comprehensive health check
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/metrics` - Prometheus metrics
- `GET /health/status` - Detailed debugging info

---

## Phase 2: iOS Local Database (Critical)

### 2.1 Add SwiftData/CoreData
**Status:** ❌ Not Implemented

Create local storage for:
- Prompt history (offline read)
- Templates cache
- User preferences
- Sync queue (offline write)

**Recommended Structure:**
```swift
// LocalStore.swift
@Model
class LocalPrompt {
    @Attribute(.unique) var id: String
    var originalPrompt: String
    var enhancedPrompt: String
    var createdAt: Date
    var syncStatus: SyncStatus  // .synced, .pending, .failed
    var serverVersion: Int      // For conflict detection
}

enum SyncStatus: String, Codable {
    case synced
    case pending
    case failed
}
```

### 2.2 Offline Sync Queue
**Status:** ❌ Not Implemented

```swift
// SyncQueue.swift
actor SyncQueue {
    private var pendingOperations: [SyncOperation] = []

    func enqueue(_ operation: SyncOperation) {
        pendingOperations.append(operation)
        persistToDisk()
    }

    func processOnReconnect() async {
        for operation in pendingOperations {
            do {
                try await operation.execute()
                remove(operation)
            } catch {
                operation.incrementRetry()
            }
        }
    }
}
```

### 2.3 Network-Aware Data Loading
**Status:** ⚠️ Partial (NetworkMonitor exists)

```swift
// Enhanced APIClient
func request<T: Decodable>(...) async throws -> T {
    // Try network first
    if networkMonitor.isConnected {
        let result = try await performRequest(...)
        await localStore.cache(result)
        return result
    }

    // Fallback to cache
    if let cached = await localStore.get(cacheKey) {
        return cached
    }

    throw APIError.offlineNoCache
}
```

---

## Phase 3: Performance Optimizations (High)

### 3.1 Auth Token Caching
**Current:** DB query on every request
**Target:** In-memory cache with 1-min TTL

```typescript
// middleware/auth.ts
const userCache = new Map<string, {user: User, expiresAt: number}>();

export const authenticate = async (req, res, next) => {
  // Check cache first
  const cached = userCache.get(decoded.userId);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    return next();
  }

  // Fall back to DB
  const user = await prisma.user.findUnique(...);
  userCache.set(decoded.userId, {
    user,
    expiresAt: Date.now() + 60000
  });
};
```

### 3.2 Per-Tier Rate Limiting
**Current:** Global 100 req/min
**Target:** Tier-based with Redis store

```typescript
import RedisStore from 'rate-limit-redis';

const promptRateLimit = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60000,
  max: (req) => {
    switch (req.subscription?.tier) {
      case 'FREE': return 10;
      case 'PRO': return 50;
      case 'PREMIUM': return 200;
      default: return 5;
    }
  },
});
```

### 3.3 Database Indexes
Add missing indexes:
```prisma
model Subscription {
  // ...existing fields...

  @@index([status, expiresAt])  // For expiring subscription queries
}

model User {
  // ...existing fields...

  @@index([subscriptionTier, isActive])  // For tier-based operations
}
```

---

## Phase 4: Reliability & Observability (Medium)

### 4.1 Error Tracking (Sentry)
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// In errorHandler.ts
Sentry.captureException(err, {
  user: { id: req.user?.id },
  tags: { endpoint: req.path },
});
```

### 4.2 Graceful Shutdown
```typescript
// index.ts
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown initiated');

  // Stop accepting new requests
  server.close();

  // Wait for in-flight requests (max 30s)
  await new Promise(r => setTimeout(r, 5000));

  // Close connections
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 4.3 Request Tracing
Add correlation IDs for distributed tracing:
```typescript
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  res.setHeader('x-trace-id', req.traceId);
  next();
});
```

---

## Phase 5: iOS Enhancements (Medium)

### 5.1 Background App Refresh
```swift
// PromptApp.swift
func application(_ application: UIApplication,
                 performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    Task {
        do {
            await SyncQueue.shared.processOnReconnect()
            completionHandler(.newData)
        } catch {
            completionHandler(.failed)
        }
    }
}
```

### 5.2 Conflict Resolution
```swift
enum ConflictResolution {
    case serverWins
    case clientWins
    case merge(strategy: MergeStrategy)
    case askUser
}

func resolveConflict(local: LocalPrompt, server: ServerPrompt) -> LocalPrompt {
    if server.version > local.serverVersion {
        // Server has newer data
        return LocalPrompt(from: server)
    } else if local.syncStatus == .pending {
        // Local has unsaved changes
        return local  // Keep local, will sync later
    }
    return LocalPrompt(from: server)
}
```

### 5.3 Incremental Sync
```swift
// Only fetch changes since last sync
func syncPrompts() async throws {
    let lastSync = UserDefaults.standard.object(forKey: "lastPromptSync") as? Date ?? .distantPast

    let response = try await APIClient.shared.request(
        "/prompts?modifiedSince=\(lastSync.iso8601)"
    )

    for prompt in response.prompts {
        await localStore.upsert(prompt)
    }

    UserDefaults.standard.set(Date(), forKey: "lastPromptSync")
}
```

---

## Implementation Checklist

### Week 1 - Critical Infrastructure
- [ ] Configure database connection pooling
- [ ] Deploy Redis on Railway
- [ ] Integrate Redis caching in subscription service
- [ ] Add auth token caching

### Week 2 - Async Processing
- [ ] Install BullMQ: `npm install bullmq`
- [ ] Create queue workers
- [ ] Convert prompt enhancement to async
- [ ] Add job status polling endpoint

### Week 3 - iOS Offline
- [ ] Add SwiftData to project
- [ ] Create LocalPrompt model
- [ ] Implement SyncQueue
- [ ] Add offline fallback to APIClient

### Week 4 - Monitoring & Polish
- [ ] Set up Sentry
- [ ] Configure Prometheus/Grafana
- [ ] Add alerting rules
- [ ] Load test with k6

---

## New Dependencies

### Backend (package.json)
```json
{
  "dependencies": {
    "redis": "^4.6.0",
    "bullmq": "^5.0.0",
    "rate-limit-redis": "^4.0.0",
    "@sentry/node": "^7.0.0"
  }
}
```

### iOS (Swift Package Dependencies)
- SwiftData (built-in iOS 17+)
- No additional packages needed

---

## Cost Estimates (Railway)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| PostgreSQL | Pro (1GB RAM) | $20 |
| Redis | Pro (256MB) | $10 |
| Backend | Pro (1GB RAM, 2 instances) | $40 |
| **Total** | | **~$70/month** |

For 10K+ users, consider:
- Managed PostgreSQL (Supabase, Neon)
- Managed Redis (Upstash, Redis Cloud)
- Horizontal scaling (3+ backend instances)

---

## Monitoring Dashboards

After implementation, monitor these metrics:

1. **API Health**: `/health/metrics`
   - Request latency (p50, p95, p99)
   - Error rate
   - Queue depth

2. **Database**: Railway dashboard
   - Connection pool usage
   - Query latency
   - Active connections

3. **Redis**: Redis Cloud dashboard
   - Memory usage
   - Cache hit rate
   - Operations/sec

4. **iOS**: Firebase Crashlytics
   - Crash-free sessions
   - ANR rate
   - Network error rate
