/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** Failure kinds specific to reconstructing an ODSP document from retained history. */
export type HistoricalDriverErrorCode =
	| "targetPredatesHistory"
	| "opsUnavailable"
	| "targetFromDifferentTimeline"
	| "targetMidBatch";

/** Error raised when retained history cannot materialize the requested document state. */
export class HistoricalDriverError extends Error {
	public constructor(
		public readonly code: HistoricalDriverErrorCode,
		public readonly details: {
			readonly oldestReachableSeq?: number;
			readonly missingFromSeq?: number;
		} = {},
	) {
		super(code);
		this.name = "HistoricalDriverError";
	}
}
