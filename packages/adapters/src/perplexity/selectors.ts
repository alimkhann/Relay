export const perplexityTurnSelectors = [
  "main [data-testid='query']",
  "main [data-testid='answer']",
  "[data-testid='thread-query']",
  "[data-testid='thread-answer']",
  ".pb-md [data-message-role]",
  "main .prose",
  "main article",
  "[data-testid='search-result']",
  ".mb-md .break-words"
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
