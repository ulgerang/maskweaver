/**
 * Error handling for Maskweaver
 */

/**
 * Base error class for all Maskweaver errors
 */
export class MaskweaverError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MaskweaverError";
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, MaskweaverError);
    }
  }
}

/**
 * Configuration error
 */
export class ConfigError extends MaskweaverError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", context);
    this.name = "ConfigError";
  }
}

/**
 * Provider error (for memory providers, etc.)
 */
export class ProviderError extends MaskweaverError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "PROVIDER_ERROR", context);
    this.name = "ProviderError";
  }
}

/**
 * Storage error
 */
export class StorageError extends MaskweaverError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "STORAGE_ERROR", context);
    this.name = "StorageError";
  }
}

/**
 * Validation error
 */
export class ValidationError extends MaskweaverError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", context);
    this.name = "ValidationError";
  }
}
