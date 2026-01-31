/**
 * Maskweaver Plugin for opencode
 * 
 * Applies expert personas (masks) to AI assistants.
 * 가면술사 - opencode 플러그인
 */

import type { Plugin } from '@opencode-ai/plugin';
import { MaskLoader } from '@maskweaver/core';
import { handleSessionCreated } from './hooks/sessionCreated';
import { createSelectMaskTool } from './tools/selectMask';
import { createListMasksTool } from './tools/listMasks';

export interface MaskweaverState {
  maskLoader: MaskLoader;
  activeMask: any | null;
}

/**
 * Maskweaver Plugin
 * 
 * Give your AI coding assistant expert personalities.
 */
export const MaskweaverPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx;
  
  // Initialize mask loader
  const masksDir = `${directory}/.opencode/masks`;
  const maskLoader = new MaskLoader({ masksDir });
  
  try {
    await maskLoader.loadCatalog();
    await client.app.log({
      service: 'maskweaver',
      level: 'info',
      message: 'Maskweaver initialized',
      extra: { masksDir },
    });
  } catch (error) {
    // Fallback to default masks directory
    await client.app.log({
      service: 'maskweaver',
      level: 'warn',
      message: 'Custom masks not found, using defaults',
    });
  }
  
  // Store in context for tools
  const state: MaskweaverState = {
    maskLoader,
    activeMask: null,
  };
  
  return {
    /**
     * Session Created Hook
     * 
     * Called when a new session is created.
     * Can inject initial system prompt or provide mask selection.
     */
    'session.created': async (session) => {
      await handleSessionCreated(session, state, client);
    },
    
    /**
     * Tool Execute Hooks
     * 
     * Track tool usage with masks for analytics.
     */
    'tool.execute.after': async (input, output) => {
      if (state.activeMask) {
        await client.app.log({
          service: 'maskweaver',
          level: 'debug',
          message: `Tool executed with mask`,
          extra: {
            tool: input.tool,
            mask: state.activeMask.metadata.id,
          },
        });
      }
    },
    
    /**
     * Custom Tools
     */
    tool: {
      select_mask: createSelectMaskTool(state),
      list_masks: createListMasksTool(state),
    },
  };
};

export default MaskweaverPlugin;
