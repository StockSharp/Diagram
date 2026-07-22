export type DiagramPortDirection = 'in' | 'out';
export type DiagramNodeErrorKind = 'runtime' | 'load';
export type DiagramGlobalErrorKind = 'invalid' | 'load' | 'locked' | 'encrypted';

export interface DiagramErrorState<TKind extends string> {
    kind: TKind;
    message: string;
    /** Incrementing this value requests a fresh renderer animation. */
    pulse: number;
}

export interface DiagramPortRuntimeState {
    active: boolean;
    selected: boolean;
    breakpoint: boolean;
    breakpointActive: boolean;
    value: string | null;
    error: string | null;
}

export interface DiagramNodePortRuntimeState {
    in: Record<string, DiagramPortRuntimeState>;
    out: Record<string, DiagramPortRuntimeState>;
}

export interface DiagramNodeRuntimeState {
    active: boolean;
    error: DiagramErrorState<DiagramNodeErrorKind> | null;
    ports: DiagramNodePortRuntimeState;
}

export interface DiagramRuntimeState {
    activeNodeId: string | null;
    nodes: Record<string, DiagramNodeRuntimeState>;
    globalError: DiagramErrorState<DiagramGlobalErrorKind> | null;
}

export interface DiagramViewState {
    zoom: number;
    panX: number;
    panY: number;
    overviewVisible: boolean;
}

export interface DiagramSelectedPort {
    nodeId: string;
    portId: string;
    direction: DiagramPortDirection;
}

export interface DiagramSelection {
    nodeIds: string[];
    linkIds: string[];
    port: DiagramSelectedPort | null;
    primaryNodeId: string | null;
    primaryLinkId: string | null;
}

export function createDiagramRuntimeState(): DiagramRuntimeState {
    return { activeNodeId: null, nodes: {}, globalError: null };
}

export function createDiagramViewState(): DiagramViewState {
    return { zoom: 1, panX: 0, panY: 0, overviewVisible: true };
}

export function createDiagramSelection(): DiagramSelection {
    return {
        nodeIds: [],
        linkIds: [],
        port: null,
        primaryNodeId: null,
        primaryLinkId: null,
    };
}

export function createDiagramPortRuntimeState(): DiagramPortRuntimeState {
    return {
        active: false,
        selected: false,
        breakpoint: false,
        breakpointActive: false,
        value: null,
        error: null,
    };
}

export function createDiagramNodeRuntimeState(): DiagramNodeRuntimeState {
    return {
        active: false,
        error: null,
        ports: { in: {}, out: {} },
    };
}
