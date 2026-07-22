import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DiagramDocumentError,
    cloneDiagramDocument,
    createDiagramDocument,
    parseDiagramDocument,
    serializeDiagramDocument,
} from '../src/core/document';
import { DIAGRAM_DOCUMENT_VERSION, type JsonObject } from '../src/core/model';
import {
    cloneDiagramRuntimeState,
    createDiagramNodeRuntimeState,
    createDiagramPortRuntimeState,
    createDiagramRuntimeState,
    createDiagramSelection,
    createDiagramViewState,
} from '../src/core/state';

function createCompleteDocument() {
    return createDiagramDocument({
        metadata: { strategyId: 'strategy-1', flags: ['paper', true] },
        nodes: [{
            id: 'source-1',
            typeId: 'source',
            name: 'Market data',
            description: 'Produces candles',
            groupName: 'Sources',
            x: 12.5,
            y: -8,
            color: '#102030',
            border: '#405060',
            icon: 'source.svg',
            message: 'Persistent host note',
            openAction: 'sourceSettings',
            outPorts: [{
                id: 'candles',
                name: 'Candles',
                description: 'Candle stream',
                type: 'Candle',
                maxLinks: 3,
                availableTypes: ['Candle', 'ICandleMessage'],
                isDynamic: true,
                dynamicMode: 'onConnect',
                isSibling: false,
                metadata: { socketKey: 42 },
            }],
            parameters: [{
                name: 'TimeFrame',
                displayName: 'Time frame',
                description: 'Candle interval',
                type: 'timespan',
                defaultValue: '00:01:00',
                options: ['00:01:00', '00:05:00'],
                min: null,
                max: null,
                displayOrder: 10,
                category: 'General',
                isBasic: true,
                editorType: 'TimeSpanEditor',
            }],
            paramValues: { TimeFrame: '00:05:00' },
            metadata: { hostPayload: { securityId: 'SBER@TQBR' } },
        }, {
            id: 'indicator-1',
            typeId: 'sma',
            name: 'SMA',
            inPorts: [{ id: 'source', name: 'Source', type: 'Candle' }],
        }],
        links: [{
            from: { nodeId: 'source-1', portId: 'candles' },
            to: { nodeId: 'indicator-1', portId: 'source' },
            metadata: { label: 'main feed' },
        }],
    });
}

test('creates a normalized versioned document with stable link identities', () => {
    const document = createCompleteDocument();

    assert.equal(document.version, DIAGRAM_DOCUMENT_VERSION);
    assert.equal(document.links[0].id, 'link_1');
    assert.equal(document.nodes[1].groupName, 'Common');
    assert.equal(document.nodes[1].x, 0);
    assert.deepEqual(document.nodes[1].inPorts[0].availableTypes, []);
    assert.deepEqual(document.nodes[1].metadata, {});
});

test('serializes and parses the complete document without sharing mutable data', () => {
    const original = createCompleteDocument();
    const parsed = parseDiagramDocument(serializeDiagramDocument(original));

    assert.deepEqual(parsed, original);
    parsed.nodes[0].outPorts[0].availableTypes.push('Changed');
    parsed.nodes[0].parameters[0].options.push('Changed');
    parsed.nodes[0].metadata.hostPayload = { changed: true };

    assert.deepEqual(original.nodes[0].outPorts[0].availableTypes, ['Candle', 'ICandleMessage']);
    assert.deepEqual(original.nodes[0].parameters[0].options, ['00:01:00', '00:05:00']);
    assert.deepEqual(original.nodes[0].metadata, { hostPayload: { securityId: 'SBER@TQBR' } });
    assert.deepEqual(cloneDiagramDocument(original), original);
});

test('rejects unsupported, duplicate and dangling document data with a path', () => {
    assert.throws(
        () => parseDiagramDocument({ version: 2, nodes: [], links: [], metadata: {} }),
        (error: unknown) => error instanceof DiagramDocumentError && error.path === '$.version',
    );
    assert.throws(
        () => createDiagramDocument({
            nodes: [{ id: 'same', name: 'One' }, { id: 'same', name: 'Two' }],
        }),
        /duplicate node id/,
    );
    assert.throws(
        () => createDiagramDocument({
            nodes: [{ id: 'source', name: 'Source', outPorts: [{ id: 'out', name: 'Out' }] }],
            links: [{
                from: { nodeId: 'source', portId: 'out' },
                to: { nodeId: 'missing', portId: 'in' },
            }],
        }),
        /unknown target node/,
    );
});

test('rejects non-JSON host metadata instead of corrupting persistence', () => {
    const metadata = { callback: () => undefined } as unknown as JsonObject;
    assert.throws(() => createDiagramDocument({ metadata }), /expected a JSON value/);

    const dateMetadata = { createdAt: new Date() } as unknown as JsonObject;
    assert.throws(() => createDiagramDocument({ metadata: dateMetadata }), /expected a JSON value/);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(
        () => createDiagramDocument({ metadata: circular as JsonObject }),
        /circular JSON value/,
    );
});

test('runtime, view and selection state have independent fresh defaults', () => {
    const runtimeA = createDiagramRuntimeState();
    const runtimeB = createDiagramRuntimeState();
    const selectionA = createDiagramSelection();
    const selectionB = createDiagramSelection();

    runtimeA.nodes.node = createDiagramNodeRuntimeState();
    runtimeA.nodes.node.active = true;
    runtimeA.nodes.node.error = { kind: 'runtime', message: 'Failed', pulse: 1 };
    runtimeA.nodes.node.ports.out.value = createDiagramPortRuntimeState();
    selectionA.nodeIds.push('node');

    assert.deepEqual(runtimeB, { activeNodeId: null, nodes: {}, globalError: null });
    assert.deepEqual(selectionB.nodeIds, []);
    assert.deepEqual(createDiagramViewState(), {
        zoom: 1,
        panX: 0,
        panY: 0,
        overviewVisible: true,
    });

    const cloned = cloneDiagramRuntimeState(runtimeA);
    cloned.nodes.node.active = false;
    cloned.nodes.node.ports.out.value.value = 'changed';
    assert.equal(runtimeA.nodes.node.active, true);
    assert.equal(runtimeA.nodes.node.ports.out.value.value, null);
});
