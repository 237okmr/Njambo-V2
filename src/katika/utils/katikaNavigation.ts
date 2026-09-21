import { KatikaTab } from '../types/katika';

export interface KatikaNavigationEventDetail {
  tab: KatikaTab;
  query?: string;
  filter?: string;
  initialPrompt?: string;
}

export const KATIKA_NAVIGATE_EVENT = 'katika-navigate';

/**
 * Dispatches a global navigation event within the Katika workspace.
 * Allows switching tabs, pre-filling search filters, and injecting contextual AI prompts.
 */
export function navigateToKatikaTab(
  tab: KatikaTab, 
  options?: { query?: string; filter?: string; initialPrompt?: string } | string,
  filter?: string
): void {
  let query = '';
  let initialPrompt = '';
  let finalFilter = filter || '';

  if (typeof options === 'string') {
    query = options;
  } else if (options) {
    query = options.query || '';
    initialPrompt = options.initialPrompt || '';
    finalFilter = options.filter || finalFilter;
  }

  const detail: KatikaNavigationEventDetail = {
    tab,
    query: query.trim(),
    filter: finalFilter.trim(),
    initialPrompt: initialPrompt.trim(),
  };

  window.dispatchEvent(
    new CustomEvent<KatikaNavigationEventDetail>(KATIKA_NAVIGATE_EVENT, { detail })
  );
}
