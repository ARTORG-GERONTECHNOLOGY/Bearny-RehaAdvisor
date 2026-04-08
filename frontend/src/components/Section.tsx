import { cn } from '@/lib/utils';

type Props = React.ComponentPropsWithoutRef<'section'>;

export default function Section({ children, className, ...props }: Props) {
  return (
    <section
      className={cn('flex flex-col gap-2 bg-white rounded-[40px] p-4', className)}
      {...props}
    >
      {children}
    </section>
  );
}
