type Props = {
  onClick?: () => void;
  iconOutline: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconFill: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  active?: boolean;
  desktop?: boolean;
};

export function NavItem({
  onClick,
  iconOutline: IconOutline,
  iconFill: IconFill,
  label,
  active = false,
  desktop = false,
}: Props) {
  const Icon = active ? IconFill : IconOutline;
  const iconSize = desktop ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center border-0
        transition
        ${desktop ? 'gap-[6px] pt-[10px] pr-[12px] pb-[9px] pl-[12px] text-[14px]' : 'flex-col gap-[8px] text-[10px]'}
        ${active ? 'text-[#03A578]' : 'text-zinc-500 hover:text-black'}
        ${active && desktop ? 'bg-[#03A5780D] rounded-full' : 'bg-transparent'}
      `}
    >
      <Icon className={iconSize} />
      <span>{label}</span>
    </button>
  );
}
