/**
 * Model Registry
 *
 * Manages the pool of available AI models with:
 * - Concurrency tracking (max N simultaneous uses per model)
 * - Capability-based matching (task → best model)
 * - Tier-based fallback (if preferred model is full, find similar)
 * - Cost-aware scheduling (prefer cheaper models for simple tasks)
 *
 * "The art of programming is the art of organizing complexity." - Dijkstra
 *
 * @author Mask Weaver
 */

import type { ModelPoolEntry, ModelTier, ModelCapability, ModelCostTier } from './config.js';
import { loadRuntimeConfig, normalizeDummyHumansConfig } from './config.js';

// ============================================================================
// Types
// ============================================================================

/** Runtime state for a model in the pool */
export interface ModelSlot {
  /** The model definition from config */
  entry: ModelPoolEntry;
  /** Current number of active uses */
  activeCount: number;
  /** Whether this model has available slots */
  available: boolean;
  /** Remaining available slots */
  remainingSlots: number;
}

/** Options for acquiring a model */
export interface AcquireOptions {
  /** Preferred tier (flash/human/premium) */
  tier?: ModelTier;
  /** Required capabilities (at least one must match) */
  capabilities?: ModelCapability[];
  /** Prefer lower cost when multiple models match */
  preferCheap?: boolean;
  /** Specific model ID to request */
  modelId?: string;
}

/** Result of a model acquisition attempt */
export interface AcquireResult {
  /** Whether a model was successfully acquired */
  success: boolean;
  /** The acquired model slot (if success) */
  slot?: ModelSlot;
  /** The agent name to use (e.g., "dummy-gemini-flash") */
  agentName?: string;
  /** Reason for failure (if not success) */
  reason?: string;
  /** Suggested alternative if primary choice unavailable */
  suggestion?: string;
}

/** Snapshot of all model statuses */
export interface RegistryStatus {
  /** All model slots with their current state */
  models: ModelSlot[];
  /** Total capacity across all models */
  totalCapacity: number;
  /** Currently in use */
  totalActive: number;
  /** Available slots */
  totalAvailable: number;
}

// ============================================================================
// Cost tier ordering
// ============================================================================

const COST_ORDER: Record<ModelCostTier, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// ============================================================================
// Tier fallback chain - when preferred tier is full
// ============================================================================

const TIER_FALLBACK: Record<ModelTier, ModelTier[]> = {
  flash:   ['human', 'premium'],     // Flash full → try human → premium
  human:   ['premium', 'flash'],     // Human full → try premium → flash
  premium: ['human', 'flash'],       // Premium full → try human → flash
};

// ============================================================================
// Model Registry
// ============================================================================

export class ModelRegistry {
  private pool: ModelPoolEntry[];
  private activeCountMap: Map<string, number> = new Map();

  constructor(pool: ModelPoolEntry[]) {
    this.pool = pool;
    // Initialize all counts to 0
    for (const entry of pool) {
      this.activeCountMap.set(entry.id, 0);
    }
  }

  // --------------------------------------------------------------------------
  // Core: Acquire / Release
  // --------------------------------------------------------------------------

  /**
   * Acquire a model from the pool.
   *
   * Selection strategy:
   * 1. If modelId specified → try that exact model
   * 2. Filter by tier preference
   * 3. Filter by required capabilities
   * 4. Among candidates, pick best available (cost-aware)
   * 5. If no match in preferred tier, try fallback tiers
   */
  acquire(options: AcquireOptions = {}): AcquireResult {
    const { tier, capabilities, preferCheap = true, modelId } = options;

    // Specific model requested
    if (modelId) {
      const entry = this.pool.find(e => e.id === modelId);
      if (!entry) {
        return { success: false, reason: `Model "${modelId}" not found in pool` };
      }
      return this.tryAcquire(entry);
    }

    // Tier + capabilities based selection
    const tiersToTry: ModelTier[] = [];
    if (tier) {
      tiersToTry.push(tier, ...TIER_FALLBACK[tier]);
    } else {
      // No tier specified → try all from cheapest
      tiersToTry.push('flash', 'human', 'premium');
    }

    for (const tryTier of tiersToTry) {
      const candidates = this.findCandidates(tryTier, capabilities);

      // Sort by availability then cost
      const sorted = this.sortCandidates(candidates, preferCheap);

      for (const entry of sorted) {
        const result = this.tryAcquire(entry);
        if (result.success) {
          // If we fell back to a different tier, note it
          if (tier && tryTier !== tier) {
            result.suggestion = `Preferred tier "${tier}" was full. Using "${tryTier}" model "${entry.id}" instead.`;
          }
          return result;
        }
      }
    }

    // All models exhausted
    return {
      success: false,
      reason: 'All suitable models are at maximum concurrency',
      suggestion: this.suggestWait(tier, capabilities),
    };
  }

  /**
   * Release a model back to the pool.
   * Must be called when a task using this model completes.
   */
  release(modelId: string): boolean {
    const current = this.activeCountMap.get(modelId);
    if (current === undefined) {
      return false; // Unknown model
    }
    if (current <= 0) {
      return false; // Already at 0
    }
    this.activeCountMap.set(modelId, current - 1);
    return true;
  }

  // --------------------------------------------------------------------------
  // Query: Status and availability
  // --------------------------------------------------------------------------

  /** Get the current status of all models in the pool */
  getStatus(): RegistryStatus {
    const models: ModelSlot[] = this.pool.map(entry => this.getSlot(entry));

    const totalCapacity = models.reduce((sum, m) => sum + m.entry.maxConcurrent, 0);
    const totalActive = models.reduce((sum, m) => sum + m.activeCount, 0);

    return {
      models,
      totalCapacity,
      totalActive,
      totalAvailable: totalCapacity - totalActive,
    };
  }

  /** Get available models for a specific tier */
  getAvailableForTier(tier: ModelTier): ModelSlot[] {
    return this.pool
      .filter(e => e.tier === tier)
      .map(e => this.getSlot(e))
      .filter(s => s.available);
  }

  /** Get all models with a specific capability */
  getModelsWithCapability(capability: ModelCapability): ModelSlot[] {
    return this.pool
      .filter(e => e.capabilities.includes(capability))
      .map(e => this.getSlot(e));
  }

  /** Get the total concurrency available for a tier (including fallbacks) */
  getTierConcurrency(tier: ModelTier): { total: number; available: number; models: string[] } {
    const tiersToInclude = [tier, ...TIER_FALLBACK[tier]];
    const entries = this.pool.filter(e => tiersToInclude.includes(e.tier));

    let total = 0;
    let available = 0;
    const models: string[] = [];

    for (const entry of entries) {
      const slot = this.getSlot(entry);
      total += entry.maxConcurrent;
      available += slot.remainingSlots;
      if (slot.available) models.push(entry.id);
    }

    return { total, available, models };
  }

  /** Get the pool entries */
  getPool(): ModelPoolEntry[] {
    return [...this.pool];
  }

  /** Get the agent name for a pool entry */
  getAgentName(entry: ModelPoolEntry): string {
    return `dummy-${entry.id}`;
  }

  // --------------------------------------------------------------------------
  // Recommend: Smart model selection
  // --------------------------------------------------------------------------

  /**
   * Recommend the best model for a task based on its capabilities.
   * Does NOT acquire — just suggests.
   */
  recommend(options: AcquireOptions = {}): ModelPoolEntry | null {
    const { tier, capabilities, preferCheap = true } = options;

    const tiersToTry: ModelTier[] = tier
      ? [tier, ...TIER_FALLBACK[tier]]
      : ['flash', 'human', 'premium'];

    for (const tryTier of tiersToTry) {
      const candidates = this.findCandidates(tryTier, capabilities);
      const sorted = this.sortCandidates(candidates, preferCheap);

      for (const entry of sorted) {
        const slot = this.getSlot(entry);
        if (slot.available) {
          return entry;
        }
      }
    }

    return null;
  }

  /**
   * Compute maximum parallelism for a set of tasks.
   * Given N tasks of different tiers, returns how many can run simultaneously.
   */
  computeMaxParallelism(taskTiers: ModelTier[]): number {
    // Count tasks per tier
    const tierCounts = new Map<ModelTier, number>();
    for (const tier of taskTiers) {
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    }

    // For each tier, compute available concurrency
    let maxParallel = 0;
    for (const [tier, count] of tierCounts) {
      const entries = this.pool.filter(e => e.tier === tier);
      const tierCapacity = entries.reduce((sum, e) => sum + e.maxConcurrent, 0);
      maxParallel += Math.min(count, tierCapacity);
    }

    return maxParallel;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private getSlot(entry: ModelPoolEntry): ModelSlot {
    const activeCount = this.activeCountMap.get(entry.id) ?? 0;
    const remainingSlots = entry.maxConcurrent - activeCount;
    return {
      entry,
      activeCount,
      available: remainingSlots > 0,
      remainingSlots: Math.max(0, remainingSlots),
    };
  }

  private tryAcquire(entry: ModelPoolEntry): AcquireResult {
    const slot = this.getSlot(entry);
    if (!slot.available) {
      return {
        success: false,
        reason: `Model "${entry.id}" at max concurrency (${entry.maxConcurrent})`,
      };
    }

    // Increment active count
    this.activeCountMap.set(entry.id, slot.activeCount + 1);

    return {
      success: true,
      slot: {
        ...slot,
        activeCount: slot.activeCount + 1,
        remainingSlots: slot.remainingSlots - 1,
        available: slot.remainingSlots - 1 > 0,
      },
      agentName: this.getAgentName(entry),
    };
  }

  private findCandidates(tier: ModelTier, capabilities?: ModelCapability[]): ModelPoolEntry[] {
    return this.pool.filter(entry => {
      // Must match tier
      if (entry.tier !== tier) return false;

      // If capabilities specified, at least one must match
      if (capabilities && capabilities.length > 0) {
        const hasMatch = capabilities.some(c => entry.capabilities.includes(c));
        if (!hasMatch) return false;
      }

      return true;
    });
  }

  private sortCandidates(entries: ModelPoolEntry[], preferCheap: boolean): ModelPoolEntry[] {
    return [...entries].sort((a, b) => {
      // 1. Available slots first
      const slotA = this.getSlot(a);
      const slotB = this.getSlot(b);
      if (slotA.available && !slotB.available) return -1;
      if (!slotA.available && slotB.available) return 1;

      // 2. Cost ordering
      if (preferCheap) {
        const costDiff = COST_ORDER[a.costTier] - COST_ORDER[b.costTier];
        if (costDiff !== 0) return costDiff;
      }

      // 3. More remaining slots = better
      return slotB.remainingSlots - slotA.remainingSlots;
    });
  }

  private suggestWait(tier?: ModelTier, capabilities?: ModelCapability[]): string {
    const status = this.getStatus();
    const busiest = status.models
      .filter(m => m.activeCount > 0)
      .sort((a, b) => b.activeCount - a.activeCount);

    if (busiest.length === 0) {
      return 'No models are configured in the pool.';
    }

    const hints = busiest.slice(0, 3).map(m =>
      `  - ${m.entry.id}: ${m.activeCount}/${m.entry.maxConcurrent} in use`
    );

    return `All models are busy. Current usage:\n${hints.join('\n')}\nWait for a task to complete or add more models to the pool.`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: ModelRegistry | null = null;

/**
 * Get the global model registry.
 * Lazily initialized from maskweaver.config.json.
 */
export function getModelRegistry(basePath?: string): ModelRegistry {
  if (!registryInstance) {
    const config = loadRuntimeConfig(basePath);
    const pool = config.dummyHumans
      ? normalizeDummyHumansConfig(config.dummyHumans)
      : [];
    registryInstance = new ModelRegistry(pool);
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing or config reload).
 */
export function resetModelRegistry(): void {
  registryInstance = null;
}

/**
 * Create a fresh registry from explicit pool entries.
 */
export function createModelRegistry(pool: ModelPoolEntry[]): ModelRegistry {
  registryInstance = new ModelRegistry(pool);
  return registryInstance;
}
