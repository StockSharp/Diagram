// Minimal ambient types for the legacy `window.go` namespace published
// by the in-house ssdiagram compat shim (lib/ssdiagram.js). We
// hand-roll only what the Designer wrapper actually touches.
//
// `GraphObject.make` returns `any` on purpose — its return type depends on
// the first argument (a constructor or string template name) in ways we don't
// model statically. Callers cast at the use site when they need a typed result.

declare namespace go {
    class Point {
        x: number;
        y: number;
        constructor(x?: number, y?: number);
        static parse(str: string): Point;
        static stringify(p: Point): string;
    }

    class Size {
        width: number;
        height: number;
        constructor(w?: number, h?: number);
    }

    class Margin {
        constructor(t?: number, r?: number, b?: number, l?: number);
    }

    class Spot {
        constructor(x?: number, y?: number, ox?: number, oy?: number);
        static Center: Spot;
        static Left: Spot;
        static Right: Spot;
        static Top: Spot;
        static Bottom: Spot;
    }

    class Binding {
        constructor(target: string, source?: string, converter?: (value: any, target?: any) => any);
        makeTwoWay(serializer?: (v: any) => any): Binding;
    }

    namespace GraphObject {
        function make(type: any, ...args: any[]): any;
    }

    class GraphObject {
        part: Part | null;
        panel: Panel | null;
        data: unknown;
        background: string | null;
    }

    class Panel extends GraphObject {}

    class Placeholder extends GraphObject {}

    class TextBlock extends GraphObject {
        static WrapFit: any;
    }

    class Picture extends GraphObject {}

    class Shape extends GraphObject {
        figure: string;
        fill: string | null;
        stroke: string | null;
        strokeWidth: number;
    }

    class Group extends GraphObject {}

    class GridLayout {
        static Position: any;
    }

    class Part extends GraphObject {
        location: Point;
        isSelected: boolean;
        findObject(name: string): GraphObject | null;
    }

    class Node extends Part {}
    class Link extends Part {
        static AvoidsNodes: any;
        static JumpOver: any;
    }

    class Adornment extends Part {}

    class ChangedEvent {
        change: any;
        modelChange: string;
        oldValue: unknown;
        newValue: unknown;
        isTransactionFinished: boolean;
        static Insert: any;
        static Remove: any;
    }

    interface DiagramListener {
        subject: { each: (callback: (part: Part) => void) => void };
    }

    interface ToolManager {
        linkingTool: LinkingTool;
        relinkingTool: LinkingTool;
        hoverDelay: number;
    }

    interface LinkingTool {
        portGravity: number;
        isUnconnectedLinkValid: boolean;
        linkValidation:
            | ((fromNode: Node, fromPort: GraphObject, toNode: Node, toPort: GraphObject) => boolean)
            | null;
    }

    interface CommandHandler {
        canUndo(): boolean;
        canRedo(): boolean;
        canCutSelection(): boolean;
        canCopySelection(): boolean;
        canPasteSelection(): boolean;
        undo(): void;
        redo(): void;
        cutSelection(): void;
        copySelection(): void;
        pasteSelection(point?: Point): void;
        deleteSelection(): void;
        zoomToFit(): void;
    }

    interface ModelChangedListener {
        (evt: ChangedEvent): void;
    }

    class GraphLinksModel {
        nodeKeyProperty: string;
        nodeGroupKeyProperty: string;
        linkFromPortIdProperty: string;
        linkToPortIdProperty: string;
        nodeDataArray: any[];
        linkDataArray: any[];
        addNodeData(data: any): void;
        removeNodeData(data: any): void;
        addLinkData(data: any): void;
        removeLinkData(data: any): void;
        setDataProperty(data: any, name: string, value: any): void;
        insertArrayItem(arr: any[], index: number, value: any): void;
        removeArrayItem(arr: any[], index: number): void;
    }

    class Diagram {
        model: GraphLinksModel;
        readonly ss: {
            setTheme(theme: {
                background?: string;
                gridColor?: string;
                linkMaxLightness?: number;
                overviewBackground?: string;
                overviewBorderColor?: string;
                overviewViewportColor?: string;
                overviewViewportFill?: string;
            }): void;
            setOverviewVisible(visible: boolean): void;
            resize(width: number, height: number): void;
            requestRedraw(): void;
        };
        scale: number;
        isReadOnly: boolean;
        allowDrop: boolean;
        allowCopy: boolean;
        allowDelete: boolean;
        allowLink: boolean;
        allowMove: boolean;
        nodeTemplate: any;
        linkTemplate: any;
        contextMenu: any;
        commandHandler: CommandHandler;
        toolManager: ToolManager;
        selection: { each: (cb: (part: Part) => void) => void };
        nodes: { each: (cb: (node: Node) => void) => void };
        links: { each: (cb: (link: Link) => void) => void };
        lastInput: { documentPoint: Point };
        /// Host element passed at construction (`new go.Diagram(div, ...)`).
        readonly div: HTMLElement | null;
        startTransaction(name?: string): void;
        commitTransaction(name?: string): void;
        findNodeForKey(key: any): Node | null;
        addDiagramListener(name: string, cb: (evt: DiagramListener) => void): void;
        addModelChangedListener(cb: ModelChangedListener): void;
        updateAllTargetBindings(): void;
        remove(part: Part): void;
        /// Converts a viewport-relative point to a document point.
        transformViewToDoc(p: Point): Point;
    }

    class Palette extends Diagram {}

    class Overview {
        observed: Diagram;
        /// The Part that draws the viewport indicator. Contains a Shape named
        /// "BOX" whose stroke/fill defaults to magenta — we override it.
        box: { findObject(name: string): Shape | null };
    }
}

interface Window {
    go: typeof go;
}

declare const go: typeof go;
