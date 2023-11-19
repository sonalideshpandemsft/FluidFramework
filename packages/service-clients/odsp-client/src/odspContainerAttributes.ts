/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { IOdspContainerAttributes } from "./interfaces";

export class OdspContainerAttributes implements IOdspContainerAttributes {
	private readonly resolvedUrl: IOdspResolvedUrl;
	constructor(container: IContainer) {
		this.resolvedUrl = container.resolvedUrl as IOdspResolvedUrl;
	}

	public getFileName(): string {
		return this.resolvedUrl.fileName;
	}

	public getDriveId(): string {
		return this.resolvedUrl.driveId;
	}

	public getItemId(): string {
		return this.resolvedUrl.itemId;
	}

	public getSiteUrl(): string {
		return this.resolvedUrl.siteUrl;
	}
}
