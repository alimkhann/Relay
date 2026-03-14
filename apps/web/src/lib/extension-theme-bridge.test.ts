import { describe, expect, it } from "vitest";

import {
  rememberExtensionIdFromLocation,
  readStoredExtensionId,
} from "./extension-theme-bridge";

describe("extension theme bridge", () => {
  it("stores the extension id from the current url for later sync", () => {
    window.localStorage.clear();

    expect(
      rememberExtensionIdFromLocation(
        "https://relay-flow.vercel.app/dashboard?project=abc&extensionId=ext_123",
      ),
    ).toBe("ext_123");
    expect(readStoredExtensionId()).toBe("ext_123");
  });
});
