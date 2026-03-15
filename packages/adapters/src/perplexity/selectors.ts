export const perplexityTurnSelectors = [
  "main [data-testid='query']",
  "main [data-testid='answer']",
  "[data-testid='thread-query']",
  "[data-testid='thread-answer']",
  ".pb-md [data-message-role]",
  "[data-testid='search-result']",
]

export const perplexityPromptSelectors = [
  "textarea[placeholder*='Ask']",
  "textarea[placeholder*='ask']",
  "textarea[placeholder*='Search']",
  "textarea[placeholder*='search']",
  "#ppl-search-input",
  "textarea",
  "[contenteditable='true']"
]
