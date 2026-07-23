import {
    DiagramNode,
    Link,
    Node,
    PALETTE_DRAG_MIME,
    PortType,
    StockSharpCatalog,
    StockSharpDiagram,
    StockSharpPalette,
} from '../src/index';

const root = document.documentElement;
const diagramHost = document.querySelector<HTMLElement>('#diagram');
const canvasPanel = document.querySelector<HTMLElement>('.canvas-panel');
const paletteHost = document.querySelector<HTMLElement>('#palette');
const search = document.querySelector<HTMLInputElement>('#paletteSearch');
const status = document.querySelector<HTMLElement>('#status');
const modelStats = document.querySelector<HTMLElement>('#modelStats');
const indicatorDialog = document.querySelector<HTMLDialogElement>('#indicatorDialog');
const indicatorForm = document.querySelector<HTMLFormElement>('#indicatorForm');
const indicatorTitle = document.querySelector<HTMLElement>('#indicatorTitle');
const indicatorPeriod = document.querySelector<HTMLInputElement>('#indicatorPeriod');
const indicatorInputType = document.querySelector<HTMLSelectElement>('#indicatorInputType');
const indicatorInputMulti = document.querySelector<HTMLInputElement>('#indicatorInputMulti');
const indicatorOutputMulti = document.querySelector<HTMLInputElement>('#indicatorOutputMulti');
const themeButton = document.querySelector<HTMLButtonElement>('#themeBtn');

if (diagramHost === null || canvasPanel === null || paletteHost === null || search === null
    || status === null || modelStats === null || themeButton === null
    || indicatorDialog === null || indicatorForm === null || indicatorTitle === null || indicatorPeriod === null
    || indicatorInputType === null || indicatorInputMulti === null || indicatorOutputMulti === null)
    throw new Error('Diagram demo markup is incomplete.');

const svgIcon = (label: string, color: string): string => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${color}"/><text x="12" y="16" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="11" font-weight="700" fill="#0b0e11">${label}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const catalog = new StockSharpCatalog();
[
    new PortType({ name: 'Candle', color: 'hsl(202, 72%, 58%)' }),
    new PortType({ name: 'Decimal', color: 'hsl(267, 68%, 66%)' }),
    new PortType({ name: 'Boolean', color: 'hsl(42, 82%, 57%)' }),
    new PortType({ name: 'Order', color: 'hsl(350, 69%, 62%)' }),
    new PortType({ name: 'Trade', color: 'hsl(153, 67%, 49%)' }),
    new PortType({ name: 'Object', color: 'hsl(215, 16%, 62%)' }),
].forEach((type) => catalog.addPortType(type));

[
    new Node({
        id: 'market-data',
        name: 'Market Data',
        description: 'Streams candles for the selected instrument.',
        groupName: 'Sources',
        icon: svgIcon('MD', '#4aa3ff'),
        outPorts: [{ id: 'candles', name: 'Candles', type: 'Candle' }],
    }),
    new Node({
        id: 'sma',
        name: 'Simple Moving Average',
        description: 'Calculates a moving average over candle closes.',
        groupName: 'Indicators',
        icon: svgIcon('MA', '#a779e9'),
        openAction: 'indicatorSettings',
        parameters: [{
            name: 'Period', displayName: 'Period', description: 'Moving-average length.',
            type: 'number', defaultValue: '20', options: [], min: 1, max: 1000,
            displayOrder: 1, category: 'General', isBasic: true, editorType: '',
        }],
        inPorts: [{ id: 'source', name: 'Source', type: 'Candle', maxLinks: 1 }],
        outPorts: [{ id: 'value', name: 'Value', type: 'Decimal' }],
    }),
    new Node({
        id: 'crossing',
        name: 'Crossing',
        description: 'Emits true when the fast value crosses the slow value.',
        groupName: 'Logic',
        icon: svgIcon('X', '#f0b90b'),
        inPorts: [
            { id: 'fast', name: 'Fast', type: 'Decimal', maxLinks: 1 },
            { id: 'slow', name: 'Slow', type: 'Decimal', maxLinks: 1 },
        ],
        outPorts: [{ id: 'signal', name: 'Signal', type: 'Boolean' }],
    }),
    new Node({
        id: 'order-builder',
        name: 'Order Builder',
        description: 'Creates a market order from a Boolean signal.',
        groupName: 'Trading',
        icon: svgIcon('OR', '#f6465d'),
        inPorts: [{ id: 'signal', name: 'Signal', type: 'Boolean', maxLinks: 1 }],
        outPorts: [{ id: 'order', name: 'Order', type: 'Order' }],
    }),
    new Node({
        id: 'connector',
        name: 'Broker Connector',
        description: 'Submits orders and publishes own trades.',
        groupName: 'Execution',
        icon: svgIcon('BR', '#0ecb81'),
        inPorts: [{ id: 'order', name: 'Order', type: 'Order' }],
        outPorts: [{ id: 'trade', name: 'Trade', type: 'Trade' }],
    }),
    new Node({
        id: 'chart',
        name: 'Chart',
        description: 'Visualizes candles and executions.',
        groupName: 'Visualization',
        icon: svgIcon('CH', '#45c2d6'),
        inPorts: [
            { id: 'candles', name: 'Candles', type: 'Candle' },
            { id: 'trades', name: 'Trades', type: 'Trade' },
            { id: 'object', name: 'Any object', type: 'Object' },
        ],
    }),
].forEach((node) => catalog.addNodeType(node));

const palette = new StockSharpPalette({ div: paletteHost, catalog });
const diagram = new StockSharpDiagram({
    div: diagramHost,
    catalog,
    showFullscreenButton: true,
});
(window as Window & { stockSharpDiagramDemo?: StockSharpDiagram }).stockSharpDiagramDemo = diagram;

palette.on('nodeActivated', ({ node: activated }) => {
    const rect = diagramHost.getBoundingClientRect();
    diagram.dropNodeFromPalette(activated.id, rect.left + rect.width / 2, rect.top + rect.height / 2);
    setStatus(`Added from palette: ${activated.name}`);
});
palette.on('contextMenuRequested', ({ node: requested }) => {
    setStatus(requested.description.length > 0 ? requested.description : requested.name);
});

function node(typeId: string, id: string, name: string, x: number, y: number): DiagramNode {
    const type = catalog.getNodeType(typeId);
    if (type === null) throw new Error(`Unknown node type: ${typeId}`);
    return new DiagramNode({
        id,
        typeId,
        name,
        description: type.description,
        groupName: type.groupName,
        icon: type.icon,
        openAction: type.openAction,
        parameters: type.parameters.map((parameter) => ({ ...parameter, options: [...parameter.options] })),
        paramValues: typeId === 'sma'
            ? { Period: name.match(/\((\d+)\)/)?.[1] ?? '20' }
            : {},
        inPorts: type.inPorts.map((port) => port.clone()),
        outPorts: type.outPorts.map((port) => port.clone()),
        x,
        y,
    });
}

const seedNodes = (): DiagramNode[] => [
    node('market-data', 'market', 'BTC/USDT candles', 30, 185),
    node('sma', 'fast', 'Fast SMA (12)', 285, 70),
    node('sma', 'slow', 'Slow SMA (26)', 285, 290),
    node('crossing', 'cross', 'SMA crossing', 550, 180),
    node('order-builder', 'orders', 'Buy on cross', 790, 180),
    node('connector', 'broker', 'Paper broker', 1030, 180),
    node('chart', 'chart', 'Strategy chart', 790, 385),
];

const seedLinks = (): Link[] => [
    new Link({ outNode: 'market', outPort: 'candles', inNode: 'fast', inPort: 'source' }),
    new Link({ outNode: 'market', outPort: 'candles', inNode: 'slow', inPort: 'source' }),
    new Link({ outNode: 'market', outPort: 'candles', inNode: 'chart', inPort: 'candles' }),
    new Link({ outNode: 'fast', outPort: 'value', inNode: 'cross', inPort: 'fast' }),
    new Link({ outNode: 'slow', outPort: 'value', inNode: 'cross', inPort: 'slow' }),
    new Link({ outNode: 'cross', outPort: 'signal', inNode: 'orders', inPort: 'signal' }),
    new Link({ outNode: 'orders', outPort: 'order', inNode: 'broker', inPort: 'order' }),
    new Link({ outNode: 'broker', outPort: 'trade', inNode: 'chart', inPort: 'trades' }),
];

let light = new URLSearchParams(window.location.search).get('theme') === 'light';
let readOnly = false;
let customSequence = 1;
let activeIndicator: DiagramNode | null = null;

function setStatus(message: string): void {
    status.textContent = message;
}

function updateState(): void {
    const model = diagram.save();
    modelStats.textContent = `${model.nodes.length} nodes · ${model.links.length} links`;
    document.querySelector<HTMLButtonElement>('#undoBtn')!.disabled = !diagram.canUndo();
    document.querySelector<HTMLButtonElement>('#redoBtn')!.disabled = !diagram.canRedo();
}

function applyTheme(): void {
    root.setAttribute('data-bs-theme', light ? 'light' : 'dark');
    diagram.setTheme(light
        ? { diagramBackground: '#f5f7fa', gridColor: '#e2e8f0', linkMaxLightness: 0.42 }
        : { diagramBackground: '#131820', gridColor: '#1e2633', linkMaxLightness: 1 });
    diagram.applySocketTheme();
    const nextTheme = light ? 'dark' : 'light';
    themeButton.classList.toggle('is-light', light);
    themeButton.title = `Switch to ${nextTheme} theme`;
    themeButton.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
}

function reset(nodeErrors: Readonly<Record<string, string>> = {}): void {
    diagram.load(seedNodes(), seedLinks(), { nodeErrors });
    diagram.zoomToFit();
    setStatus('Strategy model reset.');
    updateState();
}

diagram.on('nodeSelected', ({ node: selected }) => {
    setStatus(selected === null ? 'Selection cleared.' : `Selected: ${selected.name}`);
});
diagram.on('nodeAdded', ({ nodes }) => {
    const added = nodes[0];
    if (added === undefined) return;
    setStatus(`Added: ${added.name}`);
    updateState();
});
diagram.on('nodeRemoved', updateState);
diagram.on('linkAdded', ({ links }) => {
    const link = links[0];
    if (link === undefined) return;
    setStatus(`Connected ${String(link.outNode)} → ${String(link.inNode)}`);
    updateState();
});
diagram.on('linkRemoved', updateState);
diagram.on('linkRelinked', ({ link }) => {
    setStatus(`Relinked ${String(link.outNode)} → ${String(link.inNode)}.`);
});
diagram.on('linkValidation', ({ allowed, reason }) => {
    if (allowed) return;
    const messages: Partial<Record<typeof reason, string>> = {
        'duplicate-link': 'Rejected: that exact output/input pair is already connected.',
        'source-limit': 'Rejected: the output does not allow another wire.',
        'target-limit': 'Rejected: the input does not allow another wire.',
        'incompatible-type': 'Rejected: socket types are incompatible.',
        'same-node': 'Rejected: a node cannot connect to itself.',
        'host-rejected': 'Rejected by the host application.',
    };
    setStatus(messages[reason] ?? `Rejected: ${reason}.`);
});
// The diagram's built-in top-right fullscreen button only asks (fullscreenRequested); the host expands. Fill
// the window with a CSS overlay rather than the browser Fullscreen API, which a permissions policy blocks in
// many embedding contexts (it then silently does nothing) -- the overlay always works. Escape exits.
let expanded = false;
const setDiagramExpanded = (value: boolean): void => {
    if (expanded === value) return;
    expanded = value;
    canvasPanel.classList.toggle('is-fullscreen', value);
    diagram.setFullscreenState(value);
    requestAnimationFrame(() => {
        diagram.resize(diagramHost.clientWidth, diagramHost.clientHeight);
        diagram.zoomToFit();
    });
    setStatus(value ? 'Diagram expanded to fill the window.' : 'Diagram restored.');
};

diagram.on('fullscreenRequested', ({ fullscreen }) => setDiagramExpanded(fullscreen));
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expanded) setDiagramExpanded(false);
});
diagram.on('nodeOpen', ({ nodes }) => {
    const selected = nodes[0];
    if (selected?.openAction !== 'indicatorSettings') return;
    activeIndicator = selected;
    indicatorTitle.textContent = selected.name;
    indicatorPeriod.value = selected.paramValues.Period
        ?? selected.name.match(/\((\d+)\)/)?.[1]
        ?? '20';
    const input = selected.inPorts.find((port) => port.id === 'source');
    const output = selected.outPorts.find((port) => port.id === 'value');
    const normalizedType = input?.type.trim().toLowerCase() ?? '';
    indicatorInputType.value = normalizedType === 'any' || normalizedType === 'object'
        || normalizedType === 'system.object' || normalizedType === '*'
        ? 'Object'
        : 'Candle';
    indicatorInputMulti.checked = input !== undefined && input.maxLinks !== 1;
    indicatorOutputMulti.checked = output !== undefined && output.maxLinks !== 1;
    if (indicatorDialog.open) indicatorDialog.close();
    indicatorDialog.showModal();
    indicatorPeriod.focus();
    indicatorPeriod.select();
    setStatus(`Opened indicator settings: ${selected.name}`);
});

indicatorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (activeIndicator === null || !indicatorPeriod.reportValidity()) return;
    const period = indicatorPeriod.value;
    const baseName = activeIndicator.name.replace(/\s*\(\d+\)\s*$/, '');
    diagram.transaction('update indicator settings', () => {
        diagram.setNodeParamValue(activeIndicator!.id, 'Period', period);
        diagram.setNodeName(activeIndicator!.id, `${baseName} (${period})`);
        diagram.updatePort(activeIndicator!.id, 'in', 'source', {
            type: indicatorInputType.value,
            availableTypes: [],
            maxLinks: indicatorInputMulti.checked ? 0 : 1,
        });
        diagram.updatePort(activeIndicator!.id, 'out', 'value', {
            maxLinks: indicatorOutputMulti.checked ? 0 : 1,
        });
    });
    setStatus(`Updated ${baseName}: period ${period}, input ${indicatorInputType.value}, `
        + `fan-in ${indicatorInputMulti.checked ? 'multiple' : 'single'}, `
        + `fan-out ${indicatorOutputMulti.checked ? 'multiple' : 'single'}.`);
    indicatorDialog.close();
    activeIndicator = null;
});
document.querySelector<HTMLButtonElement>('#indicatorCancelBtn')!.addEventListener('click', () => {
    activeIndicator = null;
    indicatorDialog.close();
});

search.addEventListener('input', () => palette.setFilter(search.value));

diagramHost.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes(PALETTE_DRAG_MIME) !== true) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
});
diagramHost.addEventListener('drop', (event) => {
    event.preventDefault();
    const raw = event.dataTransfer?.getData(PALETTE_DRAG_MIME) ?? '';
    try {
        const payload = JSON.parse(raw) as { typeId?: string };
        if (typeof payload.typeId === 'string')
            diagram.dropNodeFromPalette(payload.typeId, event.clientX, event.clientY);
    } catch {
        setStatus('Palette drop payload is invalid.');
    }
});

document.querySelector<HTMLButtonElement>('#resetBtn')!.addEventListener('click', reset);
document.querySelector<HTMLButtonElement>('#undoBtn')!.addEventListener('click', () => {
    diagram.undo(); updateState();
});
document.querySelector<HTMLButtonElement>('#redoBtn')!.addEventListener('click', () => {
    diagram.redo(); updateState();
});
document.querySelector<HTMLButtonElement>('#fitBtn')!.addEventListener('click', () => setDiagramExpanded(!expanded));
document.querySelector<HTMLButtonElement>('#exportBtn')!.addEventListener('click', () => {
    const image = diagram.takeScreenshot({
        scope: 'content',
        pixelRatio: 2,
        padding: 40,
        includeOverview: false,
        includeSelection: false,
    });
    image.toBlob((blob) => {
        if (blob === null) {
            setStatus('The browser could not encode the diagram image.');
            return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'stocksharp-strategy.png';
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        setStatus('Full strategy image exported.');
    }, 'image/png');
});
document.querySelector<HTMLButtonElement>('#runtimeErrorBtn')!.addEventListener('click', () => {
    diagram.setNodeError('orders', 'Order Builder failed: order volume is not configured.');
    setStatus('Runtime error highlighted on Buy on cross. Hover the node for details.');
});
document.querySelector<HTMLButtonElement>('#loadErrorBtn')!.addEventListener('click', () => {
    reset({
        slow: 'Scheme load failed for Slow SMA: the saved Period value is invalid.',
    });
    setStatus('Loaded a damaged scheme. Hover the red node for details.');
});
themeButton.addEventListener('click', () => {
    light = !light; applyTheme();
});
document.querySelector<HTMLButtonElement>('#readonlyBtn')!.addEventListener('click', (event) => {
    readOnly = !readOnly;
    diagram.setReadOnly(readOnly);
    const button = event.currentTarget as HTMLButtonElement;
    button.classList.toggle('on', readOnly);
    button.textContent = readOnly ? '● Locked' : 'Read-only';
    setStatus(readOnly ? 'Read-only preview mode.' : 'Editing enabled.');
});
document.querySelector<HTMLButtonElement>('#addBtn')!.addEventListener('click', () => {
    const id = `indicator-${customSequence++}`;
    const created = node('sma', id, `SMA (${10 + customSequence * 3})`, 470, 400);
    diagram.addDiagramNode(created);
});

const resize = (): void => diagram.resize(diagramHost.clientWidth, diagramHost.clientHeight);
if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(resize).observe(diagramHost);
else
    window.addEventListener('resize', resize);

applyTheme();
resize();
reset();
