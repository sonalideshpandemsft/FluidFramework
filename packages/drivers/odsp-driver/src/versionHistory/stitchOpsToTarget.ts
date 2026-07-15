/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { HistoricalDriverError } from "./errors.js";
import type { IOpSource, IOpSourceResult } from "./opSources.js";

const maximumOpFetchAttempts = 3;

/**
 * Stitches operations from a version-scoped source, then the tip-file source if the version source
 * is exhausted before the requested target sequence number.
 */
export async function stitchOpsToTarget(
	versionScopedOpSource: IOpSource,
	tipFileOpSource: IOpSource,
	baseSequenceNumber: number,
	targetSequenceNumber: number,
	epoch: string | undefined,
	targetReferenceSequenceNumber?: number,
	skipBatchBoundaryValidation = false,
): Promise<ISequencedDocumentMessage[]> {
	const ops: ISequencedDocumentMessage[] = [];
	let nextSequenceNumber = baseSequenceNumber + 1;
	let source: IOpSource = versionScopedOpSource;
	let usingTipFile = false;

	while (nextSequenceNumber <= targetSequenceNumber) {
		const result = await getContiguousOps(
			source,
			nextSequenceNumber,
			targetSequenceNumber + 1,
		);
		if (usingTipFile && result.epoch !== epoch) {
			throw new HistoricalDriverError("targetFromDifferentTimeline");
		}
		if (result.messages.length === 0) {
			if (usingTipFile) {
				throw new HistoricalDriverError("opsUnavailable", {
					missingFromSeq: nextSequenceNumber,
				});
			}
			source = tipFileOpSource;
			usingTipFile = true;
			continue;
		}
		ops.push(...result.messages);
		// eslint-disable-next-line unicorn/prefer-at -- This package targets ES2021, which lacks Array.prototype.at.
		const lastMessage = result.messages[result.messages.length - 1];
		if (lastMessage === undefined) {
			throw new HistoricalDriverError("opsUnavailable", {
				missingFromSeq: nextSequenceNumber,
			});
		}
		nextSequenceNumber = lastMessage.sequenceNumber + 1;
	}
	// eslint-disable-next-line unicorn/prefer-at -- This package targets ES2021, which lacks Array.prototype.at.
	const lastOp = ops[ops.length - 1];
	if (
		!skipBatchBoundaryValidation &&
		targetReferenceSequenceNumber !== undefined &&
		lastOp !== undefined &&
		lastOp.referenceSequenceNumber !== targetReferenceSequenceNumber
	) {
		throw new HistoricalDriverError("targetMidBatch");
	}

	return ops;
}

async function getContiguousOps(
	source: IOpSource,
	from: number,
	to: number,
): Promise<IOpSourceResult> {
	let result: IOpSourceResult = { messages: [] };
	for (let attempt = 0; attempt < maximumOpFetchAttempts; attempt++) {
		result = await source.getOps(from, to);
		const firstMissing = result.messages.find(
			(message, index) => message.sequenceNumber !== from + index,
		);
		if (firstMissing === undefined && result.messages.length > 0) {
			return result;
		}
		if (firstMissing !== undefined) {
			throw new HistoricalDriverError("opsUnavailable", {
				missingFromSeq: from + result.messages.indexOf(firstMissing),
			});
		}
	}
	if (result.messages.length === 0) {
		return result;
	}
	throw new HistoricalDriverError("opsUnavailable", { missingFromSeq: from });
}
