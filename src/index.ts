export {
    DiagramDocumentError,
    cloneDiagramDocument,
    createDiagramDocument,
    parseDiagramDocument,
    serializeDiagramDocument,
} from './core/document.js';

export { DIAGRAM_DOCUMENT_VERSION } from './core/model.js';

export type {
    DiagramDocument,
    DiagramDocumentEndpoint,
    DiagramDocumentInput,
    DiagramDocumentLink,
    DiagramDocumentLinkInput,
    DiagramDocumentNode,
    DiagramDocumentNodeInput,
    DiagramDocumentPort,
    DiagramDocumentPortInput,
    DiagramDocumentVersion,
    DiagramParameterSchema,
    JsonObject,
    JsonPrimitive,
    JsonValue,
} from './core/model.js';

export {
    createDiagramNodeRuntimeState,
    createDiagramPortRuntimeState,
    createDiagramRuntimeState,
    createDiagramSelection,
    createDiagramViewState,
} from './core/state.js';

export type {
    DiagramErrorState,
    DiagramGlobalErrorKind,
    DiagramNodeErrorKind,
    DiagramNodePortRuntimeState,
    DiagramNodeRuntimeState,
    DiagramPortDirection,
    DiagramPortRuntimeState,
    DiagramRuntimeState,
    DiagramSelectedPort,
    DiagramSelection,
    DiagramViewState,
} from './core/state.js';

export {
    StockSharpDiagram,
} from './diagram/stocksharp-diagram.js';

export type {
    ContextCommand,
    ContextCommandPayload,
    DiagramEvents,
    DiagramLoadOptions,
    DiagramOptions,
    DiagramThemeOptions,
    LinkChangePayload,
    LinkHoverPayload,
    LinkSelectedPayload,
    LinkValidationPayload,
    LinkValidator,
    LinkValidatorArgs,
    LoadFinishedPayload,
    NodeChangePayload,
    NodeErrorKind,
    NodeErrorOptions,
    NodeHoverPayload,
    NodeMovedPayload,
    NodeSelectedPayload,
    PortHoverPayload,
    PortSelectedPayload,
} from './diagram/api.js';

export { StockSharpCatalog } from './diagram/catalog.js';
export type { CatalogEvents } from './diagram/catalog.js';

export {
    PALETTE_DRAG_MIME,
    StockSharpPalette,
} from './diagram/palette.js';
export type { PaletteOptions } from './diagram/palette.js';

export {
    DiagramNode,
    Link,
    Node,
    Port,
    PortType,
} from './diagram/types.js';

export type {
    DiagramNodeInit,
    LinkEndpoint,
    LinkInit,
    NodeData,
    NodeInit,
    PaletteGroupData,
    PaletteNodeData,
    ParamSchema,
    PortData,
    PortDirection,
    PortInit,
    PortTypeInit,
} from './diagram/types.js';

export {
    renderAll,
    renderFromInline,
    renderFromSource,
    renderScheme,
} from './embed.js';

// Low-level canvas engine. New application code normally uses
// StockSharpDiagram; direct renderer consumers can use this alias
// or the dedicated "ssdiagram/ssgraph" entry point.
export {
    Diagram as CanvasDiagram,
    LinkModel,
    NodeModel,
    PortModel,
    version,
} from './ssgraph.js';

export type {
    DiagramNodeInit as CanvasDiagramNodeInit,
    DiagramOptions as CanvasDiagramOptions,
    LinkInit as CanvasLinkInit,
    LinkValidator as CanvasLinkValidator,
    LinkValidatorArgs as CanvasLinkValidatorArgs,
    NodeErrorKind as CanvasNodeErrorKind,
    NodeErrorOptions as CanvasNodeErrorOptions,
    PortDirection as CanvasPortDirection,
    PortInit as CanvasPortInit,
} from './ssgraph.js';
