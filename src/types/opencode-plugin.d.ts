/**
 * Type declarations for @opencode-ai/plugin
 * 
 * Minimal type definitions for OpenCode plugin system.
 * Based on the actual plugin API from OpenCode.
 */

declare module "@opencode-ai/plugin" {
  import { z } from "zod";

  export interface PluginContext {
    client: PluginClient;
    directory: string;
  }

  export interface PluginClient {
    app: {
      log(entry: LogEntry): void;
    };
  }

  export interface LogEntry {
    service: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
  }

  export interface PluginEvent {
    type: string;
    [key: string]: unknown;
  }

  export interface PluginHooks {
    "experimental.chat.system.transform"?: (
      input: unknown,
      output: { system?: string[] }
    ) => Promise<void>;
    tool?: Record<string, ToolDefinition>;
    event?: (context: { event: PluginEvent }) => Promise<void>;
    config?: (config: any) => Promise<void>;
  }

  export interface ToolDefinition {
    description: string;
    args: z.ZodType<unknown>;
    execute(args: unknown, context?: unknown): Promise<string | object>;
  }

  export type Plugin = (context: PluginContext) => Promise<PluginHooks>;

  // Tool helper
  export interface ToolSchema {
    string(): z.ZodString;
    number(): z.ZodNumber;
    boolean(): z.ZodBoolean;
    array<T extends z.ZodType>(schema: T): z.ZodArray<T>;
    object<T extends z.ZodRawShape>(shape: T): z.ZodObject<T>;
    enum<T extends [string, ...string[]]>(values: T): z.ZodEnum<T>;
  }

  export interface ToolHelper {
    schema: ToolSchema;
    <T extends z.ZodRawShape>(config: {
      description: string;
      args: T;
      execute(args: z.infer<z.ZodObject<T>>, context: unknown): Promise<unknown>;
    }): ToolDefinition;
  }

  export const tool: ToolHelper;
}
