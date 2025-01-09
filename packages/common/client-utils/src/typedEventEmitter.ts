/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IEvent,
	IEventProvider,
	IEventTransformer,
	TransformedEvent,
} from "@fluidframework/core-interfaces";

import { EventEmitter } from "./eventEmitter.cjs";

/**
 * The event emitter polyfill and the node event emitter have different event types:
 * string | symbol vs. string | number
 *
 * The polyfill is now always used, but string is the only event type preferred.
 * @legacy
 * @alpha
 */
export type EventEmitterEventType = string;

/**
 * @legacy
 * @alpha
 */
export type TypedEventTransform<TThis, TEvent> =
	// Event emitter supports some special events for the emitter itself to use
	// this exposes those events for the TypedEventEmitter.
	// Since we know what the shape of these events are, we can describe them directly via a TransformedEvent
	// which easier than trying to extend TEvent directly
	TransformedEvent<
		TThis,
		"newListener" | "removeListener",
		Parameters<(event: string, listener: (...args: any[]) => void) => void>
	> &
		// Expose all the events provides by TEvent
		IEventTransformer<TThis, TEvent & IEvent> &
		// Add the default overload so this is covertable to EventEmitter regardless of environment
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		TransformedEvent<TThis, EventEmitterEventType, any[]>;

/**
 * Event Emitter helper class the supports emitting typed events.
 * @privateRemarks
 * This should become internal once the classes extending it become internal.
 *
 * @deprecated Consider switching to the new eventing library which is in `CustomEventEmitter`.
 * The goal is the remove `TypedEventEmitter` in Fluid Framework release 3.0 and switch to the new eventing library instead.
 *
 * @legacy
 * @alpha
 */
export class TypedEventEmitter<TEvent>
	extends EventEmitter
	implements IEventProvider<TEvent & IEvent>
{
	public constructor() {
		super();
		this.addListener = super.addListener.bind(this) as TypedEventTransform<this, TEvent>;
		this.on = super.on.bind(this) as TypedEventTransform<this, TEvent>;
		this.once = super.once.bind(this) as TypedEventTransform<this, TEvent>;
		this.prependListener = super.prependListener.bind(this) as TypedEventTransform<
			this,
			TEvent
		>;
		this.prependOnceListener = super.prependOnceListener.bind(this) as TypedEventTransform<
			this,
			TEvent
		>;
		this.removeListener = super.removeListener.bind(this) as TypedEventTransform<this, TEvent>;
		this.off = super.off.bind(this) as TypedEventTransform<this, TEvent>;

		this.eventNames = super.eventNames.bind(this);
		this.setMaxListeners = super.setMaxListeners.bind(this);
		this.getMaxListeners = super.getMaxListeners.bind(this);
		this.emit = super.emit.bind(this);
		this.removeAllListeners = super.removeAllListeners.bind(this);
		this.listeners = super.listeners.bind(this);
		this.listenerCount = super.listenerCount.bind(this);
		this.rawListeners = super.rawListeners.bind(this);
	}
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly addListener: TypedEventTransform<this, TEvent>;
	public readonly on: TypedEventTransform<this, TEvent>;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly once: TypedEventTransform<this, TEvent>;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly prependListener: TypedEventTransform<this, TEvent>;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly prependOnceListener: TypedEventTransform<this, TEvent>;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly removeListener: TypedEventTransform<this, TEvent>;
	public readonly off: TypedEventTransform<this, TEvent>;

	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly eventNames: () => (string | number)[];
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly setMaxListeners: (type: number) => this;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly getMaxListeners: () => number;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly emit: (type: string | number, ...args: any[]) => boolean;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly removeAllListeners: (type?: string | number) => this;
	// public readonly listeners: (type: string | number) => void;
	/**
	 * @deprecated Use on and off from the new eventing library instead
	 */
	public readonly listenerCount: (type: string | number) => number;
	// public readonly rawListeners: void;
}
