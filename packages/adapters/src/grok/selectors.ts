export const grokTurnSelectors = [
  // Current Grok (2025+)
  ".message-bubble",
  // Legacy selectors
  "[data-testid='message']",
  ".message-container",
  "[data-message-role]",
  "[role='article']",
]

export const grokPromptSelectors = [
  "textarea",
  "[contenteditable='true']",
  "[role='textbox']",
]
