/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type FieldKey,
	type FieldKindIdentifier,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
} from "../core/index.js";
import { FieldKinds, type FlexFieldKind } from "../feature-libraries/index.js";
import { brand, getOrCreate } from "../util/index.js";

import { NodeKind } from "./core/index.js";
import { FieldKind, normalizeFieldSchema, type ImplicitFieldSchema } from "./fieldSchema.js";
import type {
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleNodeSchemaBase,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

const viewToStoredCache = new WeakMap<ImplicitFieldSchema, TreeStoredSchema>();

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 * @throws
 * Throws a `UsageError` if multiple schemas are encountered with the same identifier.
 */
export function toStoredSchema(root: ImplicitFieldSchema): TreeStoredSchema {
	return getOrCreate(viewToStoredCache, root, () => {
		const normalized = normalizeFieldSchema(root);
		const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
		walkFieldSchema(normalized, {
			node(schema) {
				if (nodeSchema.has(brand(schema.identifier))) {
					// Use JSON.stringify to quote and escape identifier string.
					throw new UsageError(
						`Multiple schema encountered with the identifier ${JSON.stringify(
							schema.identifier,
						)}. Remove or rename them to avoid the collision.`,
					);
				}
				nodeSchema.set(
					brand(schema.identifier),
					getStoredSchema(schema as SimpleNodeSchemaBase<NodeKind> as SimpleNodeSchema),
				);
			},
		});

		const result: TreeStoredSchema = {
			nodeSchema,
			rootFieldSchema: convertField(normalized),
		};
		return result;
	});
}

/**
 * Converts a {@link SimpleTreeSchema} into a {@link TreeStoredSchema}.
 */
export function simpleToStoredSchema(root: SimpleTreeSchema): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [identifier, schema] of root.definitions) {
		nodeSchema.set(brand(identifier), getStoredSchema(schema));
	}

	const result: TreeStoredSchema = {
		nodeSchema,
		rootFieldSchema: convertField(root.root),
	};
	return result;
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function convertField(schema: SimpleFieldSchema): TreeFieldStoredSchema {
	const kind: FieldKindIdentifier =
		convertFieldKind.get(schema.kind)?.identifier ?? fail(0xae3 /* Invalid field kind */);
	const types: TreeTypeSet = schema.allowedTypesIdentifiers as TreeTypeSet;
	return { kind, types, persistedMetadata: schema.persistedMetadata };
}

/**
 * A map that converts {@link FieldKind} to {@link FlexFieldKind}.
 */
export const convertFieldKind: ReadonlyMap<FieldKind, FlexFieldKind> = new Map<
	FieldKind,
	FlexFieldKind
>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
	[FieldKind.Identifier, FieldKinds.identifier],
]);

/**
 * Converts a {@link TreeNodeSchema} into a {@link TreeNodeStoredSchema}.
 * @privateRemarks
 * TODO: Persist node metadata once schema FormatV2 is supported.
 *
 * TODO: AB#43548: Using a stored schema for unhydrated flex trees does not handle schema evolution features like "allowUnknownOptionalFields".
 * Usage of this and the conversion which wrap it should be audited and reduced.
 */
export function getStoredSchema(schema: SimpleNodeSchema): TreeNodeStoredSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			assert(schema.kind === NodeKind.Leaf, 0xa4a /* invalid kind */);
			return new LeafNodeStoredSchema(schema.leafKind);
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			const types = schema.allowedTypesIdentifiers as TreeTypeSet;
			return new MapNodeStoredSchema(
				{
					kind: FieldKinds.optional.identifier,
					types,
					persistedMetadata: schema.persistedMetadata,
				},
				// TODO: Find a way to avoid injecting persistedMetadata twice in these constructor calls.
				schema.persistedMetadata,
			);
		}
		case NodeKind.Array: {
			const types = schema.allowedTypesIdentifiers as TreeTypeSet;
			const field = {
				kind: FieldKinds.sequence.identifier,
				types,
				persistedMetadata: schema.persistedMetadata,
			};
			const fields = new Map([[EmptyKey, field]]);
			return new ObjectNodeStoredSchema(fields, schema.persistedMetadata);
		}
		case NodeKind.Object: {
			const fields: Map<FieldKey, TreeFieldStoredSchema> = new Map();
			for (const fieldSchema of schema.fields.values()) {
				fields.set(brand(fieldSchema.storedKey), convertField(fieldSchema));
			}
			return new ObjectNodeStoredSchema(fields, schema.persistedMetadata);
		}
		default: {
			unreachableCase(kind);
		}
	}
}
