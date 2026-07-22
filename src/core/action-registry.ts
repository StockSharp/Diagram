export interface DiagramAction<TId extends string, TContext> {
    readonly id: TId;
    canExecute(context: TContext): boolean;
    execute(context: TContext): void;
}

export interface DiagramActionState<TId extends string> {
    id: TId;
    enabled: boolean;
}

export class DiagramActionRegistry<TId extends string, TContext> {
    private readonly actions = new Map<TId, DiagramAction<TId, TContext>>();

    register(action: DiagramAction<TId, TContext>): () => void {
        if (this.actions.has(action.id)) {
            throw new Error(`Diagram action "${action.id}" is already registered.`);
        }
        this.actions.set(action.id, action);
        return () => {
            if (this.actions.get(action.id) === action) this.actions.delete(action.id);
        };
    }

    get(id: TId): DiagramAction<TId, TContext> | null {
        return this.actions.get(id) ?? null;
    }

    states(context: TContext): DiagramActionState<TId>[] {
        return [...this.actions.values()].map((action) => ({
            id: action.id,
            enabled: action.canExecute(context),
        }));
    }

    canExecute(id: TId, context: TContext): boolean {
        return this.actions.get(id)?.canExecute(context) ?? false;
    }

    execute(id: TId, context: TContext): boolean {
        const action = this.actions.get(id);
        if (action === undefined || !action.canExecute(context)) return false;
        action.execute(context);
        return true;
    }
}
