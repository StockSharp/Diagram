import assert from 'node:assert/strict';
import test from 'node:test';

import { DiagramCommandHistory, type DiagramCommand } from '../src/core/history';

function assignment(target: { value: number }, value: number, label = `set ${value}`): DiagramCommand {
    const previous = target.value;
    return {
        label,
        execute: () => { target.value = value; },
        undo: () => { target.value = previous; },
    };
}

test('command history executes, undoes and redoes one command', () => {
    const target = { value: 0 };
    const states: string[] = [];
    const history = new DiagramCommandHistory((state) => {
        states.push(`${state.undoDepth}:${state.redoDepth}`);
    });

    history.execute(assignment(target, 10));
    assert.equal(target.value, 10);
    assert.equal(history.state.undoLabel, 'set 10');

    assert.equal(history.undo(), true);
    assert.equal(target.value, 0);
    assert.equal(history.redo(), true);
    assert.equal(target.value, 10);
    assert.deepEqual(states, ['1:0', '0:1', '1:0']);
});

test('transaction groups commands and preserves execution order', () => {
    const values: number[] = [];
    const history = new DiagramCommandHistory();
    const push = (value: number): DiagramCommand => ({
        label: `push ${value}`,
        execute: () => { values.push(value); },
        undo: () => { assert.equal(values.pop(), value); },
    });

    history.transaction('paste', () => {
        history.execute(push(1));
        history.transaction('nested', () => {
            history.execute(push(2));
            history.execute(push(3));
        });
    });

    assert.deepEqual(values, [1, 2, 3]);
    assert.equal(history.state.undoDepth, 1);
    assert.equal(history.state.undoLabel, 'paste');
    history.undo();
    assert.deepEqual(values, []);
    history.redo();
    assert.deepEqual(values, [1, 2, 3]);
});

test('failed transaction rolls back only its applied commands', () => {
    const values: number[] = [];
    const history = new DiagramCommandHistory();
    const push = (value: number): DiagramCommand => ({
        label: `push ${value}`,
        execute: () => { values.push(value); },
        undo: () => { values.pop(); },
    });
    history.execute(push(1));

    assert.throws(() => history.transaction('broken paste', () => {
        history.execute(push(2));
        history.execute(push(3));
        throw new Error('broken');
    }), /broken/);

    assert.deepEqual(values, [1]);
    assert.equal(history.state.undoDepth, 1);
    assert.equal(history.state.undoLabel, 'push 1');
});

test('recordApplied supports pointer gestures without executing twice', () => {
    const target = { value: 5 };
    const history = new DiagramCommandHistory();
    history.recordApplied({
        label: 'drag',
        execute: () => { target.value = 5; },
        undo: () => { target.value = 0; },
    });

    assert.equal(target.value, 5);
    history.undo();
    assert.equal(target.value, 0);
    history.redo();
    assert.equal(target.value, 5);
});

test('new commands discard redo and clear resets the state', () => {
    const target = { value: 0 };
    const history = new DiagramCommandHistory();
    history.execute(assignment(target, 1));
    history.undo();
    history.execute(assignment(target, 2));

    assert.equal(history.state.canRedo, false);
    history.clear();
    assert.deepEqual(history.state, {
        canUndo: false,
        canRedo: false,
        undoDepth: 0,
        redoDepth: 0,
        undoLabel: null,
        redoLabel: null,
    });
});
