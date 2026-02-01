/**
 * Maskweaver - AI Expert Persona System
 * 
 * 가면술사: AI 코딩 어시스턴트에게 전문가 인격을 부여하는 시스템
 * 
 * @version 0.7.0
 * @author ULJI SOFT <ulgerang@gmail.com>
 * @license MIT
 */

// ============================================================================
// Module Exports (use subpath imports for specific modules)
// ============================================================================

// Core: Schema, validation, prompt builder
export * as core from "./core/index.js";

// Shared: Errors, types, config
export * as shared from "./shared/index.js";

// Memory: Embedding, vector search
export * as memory from "./memory/index.js";

// Context: Feature context management
export * as context from "./context/index.js";

// Retrospect: Session retrospective
export * as retrospect from "./retrospect/index.js";

// Verify: Code verification
export * as verify from "./verify/index.js";

// ============================================================================
// Plugin Exports (default export)
// ============================================================================
export { MaskweaverPlugin, default } from "./plugin/index.js";
