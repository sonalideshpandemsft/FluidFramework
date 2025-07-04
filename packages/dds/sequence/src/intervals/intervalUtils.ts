/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	PropertySet,
	SlidingPreference,
	SequencePlace,
	Side,
} from "@fluidframework/merge-tree/internal";

/**
 * Basic interval abstraction
 * @legacy
 * @alpha
 */
export interface IInterval {
	/**
	 * @returns a new interval object with identical semantics.
	 *
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 * @privateRemarks Move to ISerializableInterval after deprecation period
	 */
	clone(): IInterval;
	/**
	 * Compares this interval to `b` with standard comparator semantics:
	 * - returns -1 if this is less than `b`
	 * - returns 1 if this is greater than `b`
	 * - returns 0 if this is equivalent to `b`
	 * @param b - Interval to compare against
	 */
	compare(b: IInterval): number;
	/**
	 * Compares the start endpoint of this interval to `b`'s start endpoint.
	 * Standard comparator semantics apply.
	 * @param b - Interval to compare against
	 */
	compareStart(b: IInterval): number;
	/**
	 * Compares the end endpoint of this interval to `b`'s end endpoint.
	 * Standard comparator semantics apply.
	 * @param b - Interval to compare against
	 */
	compareEnd(b: IInterval): number;
	/**
	 * Modifies one or more of the endpoints of this interval, returning a new interval representing the result.
	 *
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	modify(
		label: string,
		start: SequencePlace | undefined,
		end: SequencePlace | undefined,
		op?: ISequencedDocumentMessage,
		localSeq?: number,
		canSlideToEndpoint?: boolean,
	): IInterval | undefined;
	/**
	 * @returns whether this interval overlaps with `b`.
	 * Intervals are considered to overlap if their intersection is non-empty.
	 */
	overlaps(b: IInterval): boolean;
	/**
	 * Unions this interval with `b`, returning a new interval.
	 * The union operates as a convex hull, i.e. if the two intervals are disjoint, the return value includes
	 * intermediate values between the two intervals.
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 * @privateRemarks Move to ISerializableInterval after deprecation period
	 */
	union(b: IInterval): IInterval;
}

/**
 * Values are used in persisted formats (ops).
 * @internal
 */
export const IntervalDeltaOpType = {
	ADD: "add",
	DELETE: "delete",
	CHANGE: "change",
} as const;

export type IntervalDeltaOpType =
	(typeof IntervalDeltaOpType)[keyof typeof IntervalDeltaOpType];

/**
 * Values are used in revertibles.
 * @legacy
 * @alpha
 */
export const IntervalOpType = {
	...IntervalDeltaOpType,
	PROPERTY_CHANGED: "propertyChanged",
	POSITION_REMOVE: "positionRemove",
} as const;
/**
 * @legacy
 * @alpha
 */
export type IntervalOpType = (typeof IntervalOpType)[keyof typeof IntervalOpType];

/**
 * @legacy
 * @alpha
 */
export enum IntervalType {
	Simple = 0x0,

	/**
	 * SlideOnRemove indicates that the ends of the interval will slide if the segment
	 * they reference is removed and acked.
	 * See `packages\dds\merge-tree\docs\REFERENCEPOSITIONS.md` for details
	 * SlideOnRemove is the default interval behavior and does not need to be specified.
	 */
	SlideOnRemove = 0x2, // SlideOnRemove is default behavior - all intervals are SlideOnRemove

	/**
	 * A temporary interval, used internally
	 * @internal
	 */
	Transient = 0x4,
}

/**
 * Serialized object representation of an interval.
 * This representation is used for ops that create or change intervals.
 * @legacy
 * @alpha
 */
export interface ISerializedInterval {
	/**
	 * Sequence number at which `start` and `end` should be interpreted
	 *
	 * @remarks It's unclear that this is necessary to store here.
	 * This should just be the refSeq on the op that modified the interval, which should be available via other means.
	 * At the time of writing, it's not plumbed through to the reconnect/rebase code, however, which does need it.
	 */
	sequenceNumber: number;
	/** Start position of the interval */
	start: number | "start" | "end";
	/** End position of the interval */
	end: number | "start" | "end";
	/** Interval type to create */
	intervalType: IntervalType;
	/**
	 * The stickiness of this interval
	 */
	stickiness?: IntervalStickiness;
	startSide?: Side;
	endSide?: Side;
	/** Any properties the interval has */
	properties?: PropertySet;
}

/**
 * @legacy
 * @alpha
 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
 * @privateRemarks Remove from external exports, and replace usages of IInterval with this interface after deprecation period
 */
export interface ISerializableInterval extends IInterval {
	/** Serializable bag of properties associated with the interval. */
	properties: PropertySet;

	/**
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	serialize(): ISerializedInterval;

	/**
	 * Gets the id associated with this interval.
	 * When the interval is used as part of an interval collection, this id can be used to modify or remove the
	 * interval.
	 */
	getIntervalId(): string;
}

/**
 * Represents a change that should be applied to an existing interval.
 * Changes can modify any of start/end/properties, with `undefined` signifying no change should be made.
 * @internal
 */
export type SerializedIntervalDelta = Omit<
	ISerializedInterval,
	"start" | "end" | "properties"
> &
	Partial<Pick<ISerializedInterval, "start" | "end" | "properties">>;

/**
 * A size optimization to avoid redundantly storing keys when serializing intervals
 * as JSON for summaries.
 *
 * Intervals are of the format:
 *
 * [
 * start,
 * end,
 * sequenceNumber,
 * intervalType,
 * properties,
 * stickiness?,
 * startSide?,
 * endSide?,
 * ]
 */
export type CompressedSerializedInterval =
	| [
			number | "start" | "end",
			number | "start" | "end",
			number,
			IntervalType,
			PropertySet,
			IntervalStickiness,
	  ]
	| [number | "start" | "end", number | "start" | "end", number, IntervalType, PropertySet];

/**
 * Determines how an interval should expand when segments are inserted adjacent
 * to the range it spans
 *
 * Note that interval stickiness is currently an experimental feature and must
 * be explicitly enabled with the `intervalStickinessEnabled` flag
 *
 * @legacy
 * @alpha
 */
export const IntervalStickiness = {
	/**
	 * Interval does not expand to include adjacent segments
	 */
	NONE: 0b00,

	/**
	 * Interval expands to include segments inserted adjacent to the start
	 */
	START: 0b01,

	/**
	 * Interval expands to include segments inserted adjacent to the end
	 *
	 * This is the default stickiness
	 */
	END: 0b10,

	/**
	 * Interval expands to include all segments inserted adjacent to it
	 */
	FULL: 0b11,
} as const;

/**
 * Determines how an interval should expand when segments are inserted adjacent
 * to the range it spans
 *
 * Note that interval stickiness is currently an experimental feature and must
 * be explicitly enabled with the `intervalStickinessEnabled` flag
 * @legacy
 * @alpha
 */
export type IntervalStickiness = (typeof IntervalStickiness)[keyof typeof IntervalStickiness];

export function startReferenceSlidingPreference(
	startPos: number | "start" | "end" | undefined,
	startSide: Side,
	endPos: number | "start" | "end" | undefined,
	endSide: Side,
): SlidingPreference {
	const stickiness = computeStickinessFromSide(startPos, startSide, endPos, endSide);
	// if any start stickiness, prefer sliding backwards
	return (stickiness & IntervalStickiness.START) === 0
		? SlidingPreference.FORWARD
		: SlidingPreference.BACKWARD;
}

export function endReferenceSlidingPreference(
	startPos: number | "start" | "end" | undefined,
	startSide: Side,
	endPos: number | "start" | "end" | undefined,
	endSide: Side,
): SlidingPreference {
	const stickiness = computeStickinessFromSide(startPos, startSide, endPos, endSide);

	// if any end stickiness, prefer sliding forwards
	return (stickiness & IntervalStickiness.END) === 0
		? SlidingPreference.BACKWARD
		: SlidingPreference.FORWARD;
}

export function computeStickinessFromSide(
	startPos: number | "start" | "end" | undefined,
	startSide: Side,
	endPos: number | "start" | "end" | undefined,
	endSide: Side,
): IntervalStickiness {
	let stickiness: IntervalStickiness = IntervalStickiness.NONE;

	if (startSide === Side.After || startPos === "start") {
		stickiness |= IntervalStickiness.START;
	}

	if (endSide === Side.Before || endPos === "end") {
		stickiness |= IntervalStickiness.END;
	}

	return stickiness as IntervalStickiness;
}
