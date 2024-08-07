/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by flub generate:typetests in @fluid-tools/build-cli.
 */

import type * as old from "@fluidframework/azure-client-previous/internal";
import type { TypeOnly, MinimalType, FullType, requireAssignableTo } from "@fluidframework/build-tools";

import type * as current from "../../index.js";

declare type MakeUnusedImportErrorsGoAway<T> = TypeOnly<T> | MinimalType<T> | FullType<T> | typeof old | typeof current | requireAssignableTo<true, true>;

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_AzureClient": {"forwardCompat": false}
 */
declare type old_as_current_for_ClassDeclaration_AzureClient = requireAssignableTo<TypeOnly<old.AzureClient>, TypeOnly<current.AzureClient>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassDeclaration_AzureClient": {"backCompat": false}
 */
declare type current_as_old_for_ClassDeclaration_AzureClient = requireAssignableTo<TypeOnly<current.AzureClient>, TypeOnly<old.AzureClient>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureClientProps": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureClientProps = requireAssignableTo<TypeOnly<old.AzureClientProps>, TypeOnly<current.AzureClientProps>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureClientProps": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureClientProps = requireAssignableTo<TypeOnly<current.AzureClientProps>, TypeOnly<old.AzureClientProps>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureConnectionConfig": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureConnectionConfig = requireAssignableTo<TypeOnly<old.AzureConnectionConfig>, TypeOnly<current.AzureConnectionConfig>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureConnectionConfig": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureConnectionConfig = requireAssignableTo<TypeOnly<current.AzureConnectionConfig>, TypeOnly<old.AzureConnectionConfig>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "TypeAliasDeclaration_AzureConnectionConfigType": {"forwardCompat": false}
 */
declare type old_as_current_for_TypeAliasDeclaration_AzureConnectionConfigType = requireAssignableTo<TypeOnly<old.AzureConnectionConfigType>, TypeOnly<current.AzureConnectionConfigType>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "TypeAliasDeclaration_AzureConnectionConfigType": {"backCompat": false}
 */
declare type current_as_old_for_TypeAliasDeclaration_AzureConnectionConfigType = requireAssignableTo<TypeOnly<current.AzureConnectionConfigType>, TypeOnly<old.AzureConnectionConfigType>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureContainerServices": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureContainerServices = requireAssignableTo<TypeOnly<old.AzureContainerServices>, TypeOnly<current.AzureContainerServices>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureContainerServices": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureContainerServices = requireAssignableTo<TypeOnly<current.AzureContainerServices>, TypeOnly<old.AzureContainerServices>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureContainerVersion": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureContainerVersion = requireAssignableTo<TypeOnly<old.AzureContainerVersion>, TypeOnly<current.AzureContainerVersion>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureContainerVersion": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureContainerVersion = requireAssignableTo<TypeOnly<current.AzureContainerVersion>, TypeOnly<old.AzureContainerVersion>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "RemovedClassDeclaration_AzureFunctionTokenProvider": {"forwardCompat": false}
 */

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "RemovedClassDeclaration_AzureFunctionTokenProvider": {"backCompat": false}
 */

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureGetVersionsOptions": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureGetVersionsOptions = requireAssignableTo<TypeOnly<old.AzureGetVersionsOptions>, TypeOnly<current.AzureGetVersionsOptions>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureGetVersionsOptions": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureGetVersionsOptions = requireAssignableTo<TypeOnly<current.AzureGetVersionsOptions>, TypeOnly<old.AzureGetVersionsOptions>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureLocalConnectionConfig": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureLocalConnectionConfig = requireAssignableTo<TypeOnly<old.AzureLocalConnectionConfig>, TypeOnly<current.AzureLocalConnectionConfig>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureLocalConnectionConfig": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureLocalConnectionConfig = requireAssignableTo<TypeOnly<current.AzureLocalConnectionConfig>, TypeOnly<old.AzureLocalConnectionConfig>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureMember": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureMember = requireAssignableTo<TypeOnly<old.AzureMember>, TypeOnly<current.AzureMember>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureMember": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureMember = requireAssignableTo<TypeOnly<current.AzureMember>, TypeOnly<old.AzureMember>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureRemoteConnectionConfig": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureRemoteConnectionConfig = requireAssignableTo<TypeOnly<old.AzureRemoteConnectionConfig>, TypeOnly<current.AzureRemoteConnectionConfig>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureRemoteConnectionConfig": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureRemoteConnectionConfig = requireAssignableTo<TypeOnly<current.AzureRemoteConnectionConfig>, TypeOnly<old.AzureRemoteConnectionConfig>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureUser": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_AzureUser = requireAssignableTo<TypeOnly<old.AzureUser>, TypeOnly<current.AzureUser>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_AzureUser": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_AzureUser = requireAssignableTo<TypeOnly<current.AzureUser>, TypeOnly<old.AzureUser>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "TypeAliasDeclaration_CompatibilityMode": {"forwardCompat": false}
 */
declare type old_as_current_for_TypeAliasDeclaration_CompatibilityMode = requireAssignableTo<TypeOnly<old.CompatibilityMode>, TypeOnly<current.CompatibilityMode>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "TypeAliasDeclaration_CompatibilityMode": {"backCompat": false}
 */
declare type current_as_old_for_TypeAliasDeclaration_CompatibilityMode = requireAssignableTo<TypeOnly<current.CompatibilityMode>, TypeOnly<old.CompatibilityMode>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "TypeAliasDeclaration_IAzureAudience": {"forwardCompat": false}
 */
declare type old_as_current_for_TypeAliasDeclaration_IAzureAudience = requireAssignableTo<TypeOnly<old.IAzureAudience>, TypeOnly<current.IAzureAudience>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "TypeAliasDeclaration_IAzureAudience": {"backCompat": false}
 */
declare type current_as_old_for_TypeAliasDeclaration_IAzureAudience = requireAssignableTo<TypeOnly<current.IAzureAudience>, TypeOnly<old.IAzureAudience>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITelemetryBaseEvent": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_ITelemetryBaseEvent = requireAssignableTo<TypeOnly<old.ITelemetryBaseEvent>, TypeOnly<current.ITelemetryBaseEvent>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITelemetryBaseEvent": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_ITelemetryBaseEvent = requireAssignableTo<TypeOnly<current.ITelemetryBaseEvent>, TypeOnly<old.ITelemetryBaseEvent>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITelemetryBaseLogger": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_ITelemetryBaseLogger = requireAssignableTo<TypeOnly<old.ITelemetryBaseLogger>, TypeOnly<current.ITelemetryBaseLogger>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITelemetryBaseLogger": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_ITelemetryBaseLogger = requireAssignableTo<TypeOnly<current.ITelemetryBaseLogger>, TypeOnly<old.ITelemetryBaseLogger>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITokenClaims": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_ITokenClaims = requireAssignableTo<TypeOnly<old.ITokenClaims>, TypeOnly<current.ITokenClaims>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITokenClaims": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_ITokenClaims = requireAssignableTo<TypeOnly<current.ITokenClaims>, TypeOnly<old.ITokenClaims>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITokenProvider": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_ITokenProvider = requireAssignableTo<TypeOnly<old.ITokenProvider>, TypeOnly<current.ITokenProvider>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITokenProvider": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_ITokenProvider = requireAssignableTo<TypeOnly<current.ITokenProvider>, TypeOnly<old.ITokenProvider>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITokenResponse": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_ITokenResponse = requireAssignableTo<TypeOnly<old.ITokenResponse>, TypeOnly<current.ITokenResponse>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_ITokenResponse": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_ITokenResponse = requireAssignableTo<TypeOnly<current.ITokenResponse>, TypeOnly<old.ITokenResponse>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_IUser": {"forwardCompat": false}
 */
declare type old_as_current_for_InterfaceDeclaration_IUser = requireAssignableTo<TypeOnly<old.IUser>, TypeOnly<current.IUser>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "InterfaceDeclaration_IUser": {"backCompat": false}
 */
declare type current_as_old_for_InterfaceDeclaration_IUser = requireAssignableTo<TypeOnly<current.IUser>, TypeOnly<old.IUser>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "EnumDeclaration_ScopeType": {"forwardCompat": false}
 */
declare type old_as_current_for_EnumDeclaration_ScopeType = requireAssignableTo<TypeOnly<old.ScopeType>, TypeOnly<current.ScopeType>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "EnumDeclaration_ScopeType": {"backCompat": false}
 */
declare type current_as_old_for_EnumDeclaration_ScopeType = requireAssignableTo<TypeOnly<current.ScopeType>, TypeOnly<old.ScopeType>>
