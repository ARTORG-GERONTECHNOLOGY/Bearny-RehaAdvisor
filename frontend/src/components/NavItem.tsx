type Props = {
  icon: React.ComponentType<{ size: number }>;
  label: string;
  active?: boolean;
  desktop?: boolean;
};

// TODO: move colors to config as soon as they are fixed
export function NavItem({ icon: Icon, label, active = false, desktop = false }: Props) {
  return (
    <button
      className={`
        flex items-center border-0
        text-[#565656] hover:text-black
        transition
        ${desktop ? 'gap-[6px] pt-[10px] pr-[12px] pb-[9px] pl-[12px] text-[14px]' : 'flex-col gap-[8px] text-[10px]'}
        ${active ? 'text-black' : ''}
        ${active && desktop ? 'bg-[#E6E6E6] rounded-full' : 'bg-transparent'}
      `}
    >
      <Icon size={desktop ? 20 : 24} />
      <span>{label}</span>
    </button>
  );
}
