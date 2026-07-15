/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * An {@link IOdspFileVersionFetcher} backed by the ODSP REST APIs:
 * - GET /_api/v2.1/.../versions -- enumerate the file's versions.
 * - GET /_api/v2.1/.../versions/{label}/opStream/snapshots/trees/latest?blobs=2 -- fetch a version's
 *   snapshot and read its sequence number, parsed with the driver's snapshot parser.
 */

import { bufferToString } from "@fluid-internal/client-utils";
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
import { getApiRoot } from "../odspUrlHelper.js";
import { getWithRetryForTokenRefresh } from "../odspUtils.js";

import type {
	IOdspFileVersionFetcher,
	IResolvedVersionSequenceNumbers,
	OdspFileVersionRef,
} from "./odspVersionManager.js";

/**
 * Raw shape of a OneDrive/SharePoint driveItem version (an entry in the `/versions` response).
 * @see https://learn.microsoft.com/en-us/onedrive/developer/rest-api/resources/driveitemversion
 */
interface IDriveItemVersion {
	/** The version's label, e.g. "42.0". */
	readonly id: string;
	readonly lastModifiedDateTime: string;
	readonly size: number;
}

interface IDriveItemVersionsResponse {
	readonly value?: IDriveItemVersion[];
	readonly "@odata.nextLink"?: string;
}

/**
 * Inputs needed to make authenticated requests against a specific ODSP file.
 */
export interface OdspFileVersionFetcherProps {
	readonly urlParts: IOdspUrlParts;
	readonly getAuthHeader: InstrumentedStorageTokenFetcher;
	readonly epochTracker: EpochTracker;
	readonly logger: TelemetryLoggerExt;
}

/** Builds the version-scoped snapshot URL used to resolve and load file versions. */
export function getVersionSnapshotUrl(urlParts: IOdspUrlParts, versionId: string): string {
	const { siteUrl, driveId, itemId } = urlParts;
	return `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions/${encodeURIComponent(
		versionId,
	)}/opStream/snapshots/trees/latest?blobs=2`;
}

/**
 * Create an {@link IOdspFileVersionFetcher} that talks to a specific ODSP file.
 */
export function createOdspFileVersionFetcher(
	props: OdspFileVersionFetcherProps,
): IOdspFileVersionFetcher {
	const { urlParts, getAuthHeader, epochTracker, logger } = props;
	const { siteUrl, driveId, itemId } = urlParts;

	const listFileVersions = async (): Promise<OdspFileVersionRef[]> =>
		getWithRetryForTokenRefresh(async (options) => {
			// The file's version history (distinct from the driver's snapshot list), from the same API
			// root as the snapshot call so consumer (ODC) and enterprise (SPO) hosts are handled alike.
			let url = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions`;
			const method = "GET";
			const versions: OdspFileVersionRef[] = [];
			while (true) {
				const token = await getAuthHeader(
					{ ...options, request: { url, method } },
					"FileVersions",
				);
				const response = await epochTracker.fetchAndParseAsJSON<IDriveItemVersionsResponse>(
					url,
					{ method, headers: getHeadersWithAuth(token) },
					"versions",
				);
				versions.push(
					...(response.content.value ?? []).map((version) => ({
						versionId: version.id,
						lastModifiedDateTime: version.lastModifiedDateTime,
						sizeBytes: version.size,
					})),
				);
				const nextLink = response.content["@odata.nextLink"];
				if (nextLink === undefined) {
					return versions;
				}
				url = new URL(nextLink, url).href;
			}
		});

	const resolveSequenceNumber = async (
		versionId: string,
	): Promise<IResolvedVersionSequenceNumbers> =>
		getWithRetryForTokenRefresh(async (options) => {
			// Fetch the version's snapshot from the version-scoped snapshot endpoint, which returns the
			// driver's native json / ms-fluid framing. `blobs=2` inlines blob contents (including the
			// `.protocol/attributes` blob that holds the sequence number). `deltas=1` is intentionally
			// omitted; it would bundle the op stream and its op-level sequence numbers.
			const url = getVersionSnapshotUrl(urlParts, versionId);
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"FileVersionSnapshot",
			);
			const headers = getHeadersWithAuth(token);
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			const contentType = response.headers.get("content-type") ?? "";
			if (contentType.includes("application/json")) {
				const snapshotJson = (await response.content.json()) as IOdspSnapshot;
				return getSequenceNumbers(
					convertOdspSnapshotToSnapshotTreeAndBlobs(snapshotJson),
					versionId,
				);
			}
			// application/ms-fluid (compact binary)
			const bytes = new Uint8Array(await response.content.arrayBuffer());
			return getSequenceNumbers(parseCompactSnapshotResponse(bytes, logger), versionId);
		});

	return { listFileVersions, resolveSequenceNumber };
}

/**
 * A version's snapshot must carry a sequence number; a missing one is surfaced as an error rather
 * than returning a wrong value.
 */
function getSequenceNumbers(
	snapshot: ReturnType<typeof convertOdspSnapshotToSnapshotTreeAndBlobs>,
	versionId: string,
): IResolvedVersionSequenceNumbers {
	const sequenceNumber = snapshot.sequenceNumber;
	if (sequenceNumber === undefined) {
		throw new Error(`ODSP file version ${versionId} snapshot is missing a sequenceNumber`);
	}
	const attributesBlobId = snapshot.snapshotTree.trees[".protocol"]?.blobs.attributes;
	const attributesBlob =
		attributesBlobId === undefined ? undefined : snapshot.blobContents.get(attributesBlobId);
	if (attributesBlob === undefined) {
		return { sequenceNumber };
	}
	const attributes = JSON.parse(bufferToString(attributesBlob, "utf8")) as {
		minimumSequenceNumber?: unknown;
	};
	return {
		sequenceNumber,
		...(typeof attributes.minimumSequenceNumber === "number"
			? { minimumSequenceNumber: attributes.minimumSequenceNumber }
			: {}),
	};
}
