# @maskweaver/verify

Complete verification system for automated code quality checks using tiered AI reviewers.

## Overview

The verify package implements a multi-tier code review system that automatically escalates issues to more capable reviewers:

1. **dummy-flash**: Fast, cheap initial review (syntax errors, obvious bugs)
2. **dummy-human**: Standard review (logic, best practices, security)
3. **dummy-premium**: Deep expert review (architecture, performance, compliance)

## Installation

```bash
pnpm add @maskweaver/verify
```

## Quick Start

```typescript
import { quickVerify } from '@maskweaver/verify';

// Quick verification
const result = await quickVerify(`
function processPayment(amount) {
  // Missing validation!
  return charge(amount);
}
`, {
  reviewer: 'dummy-flash',
  context: 'Payment processing function',
});

console.log(result.summary);
console.log(result.issues);
```

## Configuration

```typescript
import { createVerifier } from '@maskweaver/verify';

const verifier = createVerifier({
  mode: 'auto',           // auto | manual | off
  reviewer: 'dummy-flash', // Starting reviewer tier
  
  escalation: {
    onWarn: 'dummy-human',    // Escalate warnings to human
    onFail: 'dummy-premium',  // Escalate failures to premium
  },
  
  budget: {
    maxPerSessionUSD: 1.0,  // Session spending limit
    maxPerCheckUSD: 0.1,     // Per-check spending limit
  },
  
  triggers: {
    onWrite: true,           // Auto-verify on file write
    onTestFail: true,        // Auto-verify on test failure
    onCriticalFile: true,    // Auto-verify critical files
  },
  
  criticalFiles: [          // Custom critical file patterns
    '**/payment/**',
    '**/auth/**',
    '**/.env',
  ],
});
```

## Usage

### Basic Verification

```typescript
const response = await verifier.verify({
  trigger: 'onRequest',
  content: sourceCode,
  context: 'User authentication module',
  filePath: 'src/auth/login.ts',
});

if (response.result === 'fail') {
  console.error('Critical issues found:', response.issues);
} else if (response.result === 'warn') {
  console.warn('Warnings:', response.suggestions);
}
```

### Check Critical Files

```typescript
import { isCriticalFile, getCriticalityLevel } from '@maskweaver/verify';

if (isCriticalFile('src/payment/stripe.ts')) {
  console.log('This is a critical file - using premium reviewer');
}

const level = getCriticalityLevel('.env');
// Returns: "critical" | "sensitive" | "normal"
```

### Budget Tracking

```typescript
const budget = verifier.getBudgetState();

console.log(`Spent: $${budget.sessionTotal.toFixed(4)}`);
console.log(`Remaining: $${(budget.sessionLimit - budget.sessionTotal).toFixed(4)}`);

if (budget.exceeded) {
  console.warn('Budget limit reached!');
}
```

### Custom Prompts

```typescript
import { getPromptForReviewer, fillPrompt } from '@maskweaver/verify';

const prompt = getPromptForReviewer('dummy-premium');
const filled = fillPrompt(prompt, sourceCode, 'Security-critical module');
```

## Escalation Flow

```
1. Code Change Detected
   ↓
2. Check if Critical File?
   Yes → Start with dummy-human or dummy-premium
   No  → Start with dummy-flash
   ↓
3. Run Review
   ↓
4. Analyze Result
   ├─ PASS → Done ✓
   ├─ WARN → Escalate to dummy-human
   └─ FAIL → Escalate to dummy-premium
   ↓
5. Final Review
   └─ Return Results
```

## Cost Rates

| Reviewer       | Cost per 1K tokens | Typical Use Case            |
|----------------|--------------------|-----------------------------|
| dummy-flash    | $0.0001            | Quick syntax checks         |
| dummy-human    | $0.0030            | Standard code review        |
| dummy-premium  | $0.0150            | Deep security/arch analysis |

## Critical File Patterns

Default patterns that trigger enhanced review:

- **Auth**: `**/auth/**`, `**/authentication/**`, `**/login/**`
- **Payment**: `**/payment/**`, `**/billing/**`, `**/checkout/**`
- **Security**: `**/security/**`, `**/crypto/**`, `**/encryption/**`
- **Secrets**: `**/.env`, `**/credentials.*`, `**/secrets.*`
- **Infrastructure**: `**/deploy/**`, `**/infrastructure/**`
- **Admin**: `**/admin/**`, `**/superuser/**`

## API Reference

### Core Functions

- `createVerifier(config)` - Create a verifier instance
- `quickVerify(content, options?)` - One-off verification

### Critical Files

- `isCriticalFile(path, patterns?)` - Check if file is critical
- `getCriticalityLevel(path)` - Get criticality: critical | sensitive | normal
- `getMatchedPatterns(path, patterns?)` - Get matched patterns

### Escalation

- `shouldEscalate(result, config)` - Check if escalation needed
- `getNextReviewer(current, reason, config)` - Get next tier
- `getEscalationPath(from, config)` - Get full escalation path
- `canEscalate(reviewer)` - Check if further escalation possible

### Budget

- `createBudgetTracker(config)` - Create budget tracker
- `budgetTracker.estimateCost(content, context, reviewer)` - Estimate cost
- `budgetTracker.canProceed(cost)` - Check if within budget
- `budgetTracker.recordCost(cost)` - Record actual cost
- `budgetTracker.getState()` - Get current budget state

## TypeScript Types

```typescript
type VerifyMode = "auto" | "manual" | "off";
type ReviewerTier = "dummy-flash" | "dummy-human" | "dummy-premium";
type VerifyTrigger = "onWrite" | "onTestFail" | "onRequest" | "onCriticalFile";
type VerifyResult = "pass" | "warn" | "fail";

interface VerifyResponse {
  result: VerifyResult;
  reviewer: ReviewerTier;
  summary: string;
  issues?: VerifyIssue[];
  suggestions?: string[];
  cost: number;
  escalated: boolean;
}

interface VerifyIssue {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  suggestion?: string;
}
```

## License

MIT
