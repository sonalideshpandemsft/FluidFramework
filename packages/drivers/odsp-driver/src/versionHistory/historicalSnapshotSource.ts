/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISnapshot } from "@fluidframework/driver-definitions/internal";
import type {
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { parseCompactSnapshotResponse } from "../compactSnapshotParser.js";
import type { IOdspSnapshot } from "../contracts.js";
import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { convertOdspSnapshotToSnapshotTreeAndBlobs } from "../odspSnapshotParser.js";
import { getWithRetryForTokenRefresh } from "../odspUtils.js";
import { getVersionSnapshotUrl, type ResolvedVersion } from "../odspVersionManager/index.js";

/** A parsed historical snapshot together with the epoch returned by its source request. */
export interface IHistoricalSnapshot {
	readonly snapshot: ISnapshot;
	readonly epoch?: string;
}

/** Provides the base snapshot for a resolved historical file version. */
export interface IHistoricalSnapshotSource {
	loadBaseSnapshot(base: ResolvedVersion): Promise<IHistoricalSnapshot>;
}

/** Inputs used to fetch a version-scoped snapshot from ODSP. */
export interface HistoricalSnapshotSourceProps {
	readonly urlParts: IOdspUrlParts;
	readonly getAuthHeader: InstrumentedStorageTokenFetcher;
	readonly epochTracker: EpochTracker;
	readonly logger: TelemetryLoggerExt;
}

/**
 * Loads and parses a base snapshot while preserving its complete snapshot tree and blob contents.
 */
export async function loadBaseSnapshot(
	props: HistoricalSnapshotSourceProps,
	base: ResolvedVersion,
): Promise<IHistoricalSnapshot> {
	return getWithRetryForTokenRefresh(async (options) => {
		const url = getVersionSnapshotUrl(props.urlParts, base.versionId);
		const method = "GET";
		const token = await props.getAuthHeader(
			{ ...options, request: { url, method } },
			"HistoricalVersionSnapshot",
		);
		const response = await props.epochTracker.fetch(
			url,
			{ method, headers: getHeadersWithAuth(token) },
			"treesLatest",
		);
		const contentType = response.headers.get("content-type") ?? "";
		const snapshot = contentType.includes("application/json")
			? convertOdspSnapshotToSnapshotTreeAndBlobs(
					(await response.content.json()) as IOdspSnapshot,
				)
			: parseCompactSnapshotResponse(
					new Uint8Array(await response.content.arrayBuffer()),
					props.logger,
				);
		return { snapshot, epoch: response.headers.get("x-fluid-epoch") ?? undefined };
	});
}
