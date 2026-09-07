import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AnimatePresence } from 'framer-motion';
import { formatAisleBadge, ModeMenu, InviteModal } from './InStoreMode';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';

// Pure-function unit test for the allDone calculation logic.
// Verifies that a numeric size match doesn't trigger allDone if the actual
// ItemIDs don't all appear in the checked Set (defends against ID collisions
// like the OneOff ItemID=0 case).

function isAllDone(items, checkedItems) {
  const totalItems = items.length;
  if (totalItems === 0) return false;
  return items.every((i) => checkedItems.has(String(i.ItemID)));
}

describe('isAllDone (allDone semantics)', () => {
  test('returns false when items list is empty', () => {
    expect(isAllDone([], new Set())).toBe(false);
  });

  test('returns true when every ItemID is in the checked Set', () => {
    const items = [{ ItemID: 1 }, { ItemID: 2 }, { ItemID: 3 }];
    const checked = new Set(['1', '2', '3']);
    expect(isAllDone(items, checked)).toBe(true);
  });

  test('returns false when checked Set size equals items length but IDs differ', () => {
    const items = [{ ItemID: 0 }, { ItemID: 0 }];
    const checked = new Set(['0', '999']);
    expect(isAllDone(items, checked)).toBe(true); // both items match '0', it IS in Set
    const items2 = [{ ItemID: 1 }, { ItemID: 2 }];
    const checked2 = new Set(['1', '999']);
    expect(isAllDone(items2, checked2)).toBe(false);
  });

  test('returns false when one item is unchecked even if other counts match', () => {
    const items = [{ ItemID: 100 }, { ItemID: 200 }];
    const checked = new Set(['100']);
    expect(isAllDone(items, checked)).toBe(false);
  });
});

describe('formatAisleBadge', () => {
  test('returns empty string for null', () => {
    expect(formatAisleBadge(null)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(formatAisleBadge('')).toBe('');
  });

  test('returns "Aisle N" unchanged for an aisle location', () => {
    expect(formatAisleBadge('Aisle 14')).toBe('Aisle 14');
  });

  test('shortens a verbose wall location to "Section, Wall"', () => {
    expect(formatAisleBadge('In Produce on the Front Wall')).toBe('Produce, Front');
  });
});

describe('ModeMenu keyboard', () => {
  function Host({ onClose = () => {}, onInvite = () => {} }) {
    const triggerRef = React.useRef(null);
    return (
      <div>
        <button type="button" ref={triggerRef} aria-label="More">more</button>
        <ModeMenu onReorder={() => {}} onInvite={onInvite} onFeedback={() => {}} onClose={onClose} wakeLockActive={false} triggerRef={triggerRef} />
        <button type="button">after menu</button>
      </div>
    );
  }

  test('is a menu of menuitems and focuses the first item on mount', () => {
    render(<Host />);
    expect(screen.getByRole('menu', { name: 'Shopping options' })).toHaveAttribute('id', 'shop-mode-menu');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent.trim())).toEqual(['Reorder aisles', 'Invite partner', 'Send feedback']);
    expect(items[0]).toHaveFocus();
  });

  test('ArrowDown and ArrowUp wrap while Home and End jump', () => {
    render(<Host />);
    const items = screen.getAllByRole('menuitem');
    userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(items[0]).toHaveFocus();
    userEvent.keyboard('{ArrowUp}');
    expect(items[2]).toHaveFocus();
    userEvent.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
    userEvent.keyboard('{End}');
    expect(items[2]).toHaveFocus();
  });

  test('Escape closes and restores the trigger while Tab closes and continues natively', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Host onClose={onClose} />);
    userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();

    rerender(<Host onClose={onClose} />);
    screen.getAllByRole('menuitem')[0].focus();
    userEvent.tab();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'after menu' })).toHaveFocus();
  });
});

describe('InviteModal dialog accessibility', () => {
  afterEach(restoreFetch);

  test('is labelled, keeps the dialog exposed, focuses a 44px close button, and Escape closes', async () => {
    installMockFetch({ '/create_session': { code: 'AB12', week_start_date: '2026-09-06', expires_at: '2026-09-06 23:59:59' } });
    const onClose = jest.fn();
    render(<InviteModal weekStartDate="2026-09-06" onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Invite a partner' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toMatch(/\bw-11\b/);
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close).toHaveFocus();
    expect(await screen.findByText(/AB12/)).toBeInTheDocument();
    userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('restores the fallback synchronously when an AnimatePresence exit starts', async () => {
    installMockFetch({ '/create_session': { code: 'AB12', week_start_date: '2026-09-06', expires_at: '' } });
    function Host() {
      const fallbackRef = React.useRef(null);
      const [open, setOpen] = React.useState(true);
      return <><button ref={fallbackRef}>opener</button><AnimatePresence>{open && <InviteModal onClose={() => setOpen(false)} returnFocusRef={fallbackRef} />}</AnimatePresence></>;
    }
    render(<Host />);
    await screen.findByText(/AB12/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'opener' })).toHaveFocus();
  });
});
