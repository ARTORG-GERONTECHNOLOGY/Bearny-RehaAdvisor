import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StandardModal from '@/components/common/StandardModal';

describe('StandardModal', () => {
  it('renders nothing visible when show is false', () => {
    render(
      <StandardModal show={false} onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  it('renders the body content when shown', () => {
    render(
      <StandardModal show onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('renders no header when title is not provided', () => {
    render(
      <StandardModal show onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('renders a header with a close button when title is provided', () => {
    render(
      <StandardModal show onHide={jest.fn()} title="My Title">
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('calls onHide when the header close button is clicked', () => {
    const onHide = jest.fn();
    render(
      <StandardModal show onHide={onHide} title="My Title">
        <div>Body content</div>
      </StandardModal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('renders no footer when footer is not provided', () => {
    const { container } = render(
      <StandardModal show onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(container.querySelector('.rs-modal__footer')).not.toBeInTheDocument();
  });

  it('renders the footer when provided', () => {
    render(
      <StandardModal show onHide={jest.fn()} footer={<button>Save</button>}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies the provided className alongside the default rs-modal class', () => {
    render(
      <StandardModal show onHide={jest.fn()} className="extra-class">
        <div>Body content</div>
      </StandardModal>
    );
    const dialog = document.querySelector('.modal-dialog');
    expect(dialog).toHaveClass('rs-modal');
    expect(dialog).toHaveClass('extra-class');
  });

  it('defaults to size lg, centered, static backdrop, and keyboard disabled', () => {
    render(
      <StandardModal show onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    const dialog = document.querySelector('.modal-dialog');
    expect(dialog).toHaveClass('modal-lg');
    expect(dialog).toHaveClass('modal-dialog-centered');
    // Static backdrop + keyboard disabled -> Escape key should not call onHide
  });

  it('does not call onHide on Escape when keyboard defaults to false (static backdrop)', () => {
    const onHide = jest.fn();
    render(
      <StandardModal show onHide={onHide}>
        <div>Body content</div>
      </StandardModal>
    );
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });
    expect(onHide).not.toHaveBeenCalled();
  });

  it('calls onHide on Escape when keyboard is explicitly enabled', () => {
    const onHide = jest.fn();
    render(
      <StandardModal show onHide={onHide} keyboard>
        <div>Body content</div>
      </StandardModal>
    );
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('renders a small size when size="sm" is passed', () => {
    render(
      <StandardModal show onHide={jest.fn()} size="sm">
        <div>Body content</div>
      </StandardModal>
    );
    expect(document.querySelector('.modal-dialog')).toHaveClass('modal-sm');
  });

  it('renders uncentered when centered is false', () => {
    render(
      <StandardModal show onHide={jest.fn()} centered={false}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(document.querySelector('.modal-dialog')).not.toHaveClass('modal-dialog-centered');
  });
});
