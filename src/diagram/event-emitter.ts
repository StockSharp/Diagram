export type EventHandler<T> = (payload: T) => void;

export class EventEmitter<TEvents extends Record<string, unknown>> {
    private readonly handlers = new Map<keyof TEvents, Set<EventHandler<unknown>>>();

    on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void {
        let set = this.handlers.get(event);
        if (set === undefined) {
            set = new Set();
            this.handlers.set(event, set);
        }
        set.add(handler as EventHandler<unknown>);
        return () => this.off(event, handler);
    }

    off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
        const set = this.handlers.get(event);
        if (set === undefined) {
            return;
        }
        set.delete(handler as EventHandler<unknown>);
        if (set.size === 0) {
            this.handlers.delete(event);
        }
    }

    protected emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
        const set = this.handlers.get(event);
        if (set === undefined) {
            return;
        }
        for (const handler of set) {
            try {
                (handler as EventHandler<TEvents[K]>)(payload);
            } catch (err) {
                console.error(err);
            }
        }
    }
}
