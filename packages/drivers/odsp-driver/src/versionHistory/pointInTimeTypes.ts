/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** Identifies a document state that can be materialized from ODSP retained history. */
export interface IPointInTimeTarget {
	/** The sequence number at which to materialize the container. */
	readonly sequenceNumber: number;
	/** The last operation's reference sequence number at this target. */
	readonly referenceSequenceNumber: number;
	/** The ODSP epoch in which this target was recorded. */
	readonly odspEpoch: string;
	/** A semantic safe point emitted before or after a Copilot update. */
	readonly markerKind?: "pre" | "post";
}
