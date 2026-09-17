/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import {
	OdspErrorTypes,
	type IOdspUrlParts,
	type InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";

import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { getWithRetryForTokenRefresh } from "../odspUtils.js";
import { pkgVersion as driverVersion } from "../packageVersion.js";
import { mergeRequestHeaders } from "../requestHeaders.js";
// eslint-disable-next-line import-x/no-internal-modules -- The lightweight selector shares the internal result shape.
import type { BaseForSeq, ResolvedVersion } from "../odspVersionManager/odspVersionManager.js";

interface FileVersionRef {
	readonly versionId: string;
	readonly lastModifiedDateTime: string;
}

interface DriveItemVersion {
	readonly id: string;
	readonly lastModifiedDateTime: string;
}

interface DriveItemVersionsPage {
	readonly value?: DriveItemVersion[];
	readonly "@odata.nextLink"?: string;
}

export interface PointInTimeVersionFetcher {
	listFileVersions(): Promise<FileVersionRef[]>;
	resolveSequenceNumber(versionId: string): Promise<number>;
}

interface PointInTimeVersionManager {
	findBaseForSeq(target: number): Promise<BaseForSeq>;
}

export interface OdspPointInTimeVersionManagerProps {
	readonly urlParts: IOdspUrlParts;
	readonly getAuthHeader: InstrumentedStorageTokenFetcher;
	readonly epochTracker: EpochTracker;
	readonly requestHeaders?: Readonly<Record<string, string>>;
}

function createPointInTimeVersionFetcher(
	props: OdspPointInTimeVersionManagerProps,
): PointInTimeVersionFetcher {
	const { urlParts, getAuthHeader, epochTracker, requestHeaders } = props;
	const { siteUrl, driveId, itemId } = urlParts;
	const itemRoot = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}`;

	const listFileVersions = async (): Promise<FileVersionRef[]> =>
		getWithRetryForTokenRefresh(async (options) => {
			const method = "GET";
			const versions: FileVersionRef[] = [];
			let url = `${itemRoot}/versions`;
			do {
				const token = await getAuthHeader(
					{ ...options, request: { url, method } },
					"FileVersions",
				);
				const headers = mergeRequestHeaders(requestHeaders, getHeadersWithAuth(token));
				const response = await epochTracker.fetchAndParseAsJSON<DriveItemVersionsPage>(
					url,
					{ method, headers },
					"versions",
				);
				const page = response.content;
				if (!Array.isArray(page.value)) {
					throw new NonRetryableError(
						"ODSP file-version response is missing its versions array.",
						OdspErrorTypes.incorrectServerResponse,
						{ driverVersion },
					);
				}
				for (const version of page.value) {
					versions.push({
						versionId: version.id,
						lastModifiedDateTime: version.lastModifiedDateTime,
					});
				}
				url = page["@odata.nextLink"] ?? "";
			} while (url !== "");
			return versions;
		});

	const resolveSequenceNumber = async (versionId: string): Promise<number> =>
		getWithRetryForTokenRefresh(async (options) => {
			const url = `${itemRoot}/versions/${encodeURIComponent(
				versionId,
			)}/opStream/snapshots/trees/latest?blobs=2`;
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"FileVersionSnapshot",
			);
			const authHeaders = getHeadersWithAuth(token);
			authHeaders.accept = "application/json";
			const headers = mergeRequestHeaders(requestHeaders, authHeaders);
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				throw new NonRetryableError(
					`ODSP file version ${versionId} snapshot did not honor the JSON accept header`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion, contentType, accept: authHeaders.accept },
				);
			}
			const snapshot = (await response.content.json()) as {
				readonly trees?: readonly [{ readonly sequenceNumber?: unknown }];
			};
			const sequenceNumber = snapshot.trees?.[0]?.sequenceNumber;
			if (
				typeof sequenceNumber !== "number" ||
				!Number.isInteger(sequenceNumber) ||
				sequenceNumber < 0
			) {
				throw new NonRetryableError(
					`ODSP file version ${versionId} snapshot has a missing or invalid sequenceNumber (${String(
						sequenceNumber,
					)})`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion, contentType, accept: authHeaders.accept },
				);
			}
			return sequenceNumber;
		});

	return { listFileVersions, resolveSequenceNumber };
}

/**
 * Creates the lightweight version selector used only by point-in-time loading.
 *
 * @remarks
 * Availability checks use the separate full version manager. Keeping this selector independent
 * prevents compact snapshot parsing and availability-only lineage logic from entering the loader
 * bundle.
 *
 * @internal
 */
export function createOdspPointInTimeVersionManager(
	props: OdspPointInTimeVersionManagerProps,
): PointInTimeVersionManager {
	return createOdspPointInTimeVersionManagerCore(createPointInTimeVersionFetcher(props));
}

/**
 * Creates the lightweight selector with an injected fetcher.
 *
 * @internal
 */
export function createOdspPointInTimeVersionManagerCore(
	fetcher: PointInTimeVersionFetcher,
): PointInTimeVersionManager {
	return {
		findBaseForSeq: async (target) => {
			const versions = await fetcher.listFileVersions();
			let closestBase: ResolvedVersion | undefined;
			let oldestResolvedSeq: number | undefined;
			for (const version of versions.slice(1)) {
				const sequenceNumber = await fetcher.resolveSequenceNumber(version.versionId);
				oldestResolvedSeq =
					oldestResolvedSeq === undefined
						? sequenceNumber
						: Math.min(oldestResolvedSeq, sequenceNumber);
				if (
					sequenceNumber <= target &&
					(closestBase === undefined || sequenceNumber > closestBase.sequenceNumber)
				) {
					closestBase = { ...version, sequenceNumber };
				}
			}
			if (closestBase !== undefined) {
				return { kind: "found", base: closestBase };
			}
			return oldestResolvedSeq === undefined
				? { kind: "noBaseVersion" }
				: { kind: "noBaseVersion", oldestResolvedSeq };
		},
	};
}
