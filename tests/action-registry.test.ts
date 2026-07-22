import assert from 'node:assert/strict';
import test from 'node:test';

import { DiagramActionRegistry } from '../src/core/action-registry';

type ActionId = 'increment' | 'reset';
interface Context { value: number }

test('action registry reports state and executes enabled actions', () => {
    const registry = new DiagramActionRegistry<ActionId, Context>();
    registry.register({
        id: 'increment',
        canExecute: ({ value }) => value < 2,
        execute: (context) => { context.value += 1; },
    });
    registry.register({
        id: 'reset',
        canExecute: ({ value }) => value !== 0,
        execute: (context) => { context.value = 0; },
    });
    const context = { value: 0 };

    assert.deepEqual(registry.states(context), [
        { id: 'increment', enabled: true },
        { id: 'reset', enabled: false },
    ]);
    assert.equal(registry.execute('reset', context), false);
    assert.equal(registry.execute('increment', context), true);
    assert.equal(context.value, 1);
});

test('action registration is unique and disposable', () => {
    const registry = new DiagramActionRegistry<'run', Context>();
    const action = {
        id: 'run' as const,
        canExecute: () => true,
        execute: () => undefined,
    };
    const dispose = registry.register(action);

    assert.throws(() => registry.register(action), /already registered/);
    dispose();
    assert.equal(registry.get('run'), null);
});
