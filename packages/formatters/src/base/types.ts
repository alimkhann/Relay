import type { ContextCompositionInput } from "@relay/shared"

export interface ContextFormatter {
  key: string
  format(input: ContextCompositionInput): string
}
