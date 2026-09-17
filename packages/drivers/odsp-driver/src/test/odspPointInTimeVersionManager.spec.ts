/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createOdspPointInTimeVersionManagerCore,
	// eslint-disable-next-line import-x/no-internal-modules -- Tests target the lightweight internal selector.
} from "../pointInTimeDriver/odspPointInTimeVersionManager.js";

describe("OdspPointInTimeVersionManager", () => {
	it("selects the closest sealed version despite local sequence inversions", async () => {
		const sequenceNumbers = new Map([
			["newer", 80],
			["inverted", 90],
			["older", 50],
		]);
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
				{ versionId: "newer", lastModifiedDateTime: "2026-09-16T00:00:00Z" },
				{ versionId: "inverted", lastModifiedDateTime: "2026-09-15T00:00:00Z" },
				{ versionId: "older", lastModifiedDateTime: "2026-09-14T00:00:00Z" },
			],
			resolveSequenceNumber: async (versionId) => sequenceNumbers.get(versionId)!,
		});

		assert.deepEqual(await manager.findBaseForSeq(95), {
			kind: "found",
			base: {
				versionId: "inverted",
				lastModifiedDateTime: "2026-09-15T00:00:00Z",
				sequenceNumber: 90,
			},
		});
	});

	it("excludes the mutable tip from base selection", async () => {
		let resolutions = 0;
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
			],
			resolveSequenceNumber: async () => {
				resolutions++;
				return 100;
			},
		});

		assert.deepEqual(await manager.findBaseForSeq(100), { kind: "noBaseVersion" });
		assert.equal(resolutions, 0);
	});

	it("reports the oldest resolved sequence when no base precedes the target", async () => {
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
				{ versionId: "sealed", lastModifiedDateTime: "2026-09-16T00:00:00Z" },
			],
			resolveSequenceNumber: async () => 50,
		});

		assert.deepEqual(await manager.findBaseForSeq(40), {
			kind: "noBaseVersion",
			oldestResolvedSeq: 50,
		});
	});
});
