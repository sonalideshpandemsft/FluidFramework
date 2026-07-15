/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	OdspVersionManager,
	type BaseForSeq,
	type IOdspVersionManager,
	type IResolvedVersionSequenceNumbers,
	type OdspFileVersionRef,
	type IOdspFileVersionFetcher,
	type ResolvedVersion,
} from "./odspVersionManager.js";
export {
	createOdspFileVersionFetcher,
	getVersionSnapshotUrl,
	type OdspFileVersionFetcherProps,
} from "./odspFileVersionFetcher.js";
