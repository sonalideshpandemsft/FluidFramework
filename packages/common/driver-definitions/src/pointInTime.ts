/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Why a requested sequence number cannot currently be materialized.
 *
 * @legacy @beta
 */
export type SequenceNumberAvailabilityReason =
	| "noRetainedBase"
	| "missingBridgingOps"
	| "lineageMismatch"
	| "notMaterializationBoundary";

/**
 * The observed point-in-time materialization status of a sequence number.
 *
 * @remarks
 * Availability is an observation at query time. A sequence number reported as `available` may
 * become unavailable later if the service prunes its retained snapshot or operation history.
 *
 * @legacy @beta
 */
export type SequenceNumberAvailability =
	| {
			/** The sequence number that was checked. */
			readonly sequenceNumber: number;
			/** The complete point-in-time state was verified as materializable. */
			readonly status: "available";
	  }
	| {
			/** The sequence number that was checked. */
			readonly sequenceNumber: number;
			/** The point-in-time state was authoritatively proven not materializable. */
			readonly status: "unavailable";
			/** The authoritative reason the state cannot be materialized. */
			readonly reason: SequenceNumberAvailabilityReason;
	  }
	| {
			/** The sequence number that was checked. */
			readonly sequenceNumber: number;
			/** A transient condition prevented a conclusive answer. */
			readonly status: "unknown";
			/** Indicates that the check can be retried later. */
			readonly reason: "transientFailure";
	  };

/**
 * Options for checking point-in-time sequence-number availability.
 *
 * @legacy @beta
 */
export interface PointInTimeAvailabilityOptions {
	/** Cancels outstanding version, snapshot, or operation requests. */
	readonly signal?: AbortSignal | undefined;
}

/**
 * Checks whether resolved sequence numbers can currently be materialized as historical containers.
 *
 * @remarks
 * The provider is bound to one document. Implementations should batch version and snapshot discovery,
 * validate document lineage, and verify the complete bridging-operation range without loading a
 * container.
 *
 * @legacy @beta
 */
export interface PointInTimeAvailabilityProvider {
	/**
	 * Checks the supplied sequence numbers, preserving their input order in the returned results.
	 *
	 * @param sequenceNumbers - The non-negative safe-integer sequence numbers to check.
	 * @param options - Optional cancellation settings.
	 * @returns One availability result for each input sequence number, in input order.
	 */
	checkSequenceNumberAvailability(
		sequenceNumbers: readonly number[],
		options?: PointInTimeAvailabilityOptions,
	): Promise<readonly SequenceNumberAvailability[]>;
}
