export const perplexityTurnSelectors = [
  // Current Perplexity (2025+)
  "h1[class*='query']",
  "main .prose",
  // Legacy selectors
  "main [data-testid='query']",
  "main [data-testid='answer']",
  "[data-testid='thread-query']",
  "[data-testid='thread-answer']",
  ".pb-md [data-message-role]",
  "[data-testid='search-result']",
]

export const perplexityPromptSelectors = [
  "[role='textbox'][contenteditable='true']",
  "textarea[placeholder*='Ask']",
  "textarea[placeholder*='ask']",
  "textarea[placeholder*='Follow']",
  "textarea[placeholder*='follow']",
  "#ppl-search-input",
  "textarea",
  "[contenteditable='true']"
]
