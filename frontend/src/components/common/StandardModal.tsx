import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Props = {
  show: boolean;
  onHide: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'lg' | 'xl';
  backdrop?: true | 'static';
  keyboard?: boolean;
  className?: string;
};

const sizeClassName: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

const StandardModal: React.FC<Props> = ({
  show,
  onHide,
  title,
  description,
  children,
  footer,
  size = 'lg',
  backdrop = 'static',
  keyboard = false,
  className,
}) => {
  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className={cn(sizeClassName[size], className)}
        onPointerDownOutside={(e) => backdrop === 'static' && e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (!keyboard) e.preventDefault();
        }}
      >
        {title !== undefined ? (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description !== undefined && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        ) : (
          // Radix requires a DialogTitle for a11y even when this modal has no visible header.
          <DialogTitle className="sr-only">Dialog</DialogTitle>
        )}

        {children}

        {footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
};

export default StandardModal;
