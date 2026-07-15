/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainer,
	IContainerLoadMode,
} from "@fluidframework/container-definitions/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type {
	IRequest,
	IRequestHeader,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type {
	IDocumentStorageService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";

import {
	loadExistingContainer,
	type IContainerDriverServices,
	type IContainerHostProps,
} from "./createAndLoadContainerUtils.js";

/**
 * Props used to load a container to a point in document history.
 * @legacy @alpha
 */
export interface ILoadContainerToSequenceNumberProps
	extends IContainerHostProps,
		IContainerDriverServices {
	/**
	 * The request to resolve the container.
	 */
	readonly request: IRequest;

	/**
	 * Sequence number the loader should materialize before returning the container.
	 */
	readonly loadToSequenceNumber: number;
}

/**
 * Structured result for point-in-time materialization availability checks.
 * @legacy @alpha
 */
export type PointInTimeMaterializationAvailability =
	| {
			readonly canMaterialize: true;
	  }
	| {
			readonly canMaterialize: false;
			readonly reason:
				| "unsupportedByDriver"
				| "targetUnavailable"
				| "requestNotResolvable"
				| "error";
			readonly message?: string;
			readonly details?: Record<string, string | number | boolean | undefined>;
	  };

/**
 * Props used to check if a target can be materialized at point in time.
 * @legacy @alpha
 */
export type ICanMaterializePointInTimeProps = IContainerDriverServices & {
	readonly request: IRequest;
	readonly target: {
		readonly sequenceNumber: number;
	};
	readonly logger?: ITelemetryBaseLogger;
};

function addLoadToSequenceNumberHeaders(
	request: IRequest,
	loadToSequenceNumber: number,
): IRequest {
	const requestHeaders = request.headers as Partial<Record<string, unknown>> | undefined;
	const loadMode = requestHeaders?.[LoaderHeader.loadMode] as
		| Partial<IContainerLoadMode>
		| undefined;
	const headers: IRequestHeader = {
		...requestHeaders,
		[LoaderHeader.sequenceNumber]: loadToSequenceNumber,
		[LoaderHeader.loadMode]: {
			...loadMode,
			opsBeforeReturn: "sequenceNumber",
			deltaConnection: "none",
		},
	};
	return {
		...request,
		headers,
	};
}

/**
 * Loads a container to a point in document history.
 * @param loadContainerToSequenceNumberProps - Services and properties necessary for loading the container.
 * @remarks The returned container is paused at the requested sequence number and should be treated as a read-only historical view.
 * @legacy @alpha
 */
export async function loadContainerToSequenceNumber(
	loadContainerToSequenceNumberProps: ILoadContainerToSequenceNumberProps,
): Promise<IContainer> {
	const request = addLoadToSequenceNumberHeaders(
		loadContainerToSequenceNumberProps.request,
		loadContainerToSequenceNumberProps.loadToSequenceNumber,
	);
	return loadExistingContainer({ ...loadContainerToSequenceNumberProps, request });
}

function isPointInTimeMaterializationCapable(
	storageService: IDocumentStorageService,
): storageService is IDocumentStorageService & {
	canMaterializePointInTime: (
		target: {
			readonly sequenceNumber: number;
		},
	) => Promise<PointInTimeMaterializationAvailability>;
} {
	const candidate = storageService as Partial<{
		canMaterializePointInTime: (
			target: {
				readonly sequenceNumber: number;
			},
		) => Promise<PointInTimeMaterializationAvailability>;
	}>;
	return typeof candidate.canMaterializePointInTime === "function";
}

/**
 * Checks whether the current driver wiring can materialize the requested historical target.
 * @legacy @alpha
 */
export async function canMaterializePointInTime(
	props: ICanMaterializePointInTimeProps,
): Promise<PointInTimeMaterializationAvailability> {
	let documentService:
		| Awaited<ReturnType<IContainerDriverServices["documentServiceFactory"]["createDocumentService"]>>
		| undefined;
	try {
		const resolvedUrl: IResolvedUrl | undefined = await props.urlResolver.resolve(props.request);
		if (resolvedUrl === undefined) {
			return {
				canMaterialize: false,
				reason: "requestNotResolvable",
				message: "Unable to resolve the request URL for point-in-time availability probing",
			};
		}

		documentService = await props.documentServiceFactory.createDocumentService(
			resolvedUrl,
			props.logger,
		);
		const storageService = await documentService.connectToStorage();
		if (!isPointInTimeMaterializationCapable(storageService)) {
			return {
				canMaterialize: false,
				reason: "unsupportedByDriver",
				message:
					"Driver storage service does not expose canMaterializePointInTime capability",
			};
		}

		return await storageService.canMaterializePointInTime(props.target);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			canMaterialize: false,
			reason: "error",
			message,
		};
	} finally {
		documentService?.dispose?.();
	}
}
