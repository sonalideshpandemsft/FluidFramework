/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IDirectory, IDirectoryValueChanged, ISharedDirectory } from "../interfaces.js";

/**
 * Recursively builds a nested map structure representing the directory tree.
 */
interface DirectoryNode {
	keys: Map<string, unknown>;
	subdirectories: Map<string, DirectoryNode>;
}

/**
 * Simple oracle for ISharedDirectory that mirrors the directory state including subdirectories.
 * @internal
 */
export class SharedDirectoryOracle {
	private readonly root: DirectoryNode = {
		keys: new Map<string, unknown>(),
		subdirectories: new Map<string, DirectoryNode>(),
	};

	public constructor(private readonly fuzzDirectory: ISharedDirectory) {
		// Snapshot current state
		this.snapshotDirectory(fuzzDirectory, this.root);

		// Listen to all directory events
		this.fuzzDirectory.on("valueChanged", this.onValueChanged);
		this.fuzzDirectory.on("clear", this.onClear);
		this.fuzzDirectory.on("subDirectoryCreated", this.onSubDirectoryCreated);
		this.fuzzDirectory.on("subDirectoryDeleted", this.onSubDirectoryDeleted);
	}

	/**
	 * Recursively snapshot a directory and all its subdirectories.
	 */
	private snapshotDirectory(dir: IDirectory, node: DirectoryNode): void {
		// Snapshot all keys in this directory
		for (const [key, value] of dir.entries()) {
			node.keys.set(key, value);
		}

		// Snapshot all subdirectories
		for (const [name, subdir] of dir.subdirectories()) {
			const subNode: DirectoryNode = {
				keys: new Map<string, unknown>(),
				subdirectories: new Map<string, DirectoryNode>(),
			};
			node.subdirectories.set(name, subNode);
			this.snapshotDirectory(subdir, subNode);
		}
	}

	/**
	 * Navigate to a node in the oracle based on an absolute path.
	 */
	private getNodeAtPath(path: string): DirectoryNode | undefined {
		if (path === "/" || path === "") {
			return this.root;
		}

		const parts = path.split("/").filter((p) => p.length > 0);
		let current = this.root;

		for (const part of parts) {
			const next = current.subdirectories.get(part);
			if (next === undefined) {
				return undefined;
			}
			current = next;
		}

		return current;
	}

	/**
	 * Get the parent path and directory name from an absolute path.
	 */
	private splitPath(path: string): { parentPath: string; name: string } {
		if (path === "/" || path === "") {
			return { parentPath: "", name: "" };
		}

		const lastSlash = path.lastIndexOf("/");
		if (lastSlash === -1) {
			return { parentPath: "/", name: path };
		}

		const parentPath = path.slice(0, lastSlash) || "/";
		const name = path.slice(lastSlash + 1);
		return { parentPath, name };
	}

	private readonly onValueChanged = (
		changed: IDirectoryValueChanged,
		local: boolean,
	): void => {
		const node = this.getNodeAtPath(changed.path);
		assert(node !== undefined, `Directory at path "${changed.path}" should exist in oracle`);

		assert.strictEqual(
			changed.previousValue,
			node.keys.get(changed.key),
			`Mismatch on previous value for key="${changed.key}" at path="${changed.path}"`,
		);

		// Update the oracle's state
		const dir = this.fuzzDirectory.getWorkingDirectory(changed.path);
		assert(dir !== undefined, `Directory at path "${changed.path}" should exist`);

		if (dir.has(changed.key)) {
			node.keys.set(changed.key, dir.get(changed.key));
		} else {
			node.keys.delete(changed.key);
		}
	};

	private readonly onClear = (local: boolean): void => {
		// Clear operation clears the root directory only (not subdirectories)
		this.root.keys.clear();

		// AB#48665: https://dev.azure.com/fluidframework/internal/_workitems/edit/48665
		// For non-local clears, resync from the actual directory
		if (!local) {
			for (const [k, v] of this.fuzzDirectory.entries()) {
				this.root.keys.set(k, v);
			}
		}
	};

	private readonly onSubDirectoryCreated = (path: string, local: boolean): void => {
		const { parentPath, name } = this.splitPath(path);
		const parentNode = this.getNodeAtPath(parentPath);
		assert(
			parentNode !== undefined,
			`Parent directory at path "${parentPath}" should exist in oracle`,
		);

		// Create new subdirectory node if it doesn't exist
		if (!parentNode.subdirectories.has(name)) {
			const newNode: DirectoryNode = {
				keys: new Map<string, unknown>(),
				subdirectories: new Map<string, DirectoryNode>(),
			};
			parentNode.subdirectories.set(name, newNode);

			// Snapshot the new subdirectory from the actual directory
			const actualSubDir = this.fuzzDirectory.getWorkingDirectory(path);
			if (actualSubDir !== undefined) {
				this.snapshotDirectory(actualSubDir, newNode);
			}
		}
	};

	private readonly onSubDirectoryDeleted = (path: string, local: boolean): void => {
		const { parentPath, name } = this.splitPath(path);
		const parentNode = this.getNodeAtPath(parentPath);
		assert(
			parentNode !== undefined,
			`Parent directory at path "${parentPath}" should exist in oracle`,
		);

		// Delete the subdirectory from the oracle
		parentNode.subdirectories.delete(name);
	};

	/**
	 * Recursively validate a directory node against the actual directory.
	 */
	private validateDirectory(dir: IDirectory, node: DirectoryNode): void {
		// Validate keys
		const actualKeys = Object.fromEntries(dir.entries());
		const expectedKeys = Object.fromEntries(node.keys.entries());

		assert.deepStrictEqual(
			actualKeys,
			expectedKeys,
			`SharedDirectoryOracle mismatch at ${dir.absolutePath}: keys differ`,
		);

		// Validate subdirectories
		const actualSubDirs = new Map<string, IDirectory>();
		for (const [name, subdir] of dir.subdirectories()) {
			actualSubDirs.set(name, subdir);
		}

		assert.strictEqual(
			actualSubDirs.size,
			node.subdirectories.size,
			`SharedDirectoryOracle mismatch at ${dir.absolutePath}: subdirectory count differs`,
		);

		// Recursively validate each subdirectory
		for (const [name, subNode] of node.subdirectories) {
			const actualSubDir = actualSubDirs.get(name);
			assert(
				actualSubDir !== undefined,
				`Subdirectory "${name}" should exist at ${dir.absolutePath}`,
			);
			this.validateDirectory(actualSubDir, subNode);
		}
	}

	public validate(): void {
		this.validateDirectory(this.fuzzDirectory, this.root);
	}

	public dispose(): void {
		this.fuzzDirectory.off("valueChanged", this.onValueChanged);
		this.fuzzDirectory.off("clear", this.onClear);
		this.fuzzDirectory.off("subDirectoryCreated", this.onSubDirectoryCreated);
		this.fuzzDirectory.off("subDirectoryDeleted", this.onSubDirectoryDeleted);
	}
}
