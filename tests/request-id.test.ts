import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createRequestId } from "@/lib/request-id";

afterEach(() => vi.unstubAllGlobals());
it("creates a valid request ID on an HTTP phone origin without crypto.randomUUID", () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(
    globalThis.crypto,
  );
  vi.stubGlobal("crypto", { getRandomValues });
  const id = createRequestId();
  expect(z.uuid().parse(id)).toBe(id);
  expect(id[14]).toBe("4");
  expect(createRequestId()).not.toBe(id);
});
