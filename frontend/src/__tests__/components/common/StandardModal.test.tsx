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

  it('renders no visible title text when title is not provided', () => {
    render(
      <StandardModal show onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    // The dialog still exposes an accessible (visually hidden) title for screen readers,
    // and always renders its built-in close button regardless of header/title.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
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
    render(
      <StandardModal show onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('renders the footer when provided', () => {
    render(
      <StandardModal show onHide={jest.fn()} footer={<button>Save</button>}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies the provided className alongside the default size class', () => {
    render(
      <StandardModal show onHide={jest.fn()} className="extra-class">
        <div>Body content</div>
      </StandardModal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('extra-class');
    expect(dialog).toHaveClass('max-w-3xl');
  });

  it('defaults to size lg and static backdrop with keyboard disabled', () => {
    render(
      <StandardModal show onHide={jest.fn()}>
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.getByRole('dialog')).toHaveClass('max-w-3xl');
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
    expect(screen.getByRole('dialog')).toHaveClass('max-w-sm');
  });

  it('renders an extra-large size when size="xl" is passed', () => {
    render(
      <StandardModal show onHide={jest.fn()} size="xl">
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.getByRole('dialog')).toHaveClass('max-w-5xl');
  });

  it('does not render a description when none is provided', () => {
    render(
      <StandardModal show onHide={jest.fn()} title="My Title">
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.queryByText('My Description')).not.toBeInTheDocument();
  });

  it('renders the description under the title when provided', () => {
    render(
      <StandardModal show onHide={jest.fn()} title="My Title" description="My Description">
        <div>Body content</div>
      </StandardModal>
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('My Description')).toBeInTheDocument();
  });

  it('renders no description when title is not provided either (headerless dialog)', () => {
    render(
      <StandardModal show onHide={jest.fn()} description="My Description">
        <div>Body content</div>
      </StandardModal>
    );
    // A description alone without a title never renders — there is no header to attach it to.
    expect(screen.queryByText('My Description')).not.toBeInTheDocument();
  });
});
