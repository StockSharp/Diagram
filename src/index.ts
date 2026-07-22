export {
    DiagramDocumentError,
    cloneDiagramDocument,
    createDiagramDocument,
    parseDiagramDocument,
    serializeDiagramDocument,
} from './core/document.js';

export { DiagramActionRegistry } from './core/action-registry.js';
export type {
    DiagramAction,
    DiagramActionState,
} from './core/action-registry.js';

export { DiagramCommandHistory } from './core/history.js';
export type {
    DiagramCommand,
    DiagramHistoryListener,
    DiagramHistoryState,
} from './core/history.js';

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
    createEditableDiagramPermissions,
    createDiagramNodeRuntimeState,
    createDiagramPortRuntimeState,
    createDiagramRuntimeState,
    cloneDiagramRuntimeState,
    createDiagramSelection,
    createDiagramViewState,
    createReadOnlyDiagramPermissions,
} from './core/state.js';

export {
    DIAGRAM_VIEW_STATE_VERSION,
    DiagramViewStateError,
    createDiagramViewStateDocument,
    parseDiagramViewState,
    serializeDiagramViewState,
} from './core/view-state.js';

export type { DiagramViewStateDocument } from './core/view-state.js';

export type {
    DiagramErrorState,
    DiagramGlobalErrorKind,
    DiagramInteractionPermissions,
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
    ContextCommandState,
    ContextMenuRequestedPayload,
    DiagramEvents,
    DiagramClipboard,
    DiagramGridSettings,
    DiagramLoadOptions,
    DiagramOptions,
    DiagramScreenshotOptions,
    DiagramScreenshotScope,
    DiagramThemeOptions,
    DocumentLoadFailedPayload,
    LinkChangePayload,
    LinkHoverPayload,
    LinkRelinkedPayload,
    LinkSelectedPayload,
    LinkValidationPayload,
    LinkValidationReason,
    LinkValidationResult,
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
    PortClickAction,
    PortClickedPayload,
    PortSelectedPayload,
} from './diagram/api.js';

export { StockSharpCatalog } from './diagram/catalog.js';
export type { CatalogEvents } from './diagram/catalog.js';

export {
    PALETTE_DRAG_MIME,
    StockSharpPalette,
} from './diagram/palette.js';
export type {
    PaletteContextMenuPayload,
    PaletteEvents,
    PaletteNodePayload,
    PaletteOptions,
    PaletteSelectionChangedPayload,
} from './diagram/palette.js';

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
    destroyRenderedDiagram,
    renderAll,
    renderFromInline,
    renderFromSource,
    renderScheme,
} from './embed.js';

export type {
    DiagramEmbedHandle,
    DiagramEmbedScheme,
    DiagramEmbedSchemeLink,
    DiagramEmbedSchemeNode,
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
    DiagramScreenshotOptions as CanvasDiagramScreenshotOptions,
    DiagramScreenshotScope as CanvasDiagramScreenshotScope,
    LinkInit as CanvasLinkInit,
    LinkValidator as CanvasLinkValidator,
    LinkValidatorArgs as CanvasLinkValidatorArgs,
    NodeErrorKind as CanvasNodeErrorKind,
    NodeErrorOptions as CanvasNodeErrorOptions,
    PortDirection as CanvasPortDirection,
    PortInit as CanvasPortInit,
} from './ssgraph.js';
