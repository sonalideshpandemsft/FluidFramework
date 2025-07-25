/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState, IAudience } from "@fluidframework/container-definitions";
import { IDeltaManager } from "@fluidframework/container-definitions/internal";
import { FluidObject } from "@fluidframework/core-interfaces";
import {
	IFluidHandleContext,
	type IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { IClientDetails, IQuorumClients } from "@fluidframework/driver-definitions";
import {
	IDocumentMessage,
	ISnapshotTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { IIdCompressorCore } from "@fluidframework/id-compressor/internal";
import {
	CreateChildSummarizerNodeFn,
	CreateChildSummarizerNodeParam,
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IFluidDataStoreRegistry,
	IGarbageCollectionDetailsBase,
	type IRuntimeStorageService,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITelemetryLoggerExt,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { MockDeltaManager } from "./mockDeltas.js";

/**
 * @legacy
 * @alpha
 */
export class MockFluidDataStoreContext implements IFluidDataStoreContext {
	public isLocalDataStore: boolean = true;
	public packagePath: readonly string[] = undefined as any;

	public options: Record<string | number, any> = {};
	public clientId: string | undefined = uuid();
	public clientDetails: IClientDetails;
	public connected: boolean = true;
	public readonly: boolean = false;
	public baseSnapshot: ISnapshotTree | undefined;
	public deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> =
		new MockDeltaManager(() => this.clientId);

	public containerRuntime: IContainerRuntimeBase = undefined as any;
	public storage: IRuntimeStorageService = undefined as any;
	public IFluidDataStoreRegistry: IFluidDataStoreRegistry = undefined as any;
	public IFluidHandleContext: IFluidHandleContext = undefined as any;
	public idCompressor: IIdCompressorCore & IIdCompressor = undefined as any;
	public readonly gcThrowOnTombstoneUsage = false;
	public readonly gcTombstoneEnforcementAllowed = false;

	/**
	 * @remarks This is for internal use only.
	 */
	public ILayerCompatDetails?: unknown;

	/**
	 * Indicates the attachment state of the data store to a host service.
	 */
	public attachState: AttachState = undefined as any;

	/**
	 * @deprecated 0.16 Issue #1635, #3631
	 */
	public createProps?: any;
	public scope: FluidObject = undefined as any;

	constructor(
		public readonly id: string = uuid(),
		public readonly existing: boolean = false,
		public readonly baseLogger: ITelemetryLoggerExt = createChildLogger({
			namespace: "fluid:MockFluidDataStoreContext",
		}),
		interactive: boolean = true,
	) {
		this.clientDetails = { capabilities: { interactive } };
	}

	on(event: string | symbol, listener: (...args: any[]) => void): this {
		switch (event) {
			case "attaching":
			case "attached":
				return this;
			default:
				throw new Error("Method not implemented.");
		}
	}

	once(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}

	off(event: string | symbol, listener: (...args: any[]) => void): this {
		throw new Error("Method not implemented.");
	}

	public getQuorum(): IQuorumClients {
		return undefined as any as IQuorumClients;
	}

	public getAudience(): IAudience {
		return undefined as any as IAudience;
	}

	public submitMessage(type: string, content: any, localOpMetadata: unknown): void {
		// No-op for mock context
	}

	public submitSignal(type: string, content: any): void {
		throw new Error("Method not implemented.");
	}

	public makeLocallyVisible(): void {
		throw new Error("Method not implemented.");
	}

	public setChannelDirty(address: string): void {
		throw new Error("Method not implemented.");
	}

	public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
		throw new Error("Method not implemented.");
	}

	public getCreateChildSummarizerNodeFn(
		id: string,
		createParam: CreateChildSummarizerNodeParam,
	): CreateChildSummarizerNodeFn {
		throw new Error("Method not implemented.");
	}

	public deleteChildSummarizerNode(id: string): void {
		throw new Error("Method not implemented.");
	}

	public async uploadBlob(
		blob: ArrayBufferLike,
	): Promise<IFluidHandleInternal<ArrayBufferLike>> {
		throw new Error("Method not implemented.");
	}

	public async getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase> {
		throw new Error("Method not implemented.");
	}

	public addedGCOutboundRoute(fromPath: string, toPath: string, messageTimestampMs?: number) {
		throw new Error("Method not implemented.");
	}
}
