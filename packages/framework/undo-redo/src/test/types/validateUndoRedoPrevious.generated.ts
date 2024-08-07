/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by flub generate:typetests in @fluid-tools/build-cli.
 */

import type { TypeOnly, MinimalType, FullType, requireAssignableTo } from "@fluidframework/build-tools";
import type * as old from "@fluidframework/undo-redo-previous/internal";

import type * as current from "../../index.js";

declare type MakeUnusedImportErrorsGoAway<T> = TypeOnly<T> | MinimalType<T> | FullType<T> | typeof old | typeof current | requireAssignableTo<true, true>;

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_IRevertible": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_IRevertible = requireAssignableTo<TypeOnly<old.IRevertible>, TypeOnly<current.IRevertible>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_IRevertible": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_IRevertible = requireAssignableTo<TypeOnly<current.IRevertible>, TypeOnly<old.IRevertible>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedMapRevertible": {"forwardCompat": false}
 */
declare type old_as_current_for_ClassDeclaration_SharedMapRevertible = requireAssignableTo<TypeOnly<old.SharedMapRevertible>, TypeOnly<current.SharedMapRevertible>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedMapRevertible": {"backCompat": false}
 */
declare type current_as_old_for_ClassDeclaration_SharedMapRevertible = requireAssignableTo<TypeOnly<current.SharedMapRevertible>, TypeOnly<old.SharedMapRevertible>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedMapUndoRedoHandler": {"forwardCompat": false}
 */
declare type old_as_current_for_ClassDeclaration_SharedMapUndoRedoHandler = requireAssignableTo<TypeOnly<old.SharedMapUndoRedoHandler>, TypeOnly<current.SharedMapUndoRedoHandler>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedMapUndoRedoHandler": {"backCompat": false}
 */
declare type current_as_old_for_ClassDeclaration_SharedMapUndoRedoHandler = requireAssignableTo<TypeOnly<current.SharedMapUndoRedoHandler>, TypeOnly<old.SharedMapUndoRedoHandler>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedSegmentSequenceRevertible": {"forwardCompat": false}
 */
declare type old_as_current_for_ClassDeclaration_SharedSegmentSequenceRevertible = requireAssignableTo<TypeOnly<old.SharedSegmentSequenceRevertible>, TypeOnly<current.SharedSegmentSequenceRevertible>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedSegmentSequenceRevertible": {"backCompat": false}
 */
declare type current_as_old_for_ClassDeclaration_SharedSegmentSequenceRevertible = requireAssignableTo<TypeOnly<current.SharedSegmentSequenceRevertible>, TypeOnly<old.SharedSegmentSequenceRevertible>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedSegmentSequenceUndoRedoHandler": {"forwardCompat": false}
 */
declare type old_as_current_for_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler = requireAssignableTo<TypeOnly<old.SharedSegmentSequenceUndoRedoHandler>, TypeOnly<current.SharedSegmentSequenceUndoRedoHandler>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_SharedSegmentSequenceUndoRedoHandler": {"backCompat": false}
 */
declare type current_as_old_for_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler = requireAssignableTo<TypeOnly<current.SharedSegmentSequenceUndoRedoHandler>, TypeOnly<old.SharedSegmentSequenceUndoRedoHandler>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_UndoRedoStackManager": {"forwardCompat": false}
 */
declare type old_as_current_for_ClassDeclaration_UndoRedoStackManager = requireAssignableTo<TypeOnly<old.UndoRedoStackManager>, TypeOnly<current.UndoRedoStackManager>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_UndoRedoStackManager": {"backCompat": false}
 */
declare type current_as_old_for_ClassDeclaration_UndoRedoStackManager = requireAssignableTo<TypeOnly<current.UndoRedoStackManager>, TypeOnly<old.UndoRedoStackManager>>
