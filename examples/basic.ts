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
const paletteHost = document.querySelector<HTMLElement>('#palette');
const search = document.querySelector<HTMLInputElement>('#paletteSearch');
const status = document.querySelector<HTMLElement>('#status');
const modelStats = document.querySelector<HTMLElement>('#modelStats');

if (diagramHost === null || paletteHost === null || search === null || status === null || modelStats === null)
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
        ],
    }),
].forEach((node) => catalog.addNodeType(node));

const palette = new StockSharpPalette({ div: paletteHost, catalog });
const diagram = new StockSharpDiagram({ div: diagramHost, catalog });

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
    document.querySelector<HTMLButtonElement>('#themeBtn')!.textContent = light ? '☾ Dark' : '☼ Light';
}

function reset(): void {
    diagram.load(seedNodes(), seedLinks());
    diagram.zoomToFit();
    setStatus('Strategy model reset.');
    updateState();
}

diagram.setLinkValidator(({ fromPort, toPort }) =>
    fromPort.type === toPort.type || toPort.availableTypes.includes(fromPort.type));

diagram.on('nodeSelected', ({ node: selected }) => {
    setStatus(selected === null ? 'Selection cleared.' : `Selected: ${selected.name}`);
});
diagram.on('nodeAdded', ({ node: added }) => {
    setStatus(`Added: ${added.name}`);
    updateState();
});
diagram.on('nodeRemoved', updateState);
diagram.on('linkAdded', ({ link }) => {
    setStatus(`Connected ${String(link.outNode)} → ${String(link.inNode)}`);
    updateState();
});
diagram.on('linkRemoved', updateState);
diagram.on('linkValidation', ({ allowed }) => {
    if (!allowed) setStatus('Rejected: socket types are incompatible.');
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
document.querySelector<HTMLButtonElement>('#fitBtn')!.addEventListener('click', () => diagram.zoomToFit());
document.querySelector<HTMLButtonElement>('#themeBtn')!.addEventListener('click', () => {
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
