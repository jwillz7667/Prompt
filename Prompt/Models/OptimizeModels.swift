//
//  OptimizeModels.swift
//  Prompt
//
//  Wire models for the reflection-loop optimizer (`/api/v1/optimize`).
//  Mirrors backend/src/routes/optimize.ts (request/response shapes),
//  backend/src/services/reflectionJobService.ts (ReflectionJobResult — the
//  terminal payload, which flattens the engine outcome for transport) and
//  backend/src/services/reflectionLoop/schemas.ts (stage schemas).
//

import Foundation

// MARK: - Target Model Family

/// `TARGET_MODEL_FAMILIES` in reflectionLoop/schemas.ts. Sent as
/// `target_model_family` on job creation; the backend folds it into the
/// intake goal (spec §4 P0/P2 target-model formatting rules).
enum TargetModelFamily: String, Codable, CaseIterable, Identifiable, Sendable {
    case claude
    case gpt
    case gemini
    case deepseek
    case reasoningModel = "reasoning_model"
    case unknown

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .claude: return "Claude"
        case .gpt: return "GPT"
        case .gemini: return "Gemini"
        case .deepseek: return "DeepSeek"
        case .reasoningModel: return "Reasoning"
        case .unknown: return "Auto"
        }
    }

    var sfSymbol: String {
        switch self {
        case .claude: return "sparkles"
        case .gpt: return "circle.hexagongrid.fill"
        case .gemini: return "diamond.fill"
        case .deepseek: return "magnifyingglass.circle.fill"
        case .reasoningModel: return "brain.head.profile"
        case .unknown: return "wand.and.stars"
        }
    }

    /// Spec §8 target-model profiles: Free gets the single generic profile,
    /// Pro unlocks every named family.
    var isProOnly: Bool { self != .unknown }
}

// MARK: - Job Creation

/// `POST /optimize` body (`optimizeRequestSchema` in routes/optimize.ts).
/// Keys are snake_case at the zod boundary. Optional fields are omitted when
/// nil (the schema rejects explicit nulls).
struct OptimizeStartRequest: Encodable, Equatable, Sendable {
    let rawPrompt: String
    let goal: String?
    let targetModelFamily: TargetModelFamily?
    let variableValues: [String: String]?

    private enum CodingKeys: String, CodingKey {
        case rawPrompt = "raw_prompt"
        case goal
        case targetModelFamily = "target_model_family"
        case variableValues = "variable_values"
    }
}

/// §8 tier gate decided at the route: FREE → `fast_path`, PRO/PREMIUM → `full_loop`.
enum OptimizeMode: String, Codable, Equatable, Sendable {
    case fastPath = "fast_path"
    case fullLoop = "full_loop"
}

/// `POST /optimize` 202 response.
struct OptimizeStartResponse: Decodable, Equatable, Sendable {
    let jobId: String
    let mode: OptimizeMode
}

// MARK: - Progress

/// `ReflectionProgressPhase` (reflectionLoop/engine.ts) — spec §2 stage table.
enum OptimizeProgressPhase: String, Codable, CaseIterable, Equatable, Sendable {
    case classifying
    case buildingRubric = "building_rubric"
    case generatingCandidates = "generating_candidates"
    case testingCandidates = "testing_candidates"
    case reflecting
    case revising
    case packaging

    /// Coarse determinate-progress mapping for the 20–45 s wall clock. The
    /// loop revisits test/reflect/revise phases, so consumers should clamp
    /// progress monotonically (OptimizeViewModel does).
    var fractionComplete: Double {
        switch self {
        case .classifying: return 0.10
        case .buildingRubric: return 0.25
        case .generatingCandidates: return 0.40
        case .testingCandidates: return 0.55
        case .reflecting: return 0.70
        case .revising: return 0.80
        case .packaging: return 0.95
        }
    }
}

/// One entry of the poll response's `progress` array
/// (`ReflectionProgressUpdate` in reflectionJobService.ts).
/// `phase` stays a raw string so an additive backend phase cannot fail the
/// whole poll decode; `label` is the user-facing stage text shown verbatim.
struct OptimizeProgressUpdate: Codable, Equatable, Sendable {
    let phase: String
    let label: String
    let rolloutsUsed: Int
    let at: Date

    var knownPhase: OptimizeProgressPhase? { OptimizeProgressPhase(rawValue: phase) }
}

/// SSE progress event payload (same fields minus `at`).
struct OptimizeProgressEvent: Decodable, Equatable, Sendable {
    let phase: String
    let label: String
    let rolloutsUsed: Int

    var knownPhase: OptimizeProgressPhase? { OptimizeProgressPhase(rawValue: phase) }
}

// MARK: - Usage

/// `ReflectionUsage` (reflectionLoop/engine.ts).
struct OptimizeUsage: Codable, Equatable, Sendable {
    let inputTokens: Int
    let outputTokens: Int
    let llmCalls: Int
}

// MARK: - Receipts

/// `ReflectionScoreDetail` / `critiqueScoreSchema` — one rubric criterion
/// scored 1–5 with quoted evidence from the rollout output.
struct OptimizeCriterionScore: Codable, Equatable, Identifiable, Sendable {
    let criterion: String
    let score: Int
    let evidence: String

    var id: String { criterion }
}

/// `ReflectionCandidateReceipt` (reflectionJobService.ts) — the honest-receipts
/// view of a candidate: exact prompt text, its rollout output, and per-criterion
/// scores. `score` is the weighted 1–5 total.
struct OptimizeCandidateReceipt: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let strategy: String
    let promptText: String
    let score: Double
    let rolloutOutput: String
    let scores: [OptimizeCriterionScore]
}

// MARK: - Outcome (terminal job result)

/// Loop stop condition (`ReflectionStopReason`, engine.ts).
enum OptimizeStopReason: String, Codable, Equatable, Sendable {
    case targetReached = "target_reached"
    case plateau
    case budgetExhausted = "budget_exhausted"
}

/// `ReflectionJobResult` (reflectionJobService.ts) — discriminated on `status`.
/// This is the payload of the SSE `result` event and of the poll `result` field.
enum OptimizeOutcome: Equatable, Sendable {
    case refused(Refused)
    case fastPath(FastPath)
    case optimized(Optimized)

    /// P0 safety gate tripped; nothing was enhanced and no quota was charged.
    struct Refused: Codable, Equatable, Sendable {
        let category: String
        let message: String
        let usage: OptimizeUsage
    }

    /// Single-pass polish: the free tier, an already-strong prompt, or a
    /// degraded stage (spec §3 failure ladder).
    struct FastPath: Codable, Equatable, Sendable {
        let reason: Reason
        /// Which loop stage degraded, when `reason == .stageDegraded`.
        let degradedStage: String?
        let enhancedPrompt: String
        let model: String
        let usage: OptimizeUsage
        /// Server-side Prompt row id; nil when persistence was skipped or failed.
        let promptId: String?

        enum Reason: String, Codable, Equatable, Sendable {
            case freeTier = "free_tier"
            case alreadyStrong = "already_strong"
            case stageDegraded = "stage_degraded"
        }
    }

    /// Full reflection loop finished: packaged template plus honest receipts
    /// for the winner and the original (spec §6 — the original can win).
    struct Optimized: Codable, Equatable, Sendable {
        let title: String
        let summaryBullets: [String]
        let templateText: String
        let variables: [String]
        let winner: OptimizeCandidateReceipt
        let original: OptimizeCandidateReceipt
        let originalWon: Bool
        let stopReason: OptimizeStopReason
        let rolloutsUsed: Int
        /// Effective target-model profile the winner was formatted for (spec
        /// §4 P2): the user's explicit choice when specific, else the P0
        /// inference.
        let requestedTargetModelFamily: TargetModelFamily
        let usage: OptimizeUsage
        /// Server-side Prompt row id; nil when persistence was skipped or failed.
        let promptId: String?
    }
}

extension OptimizeOutcome: Codable {
    private enum CodingKeys: String, CodingKey {
        case status
    }

    private enum Status: String, Codable {
        case refused
        case fastPath = "fast_path"
        case optimized
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Status.self, forKey: .status) {
        case .refused:
            self = .refused(try Refused(from: decoder))
        case .fastPath:
            self = .fastPath(try FastPath(from: decoder))
        case .optimized:
            self = .optimized(try Optimized(from: decoder))
        }
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .refused(let payload):
            try container.encode(Status.refused, forKey: .status)
            try payload.encode(to: encoder)
        case .fastPath(let payload):
            try container.encode(Status.fastPath, forKey: .status)
            try payload.encode(to: encoder)
        case .optimized(let payload):
            try container.encode(Status.optimized, forKey: .status)
            try payload.encode(to: encoder)
        }
    }
}

// MARK: - Comparison helpers (pure; consumed by the comparison view)

/// One rubric criterion aligned across the original and winner receipts.
struct OptimizeReceiptPair: Equatable, Identifiable, Sendable {
    let criterion: String
    let originalScore: Int?
    let winnerScore: Int?
    let originalEvidence: String?
    let winnerEvidence: String?

    var id: String { criterion }

    var delta: Int? {
        guard let originalScore, let winnerScore else { return nil }
        return winnerScore - originalScore
    }
}

extension OptimizeOutcome.Optimized {
    /// Weighted-total movement from the original to the winner. Positive means
    /// the winner outscored the original; ~0 when the original won.
    var scoreDelta: Double { winner.score - original.score }

    /// Criterion-by-criterion pairs in the winner's rubric order, with any
    /// original-only criteria appended (defensive — both candidates are scored
    /// against the same rubric, so orders normally match).
    var receiptPairs: [OptimizeReceiptPair] {
        var originalByCriterion: [String: OptimizeCriterionScore] = [:]
        for score in original.scores where originalByCriterion[score.criterion] == nil {
            originalByCriterion[score.criterion] = score
        }

        var pairs: [OptimizeReceiptPair] = winner.scores.map { winnerScore in
            let originalScore = originalByCriterion.removeValue(forKey: winnerScore.criterion)
            return OptimizeReceiptPair(
                criterion: winnerScore.criterion,
                originalScore: originalScore?.score,
                winnerScore: winnerScore.score,
                originalEvidence: originalScore?.evidence,
                winnerEvidence: winnerScore.evidence
            )
        }

        for score in original.scores {
            guard originalByCriterion.removeValue(forKey: score.criterion) != nil else { continue }
            pairs.append(
                OptimizeReceiptPair(
                    criterion: score.criterion,
                    originalScore: score.score,
                    winnerScore: nil,
                    originalEvidence: score.evidence,
                    winnerEvidence: nil
                )
            )
        }

        return pairs
    }
}

// MARK: - Poll Response

/// `GET /optimize/:jobId` — `ReflectionJobSnapshot` minus `userId`
/// (routes/optimize.ts poll handler).
enum OptimizeJobStatus: String, Codable, Equatable, Sendable {
    case queued
    case running
    case completed
    case failed

    var isTerminal: Bool { self == .completed || self == .failed }
}

struct OptimizePollResponse: Decodable, Equatable, Sendable {
    let jobId: String
    let status: OptimizeJobStatus
    let progress: [OptimizeProgressUpdate]
    let result: OptimizeOutcome?
    let error: String?
}

// MARK: - SSE Event Envelope

/// One `data:` payload on `GET /optimize/:jobId/stream`
/// (`ReflectionJobStreamMessage`). Conventions mirror /prompts/enhance/stream:
/// `result` is followed by `[DONE]`; `failure` ends the stream with no `[DONE]`.
enum OptimizeStreamEvent: Decodable, Equatable, Sendable {
    case progress(OptimizeProgressEvent)
    case result(OptimizeOutcome)
    case failure(message: String)

    private enum CodingKeys: String, CodingKey {
        case type
        case result
        case message
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "progress":
            self = .progress(try OptimizeProgressEvent(from: decoder))
        case "result":
            self = .result(try container.decode(OptimizeOutcome.self, forKey: .result))
        case "error":
            let message = try container.decodeIfPresent(String.self, forKey: .message)
            self = .failure(message: message ?? "Optimization failed")
        default:
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "Unknown optimize stream event type: \(type)"
                )
            )
        }
    }
}

// MARK: - Stage Schema Mirrors (reflectionLoop/schemas.ts, engine.ts)

// The current wire payload flattens the engine outcome: candidates travel as
// OptimizeCandidateReceipt and the packager fields are inlined on
// OptimizeOutcome.Optimized. These mirrors match the backend stage schemas
// (snake_case via CodingKeys) so richer payloads (e.g. spec §6 rubric
// receipts) decode without remodeling.

/// `rubricCriterionSchema` — one of exactly five weighted criteria with
/// score anchors at 1/3/5.
struct OptimizeRubricCriterion: Codable, Equatable, Identifiable, Sendable {
    let name: String
    let weight: Double
    let description: String
    let anchor1: String
    let anchor3: String
    let anchor5: String

    var id: String { name }

    private enum CodingKeys: String, CodingKey {
        case name
        case weight
        case description
        case anchor1 = "anchor_1"
        case anchor3 = "anchor_3"
        case anchor5 = "anchor_5"
    }
}

/// `rubricSchema` — five criteria whose weights sum to ~1.0.
struct OptimizeRubric: Codable, Equatable, Sendable {
    let criteria: [OptimizeRubricCriterion]
}

/// `critiqueSchema` — full critic output for one candidate.
struct OptimizeCritique: Codable, Equatable, Sendable {
    let scores: [OptimizeCriterionScore]
    let weightedTotal: Double
    let diagnosis: [String]
    let prescriptions: [String]

    private enum CodingKeys: String, CodingKey {
        case scores
        case weightedTotal = "weighted_total"
        case diagnosis
        case prescriptions
    }
}

/// `ScoredCandidate` (engine.ts) — a candidate with its rollout and critique.
struct OptimizeScoredCandidate: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let strategy: String
    let promptText: String
    let variables: [String]
    let rolloutOutput: String
    let promptTokens: Int
    let critique: OptimizeCritique
    let weightedScore: Double
}

/// `packageOutputSchema` — the P6 packager output.
struct OptimizePackage: Codable, Equatable, Sendable {
    let title: String
    let summaryBullets: [String]
    let templateText: String
    let variables: [String]

    private enum CodingKeys: String, CodingKey {
        case title
        case summaryBullets = "summary_bullets"
        case templateText = "template_text"
        case variables
    }
}
