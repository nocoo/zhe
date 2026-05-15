import { describe, expect, it } from "vitest";
import { formatTags } from "../src/commands/idea.js";

describe("formatTags", () => {
	it("returns empty string when tagIds is undefined", () => {
		expect(formatTags(undefined, undefined)).toBe("");
	});

	it("returns empty string when tagIds is null", () => {
		expect(formatTags(null, undefined)).toBe("");
	});

	it("returns empty string when tagIds is empty array", () => {
		expect(formatTags([], undefined)).toBe("");
	});

	it("returns empty string when tagIds is empty array with tagMap", () => {
		expect(formatTags([], new Map())).toBe("");
	});

	it("uses tag names from map when available", () => {
		const tagMap = new Map([
			["tag-id-aaa", "work"],
			["tag-id-bbb", "personal"],
		]);
		expect(formatTags(["tag-id-aaa", "tag-id-bbb"], tagMap)).toBe(
			"[work] [personal]",
		);
	});

	it("falls back to truncated id when tagMap is missing", () => {
		expect(formatTags(["abcdef0123456789"], undefined)).toBe("[abcdef01]");
	});

	it("falls back to truncated id when tag is missing from map", () => {
		const tagMap = new Map([["other-tag", "other"]]);
		expect(formatTags(["abcdef0123456789"], tagMap)).toBe("[abcdef01]");
	});

	it("mixes resolved and unresolved tags", () => {
		const tagMap = new Map([["known-id", "known"]]);
		expect(formatTags(["known-id", "missing-id-xyz"], tagMap)).toBe(
			"[known] [missing-]",
		);
	});
});
