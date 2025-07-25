/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import {
	type IContainer,
	type IFluidModuleWithDetails,
	type IRuntimeFactory,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadContainerPaused,
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type {
	IConfigProviderBase,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/driver-definitions";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { applyStorageCompression } from "@fluidframework/driver-utils/internal";
import type {
	ContainerSchema,
	IFluidContainer,
	CompatibilityMode,
} from "@fluidframework/fluid-static";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	createServiceAudience,
} from "@fluidframework/fluid-static/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";

import { createAzureAudienceMember } from "./AzureAudience.js";
import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver.js";
import type {
	AzureClientProps,
	AzureClientPropsInternal,
	AzureConnectionConfig,
	AzureContainerServices,
	AzureContainerVersion,
	AzureGetVersionsOptions,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
} from "./interfaces.js";
import { isAzureRemoteConnectionConfig } from "./utils.js";

/**
 * Strongly typed id for connecting to a local Azure Fluid Relay.
 */
const LOCAL_MODE_TENANT_ID = "local";
const getTenantId = (connectionProperties: AzureConnectionConfig): string => {
	return isAzureRemoteConnectionConfig(connectionProperties)
		? connectionProperties.tenantId
		: LOCAL_MODE_TENANT_ID;
};

const MAX_VERSION_COUNT = 5;

/**
 * Default feature gates.
 * These values will only be used if the feature gate is not already set by the supplied config provider.
 */
const azureClientFeatureGates = {
	// Azure client requires a write connection by default
	"Fluid.Container.ForceWriteConnection": true,
};

/**
 * Wrap the config provider to fall back on the appropriate defaults for Azure Client.
 * @param baseConfigProvider - The base config provider to wrap
 * @returns A new config provider with the appropriate defaults applied underneath the given provider
 */
function wrapConfigProvider(baseConfigProvider?: IConfigProviderBase): IConfigProviderBase {
	return wrapConfigProviderWithDefaults(baseConfigProvider, azureClientFeatureGates);
}

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Fluid Relay or,
 * when running with local tenantId, have it be backed by a local Azure Fluid Relay instance.
 * @public
 */
export class AzureClient {
	private readonly documentServiceFactory: IDocumentServiceFactory;
	private readonly urlResolver: IUrlResolver;
	private readonly configProvider: IConfigProviderBase | undefined;
	private readonly connectionConfig: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;
	private readonly logger: ITelemetryBaseLogger | undefined;

	private readonly createContainerRuntimeFactory?: ({
		schema,
		compatibilityMode,
	}: {
		schema: ContainerSchema;
		compatibilityMode: CompatibilityMode;
	}) => IRuntimeFactory;

	/**
	 * Creates a new client instance using configuration parameters.
	 * @param properties - Properties for initializing a new AzureClient instance
	 */
	public constructor(properties: AzureClientProps) {
		this.connectionConfig = properties.connection;
		this.logger = properties.logger;
		// remove trailing slash from URL if any
		this.connectionConfig.endpoint = this.connectionConfig.endpoint.replace(/\/$/, "");
		this.urlResolver = new AzureUrlResolver();
		// The local service implementation differs from the Azure Fluid Relay in blob
		// storage format. Azure Fluid Relay supports whole summary upload. Local currently does not.
		const isRemoteConnection = isAzureRemoteConnectionConfig(this.connectionConfig);
		const origDocumentServiceFactory: IDocumentServiceFactory =
			new RouterliciousDocumentServiceFactory(this.connectionConfig.tokenProvider, {
				enableWholeSummaryUpload: isRemoteConnection,
				enableDiscovery: isRemoteConnection,
			});

		this.documentServiceFactory = applyStorageCompression(
			origDocumentServiceFactory,
			properties.summaryCompression,
		);
		this.configProvider = wrapConfigProvider(properties.configProvider);

		this.createContainerRuntimeFactory = (
			properties as Partial<AzureClientPropsInternal>
		).createContainerRuntimeFactory;
	}

	/**
	 * Creates a new detached container instance in the Azure Fluid Relay.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param containerSchema - Container schema for the new container.
	 * @param compatibilityMode - Compatibility mode the container should run in.
	 * @returns New detached container instance along with associated services.
	 */
	public async createContainer<const TContainerSchema extends ContainerSchema>(
		containerSchema: TContainerSchema,
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: AzureContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(containerSchema, compatibilityMode);

		const container = await createDetachedContainer({
			...loaderProps,
			codeDetails: {
				package: "no-dynamic-package",
				config: {},
			},
		});

		const fluidContainer = await this.createFluidContainer<TContainerSchema>(
			container,
			this.connectionConfig,
		);
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Accesses the existing container given its unique ID in the Azure Fluid Relay.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param id - Unique ID of the container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param compatibilityMode - Compatibility mode the container should run in.
	 * @returns Existing container instance along with associated services.
	 */
	public async getContainer<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: AzureContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(containerSchema, compatibilityMode);
		const url = new URL(this.connectionConfig.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.connectionConfig.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.connectionConfig)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));

		const container = await loadExistingContainer({
			...loaderProps,
			request: { url: url.href },
		});
		const fluidContainer = await createFluidContainer<TContainerSchema>({
			container,
		});
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Load a specific version of a container for viewing only.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param version - Unique version of the source container in Azure Fluid Relay.
	 * @param compatibilityMode - Compatibility mode the container should run in.
	 * @returns Loaded container instance at the specified version.
	 */
	public async viewContainerVersion<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		version: AzureContainerVersion,
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
	}> {
		const loaderProps = this.getLoaderProps(containerSchema, compatibilityMode);
		const url = new URL(this.connectionConfig.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.connectionConfig.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.connectionConfig)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));
		const container = await loadContainerPaused(loaderProps, {
			url: url.href,
			headers: { [LoaderHeader.version]: version.id },
		});
		const fluidContainer = await createFluidContainer<TContainerSchema>({
			container,
		});
		return { container: fluidContainer };
	}

	/**
	 * Get the list of versions for specific container.
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param options - "Get" options. If options are not provided, API
	 * will assume maxCount of versions to retrieve to be 5.
	 * @returns Array of available container versions.
	 */
	public async getContainerVersions(
		id: string,
		options?: AzureGetVersionsOptions,
	): Promise<AzureContainerVersion[]> {
		const url = new URL(this.connectionConfig.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.connectionConfig.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.connectionConfig)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));

		const resolvedUrl = await this.urlResolver.resolve({ url: url.href });
		if (!resolvedUrl) {
			throw new Error("Unable to resolved URL");
		}
		const documentService =
			await this.documentServiceFactory.createDocumentService(resolvedUrl);
		const storage = await documentService.connectToStorage();

		// External API uses null
		// eslint-disable-next-line unicorn/no-null
		const versions = await storage.getVersions(null, options?.maxCount ?? MAX_VERSION_COUNT);

		return versions.map((item) => {
			return { id: item.id, date: item.date };
		});
	}

	private getContainerServices(container: IContainer): AzureContainerServices {
		return {
			audience: createServiceAudience({
				container,
				createServiceMember: createAzureAudienceMember,
			}),
		};
	}

	private getLoaderProps(
		schema: ContainerSchema,
		compatibilityMode: CompatibilityMode,
	): ILoaderProps {
		const runtimeFactory = this.createContainerRuntimeFactory
			? this.createContainerRuntimeFactory({
					schema,
					compatibilityMode,
				})
			: createDOProviderContainerRuntimeFactory({
					schema,
					compatibilityMode,
				});

		const load = async (): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport: runtimeFactory },
				details: { package: "no-dynamic-package", config: {} },
			};
		};

		const codeLoader = { load };
		const client: IClient = {
			details: {
				capabilities: { interactive: true },
			},
			permission: [],
			scopes: [],
			user: { id: "" },
			mode: "write",
		};

		return {
			urlResolver: this.urlResolver,
			documentServiceFactory: this.documentServiceFactory,
			codeLoader,
			logger: this.logger,
			options: { client },
			configProvider: this.configProvider,
		};
	}

	private async createFluidContainer<TContainerSchema extends ContainerSchema>(
		container: IContainer,
		connection: AzureConnectionConfig,
	): Promise<IFluidContainer<TContainerSchema>> {
		const createNewRequest = createAzureCreateNewRequest(
			connection.endpoint,
			getTenantId(connection),
		);

		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (): Promise<string> => {
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state");
			}
			await container.attach(createNewRequest);
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			return container.resolvedUrl.id;
		};
		const fluidContainer = await createFluidContainer<TContainerSchema>({
			container,
		});
		fluidContainer.attach = attach;
		return fluidContainer;
	}
	// #endregion
}
