import { Badge } from '@/components/ui/badge';

const isDev = import.meta.env.DEV;

export default function DevBanner() {
  if (!isDev) return null;

  return (
    <Badge className="fixed top-4 right-4 z-[9999] bg-yellow font-bold text-white shadow-md select-none pointer-events-none">
      <span className="size-2 rounded-full bg-white animate-pulse" />
      DEV
    </Badge>
  );
}
