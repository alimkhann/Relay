export const geminiTurnSelectors = [
  // Regular Gemini (gemini.google.com)
  "[data-message-id]",
  ".conversation-container .message",
  "model-response",
  "user-query",
  "message-content[data-message-id]",
  ".chat-turn",
  // AI Studio (aistudio.google.com)
  "ms-chat-turn",
]

export const geminiPromptSelectors = [
  // Regular Gemini
  ".ql-editor",
  "rich-textarea [contenteditable='true']",
  "[contenteditable='true']",
  // AI Studio
  "textarea",
]
