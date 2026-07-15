/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IClient, ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentStorageService,
	IResolvedUrl,
	ISequencedDocumentMessage,
	IStream,
	ISnapshot,
	ISummaryContext,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { Queue, UsageError, emptyMessageStream } from "@fluidframework/driver-utils/internal";
import {
	loggerToMonitoringContext,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { OdspDocumentStorageServiceBase } from "../odspDocumentStorageServiceBase.js";

/** A storage-only document service over a historical snapshot and its bounded operations. */
export class OdspHistoricalDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	public readonly policies = { storageOnly: true };

	public constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly logger: TelemetryLoggerExt,
		private readonly snapshot: ISnapshot,
		private readonly ops: ISequencedDocumentMessage[],
	) {
		super();
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		return new HistoricalDocumentStorageService(this.logger, this.snapshot);
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return new HistoricalDeltaStorageService(this.ops);
	}

	public connectToDeltaStream(_client: IClient): never {
		throw new UsageError(
			'"connectToDeltaStream" is not supported by OdspHistoricalDocumentService',
		);
	}

	public dispose(): void {}
}

class HistoricalDeltaStorageService implements IDocumentDeltaStorageService {
	public constructor(private remainingOps: ISequencedDocumentMessage[]) {}

	public fetchMessages(
		from: number,
		to: number | undefined,
		_abortSignal?: AbortSignal,
		_cachedOnly?: boolean,
		_fetchReason?: string,
	): IStream<ISequencedDocumentMessage[]> {
		if (this.remainingOps.length === 0) {
			return emptyMessageStream;
		}
		const messages = this.remainingOps.filter(
			(op) => op.sequenceNumber >= from && (to === undefined || op.sequenceNumber < to),
		);
		this.remainingOps = this.remainingOps.filter(
			(op) => to !== undefined && op.sequenceNumber >= to,
		);
		const queue = new Queue<ISequencedDocumentMessage[]>();
		queue.pushValue(messages);
		queue.pushDone();
		return queue;
	}
}

class HistoricalDocumentStorageService extends OdspDocumentStorageServiceBase {
	private snapshotTreeId: string | undefined;

	public constructor(
		logger: TelemetryLoggerExt,
		private readonly snapshot: ISnapshot,
	) {
		super(loggerToMonitoringContext(logger).config);
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null -- legacy storage interface uses null for the head version.
		blobId: string | null,
		count: number,
		_scenarioName?: string,
	): Promise<IVersion[]> {
		assert(blobId !== undefined, "blobId should be provided");
		assert(count === 1, "count should be one");
		this.snapshotTreeId ??= this.initializeFromSnapshot(this.snapshot);
		return this.snapshotTreeId === undefined
			? []
			: [{ id: this.snapshotTreeId, treeId: undefined! }];
	}

	public async getSnapshot(): Promise<ISnapshot> {
		return this.snapshot;
	}

	protected fetchTreeFromSnapshot(_id: string, _scenarioName?: string): never {
		throw new UsageError(
			'"fetchTreeFromSnapshot" is not supported by HistoricalDocumentStorageService',
		);
	}

	protected fetchBlobFromStorage(_blobId: string, _evicted: boolean): never {
		throw new UsageError(
			'"fetchBlobFromStorage" is not supported by HistoricalDocumentStorageService',
		);
	}

	public uploadSummaryWithContext(_summary: ISummaryTree, _context: ISummaryContext): never {
		throw new UsageError(
			'"uploadSummaryWithContext" is not supported by HistoricalDocumentStorageService',
		);
	}

	public createBlob(_file: ArrayBufferLike): never {
		throw new UsageError('"createBlob" is not supported by HistoricalDocumentStorageService');
	}
}
