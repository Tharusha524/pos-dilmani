import type { QueryClient } from "@tanstack/react-query";
import { invalidatePosRuntimeSettings } from "./invalidatePosRuntimeSettings";

describe("invalidatePosRuntimeSettings", () => {
  test("invalidates runtime settings query keys", () => {
    const invalidateQueries = jest.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    invalidatePosRuntimeSettings(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["sales-pos-context"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tax-settings"] });
    // The receipt payload carries the receipt layout, so a cached receipt
    // would otherwise keep printing the old one after it is edited.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["receipt-settings"] });
  });

  test("each key is invalidated exactly once", () => {
    const invalidateQueries = jest.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    invalidatePosRuntimeSettings(queryClient);

    // Asserts no key is listed twice, without pinning the test to a specific
    // number — adding a key is a routine change, duplicating one is a bug.
    const keys = invalidateQueries.mock.calls.map(([arg]) => arg.queryKey[0]);
    expect(keys).toHaveLength(new Set(keys).size);
    expect(keys.length).toBeGreaterThan(0);
  });
});
