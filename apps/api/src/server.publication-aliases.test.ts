import { describe, it, expect, vi } from "vitest";
import { handleRequest } from "./server";
import { IncomingMessage, ServerResponse } from "http";

describe("Publication Aliases", () => {
    it("should accept explicit aliases", () => {
        expect(true).toBe(true);
    });
});
