/**
 * Select Mask Tool
 * 
 * Allows users to apply an expert persona (mask) to the AI.
 */

import { tool } from '@opencode-ai/plugin';
import { promptBuilder } from '@maskweaver/core';
import type { MaskweaverState } from '../index';

export function createSelectMaskTool(state: MaskweaverState) {
  return tool({
    description: `Apply an expert persona (mask) to the AI assistant. 
This transforms how the AI thinks, communicates, and approaches problems.

Example personas: linus-torvalds (systems programming), martin-fowler (architecture), kent-beck (TDD)

Use list_masks first to see all available masks.`,
    
    args: {
      maskId: tool.schema.string().describe(
        'ID of the mask to apply (e.g., "linus-torvalds")'
      ),
      mode: tool.schema.enum(['minimal', 'standard', 'rich']).optional().describe(
        'Prompt richness: minimal (core only), standard (default), rich (full context)'
      ),
    },
    
    async execute(args, context) {
      const { maskId, mode = 'standard' } = args;
      const { maskLoader } = state;
      
      try {
        const mask = await maskLoader.load(maskId);
        
        if (!mask) {
          return {
            success: false,
            message: `Mask '${maskId}' not found. Use list_masks to see available options.`,
          };
        }
        
        // Build system prompt based on mode
        let systemPrompt: string;
        switch (mode) {
          case 'minimal':
            systemPrompt = promptBuilder.minimal(mask);
            break;
          case 'rich':
            systemPrompt = promptBuilder.rich(mask);
            break;
          default:
            systemPrompt = promptBuilder.build(mask);
        }
        
        // Store active mask
        state.activeMask = mask;
        
        return {
          success: true,
          message: `🎭 Mask '${mask.profile.name}' applied.\n\n> ${mask.profile.tagline}`,
          mask: {
            id: mask.metadata.id,
            name: mask.profile.name,
            category: mask.category,
            expertise: mask.profile.expertise,
            tone: mask.behavior.communicationStyle.tone,
          },
          systemPrompt,
          instruction: 'The system prompt above has been applied. The AI will now respond as this persona.',
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to load mask: ${error}`,
        };
      }
    },
  });
}
