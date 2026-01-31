/**
 * List Masks Tool
 * 
 * Lists all available expert persona masks.
 */

import { tool } from '@opencode-ai/plugin';
import type { MaskweaverState } from '../index';

export function createListMasksTool(state: MaskweaverState) {
  return tool({
    description: `List all available expert persona masks.
Returns masks grouped by category with their expertise areas.

Use this to discover which expert personas are available before applying one with select_mask.`,
    
    args: {
      category: tool.schema.string().optional().describe(
        'Filter by category (e.g., "software-engineering", "ai-ml")'
      ),
      tag: tool.schema.string().optional().describe(
        'Filter by tag (e.g., "tdd", "architecture", "systems")'
      ),
    },
    
    async execute(args, context) {
      const { category, tag } = args;
      const { maskLoader } = state;
      
      try {
        const allMasks = await maskLoader.listAll();
        const categories = await maskLoader.listCategories();
        
        // Filter by category if specified
        let filtered = allMasks;
        if (category) {
          filtered = allMasks.filter(m => m.category === category);
        }
        
        // Filter by tag if specified
        if (tag) {
          filtered = filtered.filter(m => m.tags.includes(tag));
        }
        
        // Group by category
        const grouped: Record<string, Array<{
          id: string;
          name: string;
          tags: string[];
        }>> = {};
        
        for (const mask of filtered) {
          if (!grouped[mask.category]) {
            grouped[mask.category] = [];
          }
          grouped[mask.category].push({
            id: mask.id,
            name: mask.name,
            tags: mask.tags,
          });
        }
        
        // Format summary
        const summary = categories.map(cat => 
          `${cat.name} (${cat.count} masks): ${cat.description}`
        ).join('\n');
        
        return {
          success: true,
          summary: `Found ${filtered.length} masks across ${Object.keys(grouped).length} categories`,
          categories: summary,
          masks: grouped,
          activeMask: state.activeMask ? {
            id: state.activeMask.metadata.id,
            name: state.activeMask.profile.name,
          } : null,
          hint: 'Use select_mask with a mask ID to apply a persona (e.g., select_mask("linus-torvalds"))',
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to list masks: ${error}`,
        };
      }
    },
  });
}
