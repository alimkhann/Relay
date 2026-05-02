import { RelayNodeAnalytics } from "@relay/cli-core"

export class RelayCliAnalytics extends RelayNodeAnalytics {
  constructor() {
    super({
      app: "cli",
      appSource: "relay-cli",
      anonymousPrefix: "relay-cli",
    })
  }
}
