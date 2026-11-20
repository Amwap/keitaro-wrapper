type IconProps = { className?: string }

function Icon({ className = 'size-5', d }: IconProps & { d: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export const CampaignsIcon = (p: IconProps) => (
  <Icon {...p} d="M3.75 13.5h4.5v6.75h-4.5zM9.75 3.75h4.5v16.5h-4.5zM15.75 9h4.5v11.25h-4.5z" />
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p} d="M12 7.5v9M7.5 12h9M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
)

export const MenuIcon = (p: IconProps) => <Icon {...p} d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />

export const CloseIcon = (p: IconProps) => <Icon {...p} d="M6 18 18 6M6 6l12 12" />

export const CollapseIcon = (p: IconProps) => (
  <Icon {...p} d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
)

export const ExpandIcon = (p: IconProps) => (
  <Icon {...p} d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />
)
