import React, { StrictMode, useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useDialog, { getFocusable } from './useDialog';

// A page with an opener button, a dialog that mounts only while open (like
// AnimatePresence does), and a fallback element for return focus.
function Page({ initialOpen = false, useInitial = false, withFallback = false, empty = false, returnFocusRef }) {
  const [open, setOpen] = useState(initialOpen);
  const initialRef = useRef(null);
  const fallbackRef = useRef(null);
  const { ref, dialogProps } = useDialog({
    open,
    onClose: () => setOpen(false),
    initialFocusRef: useInitial ? initialRef : undefined,
    returnFocusRef: returnFocusRef || (withFallback ? fallbackRef : undefined),
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>opener</button>
      <button type="button" ref={fallbackRef}>fallback</button>
      {open && (
        <div ref={ref} {...dialogProps} aria-labelledby="t">
          <h2 id="t">Dialog</h2>
          {!empty && (
            <>
              <button type="button">first</button>
              <input placeholder="middle" ref={initialRef} />
              <button type="button" disabled>disabled</button>
              <div className="hidden"><button type="button">hidden-class</button></div>
              <div hidden><button type="button">hidden-attr</button></div>
              <div aria-hidden="true"><button type="button">aria-hidden</button></div>
              <button type="button" tabIndex={-1}>minus-one</button>
              <button type="button">last</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const dialog = () => screen.getByRole('dialog');
const byName = (n) => screen.getByRole('button', { name: n });

describe('getFocusable', () => {
  test('skips disabled, tabindex=-1, and hidden ancestors', () => {
    render(<Page initialOpen />);
    expect(getFocusable(dialog()).map((el) => el.textContent || el.placeholder)).toEqual(['first', 'middle', 'last']);
    expect(getFocusable(null)).toEqual([]);
  });
});

describe('useDialog', () => {
  test('has dialog attributes and focuses the first focusable on open', () => {
    render(<Page />);
    byName('opener').focus();
    fireEvent.click(byName('opener'));
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(dialog()).toHaveAttribute('tabindex', '-1');
    expect(byName('first')).toHaveFocus();
  });

  test('focuses initialFocusRef when given, and the container when nothing is focusable', () => {
    const { unmount } = render(<Page useInitial />);
    fireEvent.click(byName('opener'));
    expect(screen.getByPlaceholderText('middle')).toHaveFocus();
    unmount();
    render(<Page empty />);
    fireEvent.click(byName('opener'));
    expect(dialog()).toHaveFocus();
  });

  test('Tab wraps last → first and Shift+Tab wraps first → last', () => {
    render(<Page />);
    fireEvent.click(byName('opener'));
    byName('last').focus();
    userEvent.tab();
    expect(byName('first')).toHaveFocus();
    userEvent.tab({ shift: true });
    expect(byName('last')).toHaveFocus();
    userEvent.tab();
    expect(byName('first')).toHaveFocus();
    userEvent.tab();
    expect(screen.getByPlaceholderText('middle')).toHaveFocus();
  });

  test('Escape closes and focus returns to the opener', () => {
    render(<Page />);
    byName('opener').focus();
    fireEvent.click(byName('opener'));
    expect(byName('first')).toHaveFocus();
    userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(byName('opener')).toHaveFocus();
  });

  test('Escape does not bubble past the dialog', () => {
    const outer = jest.fn();
    render(<div onKeyDown={outer}><Page /></div>);
    fireEvent.click(byName('opener'));
    userEvent.keyboard('{Escape}');
    expect(outer).not.toHaveBeenCalled();
  });

  test('when the opener is gone, focus returns to returnFocusRef', () => {
    function Wrapper() {
      const [showOpener, setShowOpener] = useState(true);
      return (
        <div>
          {showOpener && <button type="button" onClick={() => setShowOpener(false)}>temporary</button>}
          <Page withFallback />
        </div>
      );
    }
    render(<Wrapper />);
    byName('temporary').focus();
    fireEvent.click(byName('opener'));
    fireEvent.click(byName('temporary'));
    userEvent.keyboard('{Escape}');
    expect(byName('fallback')).toHaveFocus();
  });

  test('restores focus to a connected fallback when the dialog owner unmounts while open', () => {
    function Unmounter() {
      const [show, setShow] = useState(true);
      const fallbackRef = useRef(null);
      return (
        <div>
          <button type="button" onClick={() => setShow(false)}>kill</button>
          <button type="button" ref={fallbackRef}>external fallback</button>
          {show && <Page initialOpen returnFocusRef={fallbackRef} />}
        </div>
      );
    }
    render(<Unmounter />);
    expect(byName('first')).toHaveFocus();
    fireEvent.click(byName('kill'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(byName('external fallback')).toHaveFocus();
  });

  test('restores the opener after an open and close under StrictMode', () => {
    render(<StrictMode><Page /></StrictMode>);
    byName('opener').focus();
    fireEvent.click(byName('opener'));
    expect(byName('first')).toHaveFocus();
    userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(byName('opener')).toHaveFocus();
  });
});
