import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DIAGRAM_VIEW_STATE_VERSION,
    DiagramViewStateError,
    createDiagramViewStateDocument,
    parseDiagramViewState,
    serializeDiagramViewState,
} from '../src/core/view-state';

test('view preferences round-trip through a versioned document', () => {
    const view = { zoom: 1.75, panX: -123.5, panY: 48.25, overviewVisible: false };
    assert.deepEqual(createDiagramViewStateDocument(view), {
        version: DIAGRAM_VIEW_STATE_VERSION,
        view,
    });

    const serialized = serializeDiagramViewState(view, 2);
    assert.deepEqual(parseDiagramViewState(serialized), view);
    assert.deepEqual(parseDiagramViewState(JSON.parse(serialized)), view);
});

test('invalid view preferences fail with a path instead of leaking bad transforms', () => {
    assert.throws(
        () => parseDiagramViewState('{ broken'),
        (error: unknown) => error instanceof DiagramViewStateError && error.path === '$',
    );
    assert.throws(
        () => parseDiagramViewState({
            version: 2,
            view: { zoom: 1, panX: 0, panY: 0, overviewVisible: true },
        }),
        (error: unknown) => error instanceof DiagramViewStateError && error.path === '$.version',
    );
    assert.throws(
        () => parseDiagramViewState({
            version: 1,
            view: { zoom: 0, panX: 0, panY: 0, overviewVisible: true },
        }),
        (error: unknown) => error instanceof DiagramViewStateError && error.path === '$.view.zoom',
    );
    assert.throws(
        () => parseDiagramViewState({
            version: 1,
            view: { zoom: 1, panX: Number.NaN, panY: 0, overviewVisible: true },
        }),
        (error: unknown) => error instanceof DiagramViewStateError && error.path === '$.view.panX',
    );
});
