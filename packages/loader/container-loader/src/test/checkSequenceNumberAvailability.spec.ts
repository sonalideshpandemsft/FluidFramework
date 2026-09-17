/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDocumentServiceFactory,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

import { checkSequenceNumberAvailability } from "../checkSequenceNumberAvailability.js";

const resolvedUrl = { type: "fluid", url: "fluid://test" } as IResolvedUrl;

describe("checkSequenceNumberAvailability", () => {
	it("validates all targets before resolving the request", async () => {
		const urlResolver = {
			resolve: async () => assert.fail("must not resolve malformed input"),
		} as unknown as IUrlResolver;
		await assert.rejects(
			checkSequenceNumberAvailability({
				request: { url: resolvedUrl.url },
				sequenceNumbers: [1, Number.MAX_SAFE_INTEGER + 1],
				urlResolver,
				documentServiceFactory: {} as IDocumentServiceFactory,
			}),
			/non-negative safe integers/i,
		);
	});

	it("preserves batching and forwards cancellation", async () => {
		const controller = new AbortController();
		let seenSequenceNumbers: readonly number[] | undefined;
		let seenSignal: AbortSignal | undefined;
		const documentServiceFactory = {
			createPointInTimeAvailabilityProvider: async () => ({
				checkSequenceNumberAvailability: async (sequenceNumbers, options) => {
					seenSequenceNumbers = sequenceNumbers;
					seenSignal = options?.signal;
					return sequenceNumbers.map((sequenceNumber) => ({
						sequenceNumber,
						status: "available" as const,
					}));
				},
			}),
		} as unknown as IDocumentServiceFactory;

		const results = await checkSequenceNumberAvailability({
			request: { url: resolvedUrl.url },
			sequenceNumbers: [9, 4, 9],
			signal: controller.signal,
			urlResolver: { resolve: async () => resolvedUrl } as unknown as IUrlResolver,
			documentServiceFactory,
		});

		assert.deepEqual(seenSequenceNumbers, [9, 4, 9]);
		assert.equal(seenSignal, controller.signal);
		assert.deepEqual(results, [
			{ sequenceNumber: 9, status: "available" },
			{ sequenceNumber: 4, status: "available" },
			{ sequenceNumber: 9, status: "available" },
		]);
	});
});
