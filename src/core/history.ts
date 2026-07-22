export interface DiagramCommand {
    readonly label: string;
    execute(): void;
    undo(): void;
}

export interface DiagramHistoryState {
    canUndo: boolean;
    canRedo: boolean;
    undoDepth: number;
    redoDepth: number;
    undoLabel: string | null;
    redoLabel: string | null;
}

export type DiagramHistoryListener = (state: DiagramHistoryState) => void;

interface TransactionFrame {
    label: string;
    commands: DiagramCommand[];
}

export class DiagramCommandHistory {
    private readonly undoCommands: DiagramCommand[] = [];
    private readonly redoCommands: DiagramCommand[] = [];
    private readonly transactions: TransactionFrame[] = [];
    private replaying = false;

    constructor(private readonly listener?: DiagramHistoryListener) {}

    get state(): DiagramHistoryState {
        return {
            canUndo: this.undoCommands.length > 0,
            canRedo: this.redoCommands.length > 0,
            undoDepth: this.undoCommands.length,
            redoDepth: this.redoCommands.length,
            undoLabel: this.undoCommands[this.undoCommands.length - 1]?.label ?? null,
            redoLabel: this.redoCommands[this.redoCommands.length - 1]?.label ?? null,
        };
    }

    execute(command: DiagramCommand): void {
        if (this.replaying) {
            command.execute();
            return;
        }
        command.execute();
        this.recordApplied(command);
    }

    /** Records a gesture that already changed the document, such as pointer drag. */
    recordApplied(command: DiagramCommand): void {
        if (this.replaying) return;
        const transaction = this.transactions[this.transactions.length - 1];
        if (transaction !== undefined) {
            transaction.commands.push(command);
            return;
        }
        this.undoCommands.push(command);
        this.redoCommands.length = 0;
        this.notify();
    }

    transaction<T>(label: string, action: () => T): T {
        const frame: TransactionFrame = { label, commands: [] };
        this.transactions.push(frame);
        try {
            const result = action();
            this.transactions.pop();
            const command = compose(frame);
            if (command !== null) this.recordApplied(command);
            return result;
        } catch (error) {
            this.transactions.pop();
            this.replay(() => {
                for (const command of frame.commands.slice().reverse()) command.undo();
            });
            throw error;
        }
    }

    undo(): boolean {
        const command = this.undoCommands.pop();
        if (command === undefined) return false;
        try {
            this.replay(() => command.undo());
        } catch (error) {
            this.undoCommands.push(command);
            throw error;
        }
        this.redoCommands.push(command);
        this.notify();
        return true;
    }

    redo(): boolean {
        const command = this.redoCommands.pop();
        if (command === undefined) return false;
        try {
            this.replay(() => command.execute());
        } catch (error) {
            this.redoCommands.push(command);
            throw error;
        }
        this.undoCommands.push(command);
        this.notify();
        return true;
    }

    clear(): void {
        if (this.transactions.length > 0) {
            throw new Error('Cannot clear command history inside a transaction.');
        }
        this.undoCommands.length = 0;
        this.redoCommands.length = 0;
        this.notify();
    }

    private replay(action: () => void): void {
        const previous = this.replaying;
        this.replaying = true;
        try {
            action();
        } finally {
            this.replaying = previous;
        }
    }

    private notify(): void {
        this.listener?.(this.state);
    }
}

function compose(frame: TransactionFrame): DiagramCommand | null {
    if (frame.commands.length === 0) return null;
    if (frame.commands.length === 1) {
        const command = frame.commands[0];
        return frame.label === command.label ? command : {
            label: frame.label,
            execute: () => command.execute(),
            undo: () => command.undo(),
        };
    }
    const commands = [...frame.commands];
    return {
        label: frame.label,
        execute: () => {
            for (const command of commands) command.execute();
        },
        undo: () => {
            for (const command of commands.slice().reverse()) command.undo();
        },
    };
}
