/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedDirectory, ISharedMap } from "../../interfaces.js";
import type { SharedMap } from "../../mapFactory.js";
import { SharedDirectoryOracle } from "../directoryOracle.js";
import { SharedMapOracle } from "../mapOracle.js";

/**
 * @internal
 */
export interface ISharedMapWithOracle extends ISharedMap {
	sharedMapOracle: SharedMapOracle;
}

/**
 * Type guard for map
 * @internal
 */
export function hasSharedMapOracle(s: SharedMap): s is ISharedMapWithOracle {
	return "sharedMapOracle" in s && s.sharedMapOracle instanceof SharedMapOracle;
}

/**
 * @internal
 */
export interface ISharedDirectoryWithOracle extends ISharedDirectory {
	directoryOracle: SharedDirectoryOracle;
}
/**
 * Type guard for SharedDirectory with an oracle
 * @internal
 */
export function hasSharedDirectoryOracle(
	d: ISharedDirectory,
): d is ISharedDirectoryWithOracle {
	if (!("directoryOracle" in d)) {
		return false;
	}
	const maybeOracle = (d as { directoryOracle?: unknown }).directoryOracle;
	return maybeOracle instanceof SharedDirectoryOracle;
}
