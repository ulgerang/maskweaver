import { describe, expect, test } from "vitest";
import {
  isCompletionSoundEnabled,
  validateConfig,
} from "../src/plugin/config/index.js";

describe("plugin config completion sound", () => {
  test("defaults to disabled when unset", () => {
    expect(isCompletionSoundEnabled({})).toBe(false);
  });

  test("reads explicit enabled flag", () => {
    expect(
      isCompletionSoundEnabled({
        notifications: {
          completionSound: {
            enabled: true,
          },
        },
      })
    ).toBe(true);

    expect(
      isCompletionSoundEnabled({
        notifications: {
          completionSound: {
            enabled: false,
          },
        },
      })
    ).toBe(false);
  });

  test("validates notifications shape", () => {
    const valid = validateConfig({
      notifications: {
        completionSound: {
          enabled: true,
        },
      },
    });
    expect(valid).toEqual([]);

    const invalid = validateConfig({
      notifications: {
        completionSound: {
          enabled: "yes" as unknown as boolean,
        },
      },
    });
    expect(invalid).toContain("notifications.completionSound.enabled must be a boolean");
  });
});
