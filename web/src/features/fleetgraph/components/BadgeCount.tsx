interface BadgeCountProps {
  count: number;
}

export function BadgeCount({ count }: BadgeCountProps) {
  if (count <= 0) return null;

  return (
    <span
      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f87171] px-1 text-[10px] font-bold text-white"
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
