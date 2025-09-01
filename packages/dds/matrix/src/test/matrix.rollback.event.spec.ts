/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { strict as assert } from "node:assert";

import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { matrixFactory } from "./utils.js";

describe("SharedMatrix rollback (conflict event)", () => {
	it("should not emit conflict when rolling back a local setCell", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const conflicts: unknown[] = [];
		matrix.on("conflict", (row, col, currentValue, conflictingValue) => {
			conflicts.push({ row, col, currentValue, conflictingValue });
		});

		// Local op
		matrix.insertRows(0, 1);
		matrix.insertCols(0, 1);
		matrix.setCell(0, 0, 42);

		// Rollback the local op
		containerRuntime.rollback?.();

		// No conflicts should have been raised
		assert.deepEqual(conflicts, [], "rollback should not trigger conflict");
	});

	it("should not emit conflict when rolling back structural ops", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const conflicts: unknown[] = [];
		matrix.on("conflict", (...args) => conflicts.push(args));

		matrix.insertRows(0, 2);
		matrix.insertCols(0, 2);

		// Rollback pending ops
		containerRuntime.rollback?.();

		assert.deepEqual(conflicts, [], "rollback of structural ops should not trigger conflict");
	});

	it("should only emit conflict when two clients race, not on rollback", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});

		// Two clients
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataRuntime2);
		const matrix1 = matrixFactory.create(dataRuntime1, "A");
		const matrix2 = matrixFactory.create(dataRuntime2, "A");

		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix1.insertRows(0, 1);
		matrix1.insertCols(0, 1);
		matrix2.insertRows(0, 1);
		matrix2.insertCols(0, 1);
		containerRuntime1.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const conflicts: any[] = [];
		matrix1.on("conflict", (row, col, currentValue, conflictingValue) => {
			conflicts.push({ row, col, currentValue, conflictingValue });
		});

		// Race: both clients set same cell differently
		matrix1.setCell(0, 0, "A");
		matrix2.setCell(0, 0, "B");

		// Deliver ops (sequencing decides one winner)
		containerRuntime1.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		assert(conflicts.length === 1, "exactly one conflict event expected");
		assert.equal(conflicts[0].row, 0);
		assert.equal(conflicts[0].col, 0);
		assert.deepEqual(conflicts[0].conflictingValue, "A");
	});
});
