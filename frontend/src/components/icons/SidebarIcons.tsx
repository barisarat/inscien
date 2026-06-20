type IconProps = {
  size?: number
  strokeWidth?: number
  className?: string
}

/** Notebook — spiral-bound book with ring marks on the spine. */
export function NotebookIcon({ size = 16, strokeWidth = 1.3, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="4"
        y="2.5"
        width="9.5"
        height="11"
        rx="1.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="4"
        y1="5.25"
        x2="2.5"
        y2="5.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="8"
        x2="2.5"
        y2="8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="10.75"
        x2="2.5"
        y2="10.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Docs — file folder with tab. */
export function DocsIcon({ size = 16, strokeWidth = 1.3, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2.5,5 C2.5,4.2 3.1,3.75 3.75,3.75 L6.5,3.75 L7.75,5.25 L12.25,5.25 C12.9,5.25 13.5,5.7 13.5,6.5 L13.5,12 C13.5,12.8 12.9,13.25 12.25,13.25 L3.75,13.25 C3.1,13.25 2.5,12.8 2.5,12 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** Papers — document sheet with folded corner and text lines. */
export function PapersIcon({ size = 16, strokeWidth = 1.3, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.5,2.5 L10,2.5 L13,5.5 L13,13 C13,13.3 12.8,13.5 12.5,13.5 L3.5,13.5 C3.2,13.5 3,13.3 3,13 L3,3 C3,2.7 3.2,2.5 3.5,2.5 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M10,2.5 L10,5.5 L13,5.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="5.25"
        y1="8.5"
        x2="10.75"
        y2="8.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1="5.25"
        y1="10.75"
        x2="10.75"
        y2="10.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Courses — graduation cap. */
export function CoursesIcon({ size = 16, strokeWidth = 1.3, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <polygon
        points="8,2.75 14,6.25 8,9.75 2,6.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M4.75,7.85 L4.75,10.75 C4.75,10.75 6,12.25 8,12.25 C10,12.25 11.25,10.75 11.25,10.75 L11.25,7.85"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** Podcasts — microphone with U-cradle and stand. */
export function PodcastsIcon({ size = 16, strokeWidth = 1.3, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="6"
        y="1.75"
        width="4"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <path
        d="M3.75,7 C3.75,9.35 5.65,11.25 8,11.25 C10.35,11.25 12.25,9.35 12.25,7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <line
        x1="8"
        y1="11.25"
        x2="8"
        y2="13.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1="5.75"
        y1="13.75"
        x2="10.25"
        y2="13.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}