/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import type {
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { EpochTracker } from "../epochTracker.js";
import type { BaseForSeq, IOdspVersionManager } from "../odspVersionManager/index.js";

import { HistoricalDriverError } from "./errors.js";
import { loadBaseSnapshot } from "./historicalSnapshotSource.js";
import { OdspHistoricalDocumentService } from "./odspHistoricalDocumentService.js";
import { TipFileOpSource, VersionScopedOpSource } from "./opSources.js";
import type { IPointInTimeTarget } from "./pointInTimeTypes.js";
import { stitchOpsToTarget } from "./stitchOpsToTarget.js";

export interface OdspHistoricalDriverProps {
	readonly urlParts: IOdspUrlParts;
	readonly getAuthHeader: InstrumentedStorageTokenFetcher;
	readonly epochTracker: EpochTracker;
	readonly logger: TelemetryLoggerExt;
	readonly resolvedUrl: IResolvedUrl;
	readonly versionManager?: IOdspVersionManager;
}

/** Loads a historical file version and stitches its operations through a requested sequence number. */
export class OdspHistoricalDriver {
	public constructor(private readonly props: OdspHistoricalDriverProps) {}

	public async createServiceForTarget(
		baseForSeq: BaseForSeq,
		target: IPointInTimeTarget,
	): Promise<OdspHistoricalDocumentService> {
		const currentEpoch = this.props.epochTracker.fluidEpoch;
		if (currentEpoch !== undefined && currentEpoch !== target.odspEpoch) {
			throw new HistoricalDriverError("targetFromDifferentTimeline");
		}
		return this.createService(
			baseForSeq,
			target.sequenceNumber,
			target.referenceSequenceNumber,
			target.markerKind !== undefined,
		);
	}

	public async createService(
		baseForSeq: BaseForSeq,
		targetSequenceNumber: number,
		targetReferenceSequenceNumber?: number,
		skipBatchBoundaryValidation = false,
	): Promise<OdspHistoricalDocumentService> {
		if (baseForSeq.kind === "noBaseVersion") {
			throw new HistoricalDriverError("targetPredatesHistory", {
				oldestReachableSeq: baseForSeq.oldestResolvedSeq,
			});
		}
		let base = baseForSeq.base;
		while (true) {
			if (
				base.minimumSequenceNumber !== undefined &&
				targetSequenceNumber > base.sequenceNumber &&
				targetSequenceNumber < base.minimumSequenceNumber
			) {
				const replacement = await this.props.versionManager?.findVersionInRange(
					base.sequenceNumber + 1,
					targetSequenceNumber,
				);
				if (replacement === undefined) {
					throw new HistoricalDriverError("opsUnavailable", {
						missingFromSeq: base.sequenceNumber + 1,
					});
				}
				base = replacement;
				continue;
			}
			try {
				const { snapshot, epoch } = await loadBaseSnapshot(this.props, base);
				const versionScopedOpSource = new VersionScopedOpSource(
					this.props.urlParts,
					base.versionId,
					this.props.getAuthHeader,
					this.props.epochTracker,
				);
				const tipFileOpSource = new TipFileOpSource(
					this.props.urlParts,
					this.props.getAuthHeader,
					this.props.epochTracker,
				);
				const ops = await stitchOpsToTarget(
					versionScopedOpSource,
					tipFileOpSource,
					snapshot.sequenceNumber ?? base.sequenceNumber,
					targetSequenceNumber,
					epoch,
					targetReferenceSequenceNumber,
					skipBatchBoundaryValidation,
				);
				return new OdspHistoricalDocumentService(
					this.props.resolvedUrl,
					this.props.logger,
					snapshot,
					ops,
				);
			} catch (error) {
				if (
					error instanceof HistoricalDriverError &&
					error.code === "opsUnavailable" &&
					error.details.missingFromSeq !== undefined &&
					this.props.versionManager !== undefined
				) {
					const replacement = await this.props.versionManager.findVersionInRange(
						error.details.missingFromSeq,
						targetSequenceNumber,
					);
					if (replacement !== undefined) {
						base = replacement;
						continue;
					}
				}
				throw error;
			}
		}
	}
}
