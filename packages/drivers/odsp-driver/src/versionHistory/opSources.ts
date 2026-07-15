/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type {
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";

import type { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "../contracts.js";
import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { getWithRetryForTokenRefresh } from "../odspUtils.js";

/** A source for a consecutive range of operations. */
export interface IOpSource {
	getOps(from: number, to: number): Promise<IOpSourceResult>;
}

/** Operations and the epoch returned by a source request. */
export interface IOpSourceResult {
	readonly messages: ISequencedDocumentMessage[];
	readonly epoch?: string;
}

/** Reads operations retained with a particular historical file version. */
export class VersionScopedOpSource implements IOpSource {
	public constructor(
		private readonly urlParts: IOdspUrlParts,
		private readonly versionId: string,
		private readonly getAuthHeader: InstrumentedStorageTokenFetcher,
		private readonly epochTracker: EpochTracker,
	) {}

	public async getOps(from: number, to: number): Promise<IOpSourceResult> {
		return getWithRetryForTokenRefresh(async (options) => {
			const url = this.buildUrl(from, to);
			const method = "GET";
			const token = await this.getAuthHeader(
				{ ...options, request: { url, method } },
				"HistoricalVersionOps",
			);
			const response = await this.epochTracker.fetchAndParseAsJSON<IDeltaStorageGetResponse>(
				url,
				{ method, headers: getHeadersWithAuth(token) },
				"ops",
			);
			return {
				messages: getMessages(response.content),
				epoch: response.headers.get("x-fluid-epoch") ?? undefined,
			};
		});
	}

	private buildUrl(from: number, to: number): string {
		const { siteUrl, driveId, itemId } = this.urlParts;
		const filter = encodeURIComponent(
			`sequenceNumber ge ${from} and sequenceNumber le ${to - 1}`,
		);
		return `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions/${encodeURIComponent(this.versionId)}/opStream?ump=1&filter=${filter}`;
	}
}

/** Reads operations from the live file after a version-scoped stream is exhausted. */
export class TipFileOpSource implements IOpSource {
	public constructor(
		private readonly urlParts: IOdspUrlParts,
		private readonly getAuthHeader: InstrumentedStorageTokenFetcher,
		private readonly epochTracker: EpochTracker,
	) {}

	public async getOps(from: number, to: number): Promise<IOpSourceResult> {
		return getWithRetryForTokenRefresh(async (options) => {
			const url = this.buildUrl(from, to);
			const method = "GET";
			const token = await this.getAuthHeader(
				{ ...options, request: { url, method } },
				"HistoricalTipOps",
			);
			const response = await this.epochTracker.fetchAndParseAsJSON<IDeltaStorageGetResponse>(
				url,
				{ method, headers: getHeadersWithAuth(token) },
				"ops",
			);
			return {
				messages: getMessages(response.content),
				epoch: response.headers.get("x-fluid-epoch") ?? undefined,
			};
		});
	}

	private buildUrl(from: number, to: number): string {
		const { siteUrl, driveId, itemId } = this.urlParts;
		const filter = encodeURIComponent(
			`sequenceNumber ge ${from} and sequenceNumber le ${to - 1}`,
		);
		return `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/opStream?ump=1&filter=${filter}`;
	}
}

function getMessages(response: IDeltaStorageGetResponse): ISequencedDocumentMessage[] {
	const first = response.value[0];
	return first !== undefined && "op" in first
		? (response.value as ISequencedDeltaOpMessage[]).map((operation) => operation.op)
		: (response.value as ISequencedDocumentMessage[]);
}
