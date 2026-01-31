/**
 * Session Created Hook
 * 
 * Handles initialization when a new session is created.
 */

import type { MaskweaverState } from '../index';

export async function handleSessionCreated(
  session: any,
  state: MaskweaverState,
  client: any
): Promise<void> {
  try {
    const categories = await state.maskLoader.listCategories();
    const masks = await state.maskLoader.listAll();
    
    // Log available masks
    await client.app.log({
      service: 'maskweaver',
      level: 'info',
      message: 'Session created - masks available',
      extra: {
        categories: categories.length,
        masks: masks.length,
      },
    });
    
    // If there's a default mask configured, apply it
    // For now, just notify that masks are available
    
  } catch (error) {
    await client.app.log({
      service: 'maskweaver',
      level: 'error',
      message: 'Failed to initialize masks for session',
      extra: { error: String(error) },
    });
  }
}
