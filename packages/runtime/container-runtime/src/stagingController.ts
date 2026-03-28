/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IStagingController,
	IContainerRuntimeBaseInternal,
} from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Implementation of {@link IStagingController} that delegates to the container runtime's
 * internal staging mode API.
 *
 * This object is created once at container load time and is the exclusive public controller
 * of staging mode for the container's lifetime.
 */
export class StagingController implements IStagingController {
	public constructor(private readonly runtime: IContainerRuntimeBaseInternal) {}

	public enterStagingMode(): void {
		this.runtime.enterStagingMode();
	}

	public exitStagingMode(action: "commit" | "discard"): void {
		if (!this.runtime.inStagingMode) {
			throw new UsageError("Cannot exit staging mode: not currently in staging mode");
		}
		this.runtime.exitStagingMode(action);
	}
}
