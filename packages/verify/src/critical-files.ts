/**
 * Critical File Detection
 * 
 * Identifies files that require extra scrutiny
 */

/**
 * Default critical file patterns
 */
export const DEFAULT_CRITICAL_PATTERNS = [
  // Authentication and authorization
  "**/auth/**",
  "**/authentication/**",
  "**/authorization/**",
  "**/login/**",
  "**/session/**",
  "**/jwt/**",
  "**/oauth/**",
  
  // Payment and billing
  "**/payment/**",
  "**/billing/**",
  "**/checkout/**",
  "**/stripe/**",
  "**/paypal/**",
  
  // Security-sensitive
  "**/security/**",
  "**/crypto/**",
  "**/encryption/**",
  "**/password/**",
  
  // Credentials and secrets
  "**/.env",
  "**/.env.*",
  "**/credentials.*",
  "**/secrets.*",
  "**/config/production.*",
  "**/keys/**",
  
  // Database migrations
  "**/migrations/**",
  "**/migrate/**",
  
  // Infrastructure
  "**/deploy/**",
  "**/deployment/**",
  "**/infrastructure/**",
  
  // Admin and privileged operations
  "**/admin/**",
  "**/superuser/**",
  "**/sudo/**",
];

/**
 * Simple glob pattern matcher
 * Supports: * (any chars except /), ** (any path segments), ? (single char except /)
 */
function matchGlob(pattern: string, path: string): boolean {
  // Normalize paths
  const p = path.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");
  
  // Build regex character by character
  let r = "";
  let i = 0;
  
  while (i < pat.length) {
    if (pat.substring(i, i + 3) === "**/") {
      // **/ means optional directory prefix
      r += "(?:.*/)?";
      i += 3;
    } else if (pat.substring(i, i + 2) === "**") {
      // ** means any characters
      r += ".*";
      i += 2;
    } else if (pat[i] === "*") {
      // * means any non-slash characters
      r += "[^/]*";
      i++;
    } else if (pat[i] === "?") {
      // ? means one non-slash character
      r += "[^/]";
      i++;
    } else {
      // Regular character - escape if special regex char
      const ch = pat[i];
      if (".+^${}()|[]\\".includes(ch)) {
        r += "\\" + ch;
      } else {
        r += ch;
      }
      i++;
    }
  }
  
  // Anchor and compile
  const regex = new RegExp("^" + r + "$");
  return regex.test(p);
}

/**
 * Check if a file path matches critical file patterns
 */
export function isCriticalFile(
  filePath: string,
  patterns: string[] = DEFAULT_CRITICAL_PATTERNS
): boolean {
  return patterns.some(pattern => matchGlob(pattern, filePath));
}

/**
 * Get matched critical patterns for a file
 */
export function getMatchedPatterns(
  filePath: string,
  patterns: string[] = DEFAULT_CRITICAL_PATTERNS
): string[] {
  return patterns.filter(pattern => matchGlob(pattern, filePath));
}

/**
 * Categorize criticality level
 */
export function getCriticalityLevel(filePath: string): "critical" | "sensitive" | "normal" {
  const matched = getMatchedPatterns(filePath);
  
  if (matched.length === 0) {
    return "normal";
  }
  
  // Check for highly critical patterns
  const highCritical = [
    "**/.env",
    "**/credentials.*",
    "**/secrets.*",
    "**/keys/**",
    "**/payment/**",
    "**/billing/**",
  ];
  
  if (matched.some(m => highCritical.some(hc => m === hc))) {
    return "critical";
  }
  
  return "sensitive";
}
