import { render, screen, fireEvent } from '@testing-library/react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';

describe('Dialog', () => {
  it('does not render content when closed', () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Hello</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('renders content, title and description when open', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Title</DialogTitle>
            <DialogDescription>My description</DialogDescription>
          </DialogHeader>
          <div>Body content</div>
          <DialogFooter>
            <button type="button">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('My description')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when the built-in close button is clicked', () => {
    const onOpenChange = jest.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>My Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when a DialogClose element is clicked', () => {
    const onOpenChange = jest.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>My Title</DialogTitle>
          <DialogClose asChild>
            <button type="button">Cancel</button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens via DialogTrigger when uncontrolled', () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Open</button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Triggered content</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByText('Triggered content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Triggered content')).toBeInTheDocument();
  });

  it('caps its own height and scrolls internally by default, so long content never pushes the header/footer off-screen', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>My Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('max-h-[90vh]');
    expect(dialog).toHaveClass('overflow-y-auto');
  });

  it('does not auto-focus the first focusable field on open by default', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>My Title</DialogTitle>
          <input placeholder="first field" autoFocus={false} />
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByPlaceholderText('first field')).not.toHaveFocus();
  });

  it('still auto-focuses when the caller explicitly provides onOpenAutoFocus', () => {
    const onOpenAutoFocus = jest.fn((e: Event) => {
      e.preventDefault();
      document.querySelector<HTMLInputElement>('input[placeholder="first field"]')?.focus();
    });
    render(
      <Dialog open>
        <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
          <DialogTitle>My Title</DialogTitle>
          <input placeholder="first field" />
        </DialogContent>
      </Dialog>
    );
    expect(onOpenAutoFocus).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('first field')).toHaveFocus();
  });

  it('merges a custom className onto DialogContent', () => {
    render(
      <Dialog open>
        <DialogContent className="my-content">
          <DialogTitle>My Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByRole('dialog')).toHaveClass('my-content');
  });

  it('hides the built-in close button when hideClose is set', () => {
    render(
      <Dialog open>
        <DialogContent hideClose>
          <DialogTitle>My Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});
