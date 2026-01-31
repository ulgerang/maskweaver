/**
 * Embedding Provider Usage Examples
 * 
 * Practical examples showing how to use the provider system.
 */

import {
  createProvider,
  selectBestProvider,
  getDefaultConfigs,
  type IEmbeddingProvider,
  type ProviderConfig
} from "./index.js";

// ============================================================================
// Example 1: Auto-selection (Recommended)
// ============================================================================

async function example1_autoSelection() {
  console.log("Example 1: Auto-selection with graceful degradation\n");

  // Let the system choose the best available provider
  const provider = await selectBestProvider(getDefaultConfigs());

  console.log(`✓ Selected: ${provider.name}`);
  console.log(`  Type: ${provider.type}`);
  console.log(`  Dimensions: ${provider.dimensions}\n`);

  // Use it!
  const embeddings = await provider.embed([
    "Hello, world!",
    "TypeScript is awesome"
  ]);

  console.log(`Generated ${embeddings.length} embeddings`);
  console.log(`Each embedding has ${embeddings[0].length} dimensions\n`);
}

// ============================================================================
// Example 2: Manual Provider Selection
// ============================================================================

async function example2_manualSelection() {
  console.log("Example 2: Manual provider selection\n");

  // For local development - privacy-first
  const localProvider = createProvider({
    type: "ollama",
    model: "nomic-embed-text"
  });

  console.log(`Using: ${localProvider.name}`);

  // Check health before using
  const health = await localProvider.healthCheck();
  if (!health.ok) {
    console.error(`❌ ${health.reason}`);
    if (health.hint) {
      console.log(`💡 Hint: ${health.hint}`);
    }
    return;
  }

  console.log("✓ Provider is healthy\n");

  const embeddings = await localProvider.embed(["Test document"]);
  console.log(`Generated embedding with ${embeddings[0].length} dimensions\n`);
}

// ============================================================================
// Example 3: Code-Specialized Embedding
// ============================================================================

async function example3_codeEmbedding() {
  console.log("Example 3: Code-specialized embedding with Voyage\n");

  const codeProvider = createProvider({
    type: "voyage",
    model: "voyage-code-3",
    dimensions: 1024,
    apiKey: process.env.VOYAGE_API_KEY
  });

  // Code snippets
  const codeSnippets = [
    "function fibonacci(n: number): number { return n < 2 ? n : fibonacci(n-1) + fibonacci(n-2); }",
    "const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1);",
    "class Stack<T> { private items: T[] = []; push(item: T) { this.items.push(item); } }"
  ];

  // Use code-specific embedding
  if (codeProvider.embedCode) {
    const embeddings = await codeProvider.embedCode(codeSnippets);
    console.log(`Generated ${embeddings.length} code embeddings`);
    console.log(`Optimized for code similarity search\n`);
  }
}

// ============================================================================
// Example 4: Asymmetric Search (Query vs Document)
// ============================================================================

async function example4_asymmetricSearch() {
  console.log("Example 4: Asymmetric search with Voyage\n");

  const provider = createProvider({
    type: "voyage",
    model: "voyage-4-lite",
    apiKey: process.env.VOYAGE_API_KEY
  });

  // Documents (what you're searching through)
  const documents = [
    "TypeScript is a strongly typed programming language that builds on JavaScript.",
    "Python is an interpreted, high-level programming language with dynamic semantics.",
    "Rust is a systems programming language focused on safety and performance."
  ];

  // Query (what the user is searching for)
  const query = "What is a type-safe language?";

  // Embed documents
  const docEmbeddings = await provider.embed(documents);

  // Embed query (optimized differently)
  let queryEmbedding: number[];
  if (provider.embedQuery) {
    queryEmbedding = await provider.embedQuery(query);
    console.log("✓ Used query-optimized embedding");
  } else {
    [queryEmbedding] = await provider.embed([query]);
    console.log("✓ Used standard embedding");
  }

  // Compute cosine similarity (simplified)
  const similarities = docEmbeddings.map((docEmb) => {
    const dotProduct = docEmb.reduce((sum, val, i) => sum + val * queryEmbedding[i], 0);
    const magnitude1 = Math.sqrt(docEmb.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitude1 * magnitude2);
  });

  // Show results
  console.log("\nSearch results:");
  similarities
    .map((sim, i) => ({ doc: documents[i], similarity: sim }))
    .sort((a, b) => b.similarity - a.similarity)
    .forEach((result, i) => {
      console.log(`${i + 1}. [${result.similarity.toFixed(3)}] ${result.doc}`);
    });
  console.log();
}

// ============================================================================
// Example 5: Custom Priority Order
// ============================================================================

async function example5_customPriority() {
  console.log("Example 5: Custom priority order\n");

  // Try local first, then cloud
  const customConfigs: ProviderConfig[] = [
    { type: "ollama" },                     // Free, local
    { type: "openai", dimensions: 512 },   // Cheap, small dimensions
    { type: "text-only" }                   // Ultimate fallback
  ];

  const provider = await selectBestProvider(customConfigs);

  console.log(`Selected: ${provider.name}`);
  console.log(`Strategy: Try local → Try cheap cloud → Fallback\n`);
}

// ============================================================================
// Example 6: Production Configuration
// ============================================================================

async function example6_production() {
  console.log("Example 6: Production-ready configuration\n");

  // Production setup with redundancy
  const productionConfigs: ProviderConfig[] = [
    // Primary: High-quality embeddings
    {
      type: "openai",
      model: "text-embedding-3-large",
      dimensions: 3072
    },
    // Fallback 1: Smaller but still good
    {
      type: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536
    },
    // Fallback 2: Alternative provider
    {
      type: "voyage",
      model: "voyage-4-lite",
      dimensions: 1024
    },
    // Fallback 3: Multi-provider gateway
    {
      type: "openrouter",
      model: "openai/text-embedding-3-small"
    }
  ];

  const provider = await selectBestProvider(productionConfigs);

  console.log(`✓ Production provider: ${provider.name}`);
  console.log(`  Dimensions: ${provider.dimensions}`);
  console.log(`  Type: ${provider.type}\n`);
}

// ============================================================================
// Example 7: Batch Processing
// ============================================================================

async function example7_batchProcessing() {
  console.log("Example 7: Efficient batch processing\n");

  const provider = await selectBestProvider(getDefaultConfigs());

  // Efficient: Single API call
  const startTime = Date.now();
  
  const texts = Array.from(
    { length: 100 },
    (_, i) => `Document number ${i + 1} with some content`
  );

  const embeddings = await provider.embed(texts);
  
  const duration = Date.now() - startTime;

  console.log(`✓ Embedded ${embeddings.length} documents in ${duration}ms`);
  console.log(`  Average: ${(duration / embeddings.length).toFixed(2)}ms per document\n`);
}

// ============================================================================
// Example 8: Error Handling
// ============================================================================

async function example8_errorHandling() {
  console.log("Example 8: Proper error handling\n");

  try {
    // Invalid configuration
    const provider = createProvider({
      type: "openai",
      dimensions: 999  // Invalid dimension!
    } as any);

    await provider.embed(["test"]);
  } catch (error) {
    console.error("❌ Caught error:", error instanceof Error ? error.message : error);
    console.log("✓ Errors are clear and actionable\n");
  }
}

// ============================================================================
// Example 9: Health Monitoring
// ============================================================================

async function example9_healthMonitoring() {
  console.log("Example 9: Health monitoring\n");

  const providers = [
    createProvider({ type: "ollama" }),
    createProvider({ type: "text-only" })
  ];

  for (const provider of providers) {
    const health = await provider.healthCheck();
    
    console.log(`${provider.name}:`);
    console.log(`  Status: ${health.ok ? "✓ Healthy" : "✗ Unhealthy"}`);
    
    if (health.reason) {
      console.log(`  Reason: ${health.reason}`);
    }
    if (health.hint) {
      console.log(`  Hint: ${health.hint}`);
    }
    console.log();
  }
}

// ============================================================================
// Example 10: Testing Setup
// ============================================================================

async function example10_testing() {
  console.log("Example 10: Testing setup\n");

  // Use text-only provider for fast tests
  const testProvider = createProvider({ type: "text-only" });

  console.log("Test provider setup:");
  console.log(`  Name: ${testProvider.name}`);
  console.log(`  No API calls: ✓`);
  console.log(`  Always available: ✓`);
  console.log(`  Fast: ✓`);

  const embeddings = await testProvider.embed(["test1", "test2", "test3"]);
  console.log(`  Generated ${embeddings.length} mock embeddings\n`);
}

// ============================================================================
// Run Examples
// ============================================================================

async function runExamples() {
  const examples = [
    example1_autoSelection,
    example2_manualSelection,
    example3_codeEmbedding,
    example4_asymmetricSearch,
    example5_customPriority,
    example6_production,
    example7_batchProcessing,
    example8_errorHandling,
    example9_healthMonitoring,
    example10_testing
  ];

  for (const example of examples) {
    try {
      await example();
    } catch (error) {
      console.error(`Error in ${example.name}:`, error);
    }
    console.log("─".repeat(80) + "\n");
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export {
  example1_autoSelection,
  example2_manualSelection,
  example3_codeEmbedding,
  example4_asymmetricSearch,
  example5_customPriority,
  example6_production,
  example7_batchProcessing,
  example8_errorHandling,
  example9_healthMonitoring,
  example10_testing
};
