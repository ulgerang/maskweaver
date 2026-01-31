/**
 * Verification System Tests
 * 
 * Basic tests to verify the system works correctly
 */

import { test, expect, describe } from "bun:test";
import {
  createVerifier,
  quickVerify,
  isCriticalFile,
  getCriticalityLevel,
  shouldEscalate,
  getNextReviewer,
  getEscalationPath,
  COST_RATES,
} from "../src/index.js";
import type { VerifyConfig } from "../src/index.js";

describe("Verify System", () => {
  test("should create verifier with config", () => {
    const config: VerifyConfig = {
      mode: "auto",
      reviewer: "dummy-flash",
      escalation: {
        onWarn: "dummy-human",
        onFail: "dummy-premium",
      },
      budget: {
        maxPerSessionUSD: 1.0,
        maxPerCheckUSD: 0.1,
      },
      triggers: {
        onWrite: true,
        onTestFail: true,
      },
    };

    const verifier = createVerifier(config);
    expect(verifier).toBeDefined();
  });

  test("should perform quick verification", async () => {
    const response = await quickVerify("const x = 42;", {
      reviewer: "dummy-flash",
      context: "Simple variable declaration",
    });

    expect(response).toBeDefined();
    expect(response.reviewer).toBe("dummy-flash");
    expect(response.cost).toBeGreaterThan(0);
  });

  test("should track budget correctly", async () => {
    const config: VerifyConfig = {
      mode: "auto",
      reviewer: "dummy-flash",
      escalation: {},
      budget: {
        maxPerSessionUSD: 0.01,
        maxPerCheckUSD: 0.01,
      },
      triggers: {},
    };

    const verifier = createVerifier(config);
    const budgetBefore = verifier.getBudgetState();
    
    expect(budgetBefore.sessionTotal).toBe(0);
  });
});

describe("Critical Files", () => {
  test("should detect auth files as critical", () => {
    expect(isCriticalFile("src/auth/login.ts")).toBe(true);
    expect(isCriticalFile("lib/authentication/oauth.js")).toBe(true);
    expect(isCriticalFile("services/authorization/roles.ts")).toBe(true);
  });

  test("should detect payment files as critical", () => {
    expect(isCriticalFile("src/payment/stripe.ts")).toBe(true);
    expect(isCriticalFile("api/billing/invoice.js")).toBe(true);
  });

  test("should detect credential files as critical", () => {
    expect(isCriticalFile(".env")).toBe(true);
    expect(isCriticalFile("config/.env.production")).toBe(true);
    expect(isCriticalFile("secrets/credentials.json")).toBe(true);
  });

  test("should not flag normal files as critical", () => {
    expect(isCriticalFile("src/utils/helpers.ts")).toBe(false);
    expect(isCriticalFile("components/Button.tsx")).toBe(false);
    expect(isCriticalFile("README.md")).toBe(false);
  });

  test("should categorize criticality levels", () => {
    expect(getCriticalityLevel(".env")).toBe("critical");
    expect(getCriticalityLevel("src/payment/checkout.ts")).toBe("critical");
    expect(getCriticalityLevel("src/auth/login.ts")).toBe("sensitive");
    expect(getCriticalityLevel("src/utils/format.ts")).toBe("normal");
  });
});

describe("Escalation", () => {
  test("should determine escalation correctly", () => {
    const config: VerifyConfig = {
      mode: "auto",
      reviewer: "dummy-flash",
      escalation: {
        onWarn: "dummy-human",
        onFail: "dummy-premium",
      },
      budget: {
        maxPerSessionUSD: 1.0,
        maxPerCheckUSD: 0.1,
      },
      triggers: {},
    };

    expect(shouldEscalate("pass", config)).toBe(false);
    expect(shouldEscalate("warn", config)).toBe(true);
    expect(shouldEscalate("fail", config)).toBe(true);
  });

  test("should get next reviewer in chain", () => {
    const configWithExplicitEscalation: VerifyConfig = {
      mode: "auto",
      reviewer: "dummy-flash",
      escalation: {
        onFail: "dummy-premium",
      },
      budget: {
        maxPerSessionUSD: 1.0,
        maxPerCheckUSD: 0.1,
      },
      triggers: {},
    };

    // With explicit escalation config, always returns configured value
    expect(getNextReviewer("dummy-flash", "fail", configWithExplicitEscalation)).toBe("dummy-premium");
    
    // Test default chain without explicit config
    const configDefaultChain: VerifyConfig = {
      mode: "auto",
      reviewer: "dummy-flash",
      escalation: {},
      budget: {
        maxPerSessionUSD: 1.0,
        maxPerCheckUSD: 0.1,
      },
      triggers: {},
    };
    
    expect(getNextReviewer("dummy-flash", "fail", configDefaultChain)).toBe("dummy-human");
    expect(getNextReviewer("dummy-human", "fail", configDefaultChain)).toBe("dummy-premium");
    expect(getNextReviewer("dummy-premium", "fail", configDefaultChain)).toBeNull();
  });

  test("should build escalation path", () => {
    const config: VerifyConfig = {
      mode: "auto",
      reviewer: "dummy-flash",
      escalation: {},
      budget: {
        maxPerSessionUSD: 1.0,
        maxPerCheckUSD: 0.1,
      },
      triggers: {},
    };

    const path = getEscalationPath("dummy-flash", config);
    expect(path).toEqual(["dummy-flash", "dummy-human", "dummy-premium"]);
  });
});

describe("Cost Rates", () => {
  test("should have correct cost rates", () => {
    expect(COST_RATES["dummy-flash"]).toBe(0.0001);
    expect(COST_RATES["dummy-human"]).toBe(0.003);
    expect(COST_RATES["dummy-premium"]).toBe(0.015);
  });

  test("flash should be cheapest", () => {
    expect(COST_RATES["dummy-flash"]).toBeLessThan(COST_RATES["dummy-human"]);
    expect(COST_RATES["dummy-human"]).toBeLessThan(COST_RATES["dummy-premium"]);
  });
});
