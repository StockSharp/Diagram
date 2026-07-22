import { createDiagramViewState, type DiagramViewState } from './state.js';

export const DIAGRAM_VIEW_STATE_VERSION = 1 as const;

export interface DiagramViewStateDocument {
    version: typeof DIAGRAM_VIEW_STATE_VERSION;
    view: DiagramViewState;
}

export class DiagramViewStateError extends Error {
    constructor(message: string, readonly path: string = '$') {
        super(`${path}: ${message}`);
        this.name = 'DiagramViewStateError';
    }
}

export function createDiagramViewStateDocument(
    view: DiagramViewState = createDiagramViewState(),
): DiagramViewStateDocument {
    return {
        version: DIAGRAM_VIEW_STATE_VERSION,
        view: normalizeView(view),
    };
}

export function parseDiagramViewState(source: string | unknown): DiagramViewState {
    let value: unknown = source;
    if (typeof source === 'string') {
        try {
            value = JSON.parse(source) as unknown;
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'invalid JSON';
            throw new DiagramViewStateError(reason);
        }
    }

    const root = requireObject(value, '$');
    const version = requireFiniteNumber(root.version, '$.version');
    if (version !== DIAGRAM_VIEW_STATE_VERSION) {
        throw new DiagramViewStateError(`unsupported view-state version ${version}`, '$.version');
    }
    return normalizeView(requireObject(root.view, '$.view'));
}

export function serializeDiagramViewState(view: DiagramViewState, space?: number): string {
    return JSON.stringify(createDiagramViewStateDocument(view), null, space);
}

function normalizeView(value: unknown): DiagramViewState {
    const view = requireObject(value, '$.view');
    const zoom = requireFiniteNumber(view.zoom, '$.view.zoom');
    if (zoom <= 0) throw new DiagramViewStateError('expected a positive number', '$.view.zoom');
    return {
        zoom,
        panX: requireFiniteNumber(view.panX, '$.view.panX'),
        panY: requireFiniteNumber(view.panY, '$.view.panY'),
        overviewVisible: requireBoolean(view.overviewVisible, '$.view.overviewVisible'),
    };
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new DiagramViewStateError('expected an object', path);
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
        throw new DiagramViewStateError('expected a plain object', path);
    }
    return value as Record<string, unknown>;
}

function requireFiniteNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new DiagramViewStateError('expected a finite number', path);
    }
    return value;
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw new DiagramViewStateError('expected a boolean', path);
    return value;
}
