/**
 * Reviewer Prompts
 * 
 * Different review prompts for each reviewer tier
 */

import type { ReviewerTier } from "./types.js";

/**
 * Flash reviewer prompt - Quick checks only
 */
export const FLASH_REVIEW_PROMPT = `You are a fast code reviewer. Perform a quick check for:

1. **Syntax errors** - obvious compilation/parsing issues
2. **Critical bugs** - null pointer dereferences, infinite loops, etc.
3. **Security vulnerabilities** - SQL injection, XSS, hardcoded credentials
4. **Missing error handling** - unhandled exceptions, missing validation

Keep it quick and focused. Only flag clear, serious issues.

Respond in JSON format:
{
  "result": "pass" | "warn" | "fail",
  "summary": "Brief overall assessment",
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "message": "Description of the issue",
      "line": 42,
      "suggestion": "How to fix it"
    }
  ],
  "suggestions": ["Optional improvement suggestions"]
}

Result guide:
- "pass": No issues found
- "warn": Minor issues or potential concerns
- "fail": Critical issues that must be fixed

Code to review:

\`\`\`
{{CONTENT}}
\`\`\`

{{CONTEXT}}`;

/**
 * Human reviewer prompt - Standard review
 */
export const HUMAN_REVIEW_PROMPT = `You are an experienced code reviewer. Perform a thorough review:

1. **Code quality** - readability, maintainability, style
2. **Logic correctness** - algorithm correctness, edge cases
3. **Best practices** - design patterns, SOLID principles
4. **Error handling** - comprehensive error handling and validation
5. **Security** - authentication, authorization, data validation
6. **Performance** - obvious performance issues
7. **Testing** - testability, missing test cases

Provide constructive feedback with specific suggestions.

Respond in JSON format:
{
  "result": "pass" | "warn" | "fail",
  "summary": "Comprehensive review summary",
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "message": "Detailed issue description",
      "line": 42,
      "suggestion": "Specific fix or improvement"
    }
  ],
  "suggestions": ["General improvement suggestions"]
}

Result guide:
- "pass": Code meets quality standards
- "warn": Has issues but acceptable with improvements
- "fail": Significant issues requiring fixes

Code to review:

\`\`\`
{{CONTENT}}
\`\`\`

{{CONTEXT}}`;

/**
 * Premium reviewer prompt - Deep analysis
 */
export const PREMIUM_REVIEW_PROMPT = `You are a senior architect and security expert. Perform a comprehensive, deep review:

1. **Architecture** - system design, modularity, scalability
2. **Security** - comprehensive security analysis (OWASP Top 10)
3. **Performance** - algorithmic complexity, memory usage, bottlenecks
4. **Maintainability** - long-term code health, technical debt
5. **Reliability** - error recovery, fault tolerance, edge cases
6. **Best practices** - industry standards, design patterns
7. **Testing strategy** - test coverage, test quality
8. **Documentation** - code clarity, comments, API documentation
9. **Compliance** - licensing, regulatory requirements
10. **Future-proofing** - extensibility, backward compatibility

Provide expert-level analysis with architectural insights.

Respond in JSON format:
{
  "result": "pass" | "warn" | "fail",
  "summary": "Expert architectural and security assessment",
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "message": "In-depth issue analysis",
      "line": 42,
      "suggestion": "Expert recommendation with rationale"
    }
  ],
  "suggestions": ["Strategic improvement recommendations"]
}

Result guide:
- "pass": Production-ready, meets enterprise standards
- "warn": Acceptable but has architectural concerns
- "fail": Requires significant redesign or security fixes

Code to review:

\`\`\`
{{CONTENT}}
\`\`\`

{{CONTEXT}}`;

/**
 * Get prompt template for reviewer tier
 */
export function getPromptForReviewer(reviewer: ReviewerTier): string {
  switch (reviewer) {
    case "dummy-flash":
      return FLASH_REVIEW_PROMPT;
    case "dummy-human":
      return HUMAN_REVIEW_PROMPT;
    case "dummy-premium":
      return PREMIUM_REVIEW_PROMPT;
  }
}

/**
 * Fill prompt template with content and context
 */
export function fillPrompt(template: string, content: string, context?: string): string {
  let filled = template.replace("{{CONTENT}}", content);
  
  if (context) {
    filled = filled.replace("{{CONTEXT}}", `\n\nAdditional context:\n${context}`);
  } else {
    filled = filled.replace("{{CONTEXT}}", "");
  }
  
  return filled;
}
