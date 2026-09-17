/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	PointInTimeAvailabilityProvider,
	SequenceNumberAvailability,
} from "@fluidframework/driver-definitions/legacy";
import { UsageError } from "@fluidframework/driver-utils/internal";

import type { IContainerLoadDriverProps } from "./createAndLoadContainerUtils.js";
import { asPointInTimeAvailabilityCapableFactory } from "./pointInTimeServices.js";

/**
 * Properties used to check whether sequence numbers can be materialized as historical containers.
 *
 * @legacy @beta
 */
export interface CheckSequenceNumberAvailabilityProps extends IContainerLoadDriverProps {
	/** The non-negative safe-integer sequence numbers to check. */
	readonly sequenceNumbers: readonly number[];
	/** The logger that availability telemetry should be pushed to. */
	readonly logger?: ITelemetryBaseLogger | undefined;
	/** Cancels outstanding version, snapshot, or operation requests. */
	readonly signal?: AbortSignal | undefined;
}

/**
 * Checks whether resolved sequence numbers can currently be materialized as historical containers.
 *
 * @remarks
 * `available` and `unavailable` are authoritative observations at query time. `unknown` must not be
 * used to delete durable application state and may be retried later.
 *
 * The check validates a retained same-lineage base and the complete bridging-operation range without
 * loading or instantiating a container.
 *
 * @param props - The request, loader services, sequence numbers, and optional cancellation signal.
 * @returns One availability result for each input sequence number, in input order.
 * @throws {@link UsageError} if a sequence number is not a non-negative safe integer, the request
 * cannot be resolved, or the document service factory does not expose the availability capability.
 *
 * @legacy @beta
 */
export async function checkSequenceNumberAvailability(
	props: CheckSequenceNumberAvailabilityProps,
): Promise<readonly SequenceNumberAvailability[]> {
	const { request, sequenceNumbers, signal, urlResolver, documentServiceFactory, logger } =
		props;
	for (const sequenceNumber of sequenceNumbers) {
		if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) {
			throw new UsageError(
				`sequenceNumbers must contain only non-negative safe integers, got ${sequenceNumber}.`,
			);
		}
	}
	if (sequenceNumbers.length === 0) {
		return [];
	}

	const capableFactory = asPointInTimeAvailabilityCapableFactory(documentServiceFactory);
	if (capableFactory === undefined) {
		throw new UsageError(
			"The provided documentServiceFactory does not support point-in-time availability checks.",
		);
	}

	const resolvedUrl = await urlResolver.resolve(request);
	if (resolvedUrl === undefined) {
		throw new UsageError("Failed to resolve request to a Fluid URL");
	}

	const provider: PointInTimeAvailabilityProvider =
		await capableFactory.createPointInTimeAvailabilityProvider(resolvedUrl, logger);
	return provider.checkSequenceNumberAvailability(
		sequenceNumbers,
		signal === undefined ? undefined : { signal },
	);
}
