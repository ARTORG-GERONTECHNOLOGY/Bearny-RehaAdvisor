type Props = {
  onClick?: () => void;
  iconOutline: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconFill: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  active?: boolean;
  desktop?: boolean;
};

// TODO: move colors to config as soon as they are fixed
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
        text-[#565656] hover:text-black
        transition
        ${desktop ? 'gap-[6px] pt-[10px] pr-[12px] pb-[9px] pl-[12px] text-[14px]' : 'flex-col gap-[8px] text-[10px]'}
        ${active ? 'text-black' : ''}
        ${active && desktop ? 'bg-[#E6E6E6] rounded-full' : 'bg-transparent'}
      `}
    >
      <Icon className={iconSize} />
      <span>{label}</span>
    </button>
  );
}
