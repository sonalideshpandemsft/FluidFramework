/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainer,
	IContainerLoadMode,
} from "@fluidframework/container-definitions/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { IRequest, IRequestHeader } from "@fluidframework/core-interfaces";

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
