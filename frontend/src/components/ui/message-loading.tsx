type MessageLoadingProps = {
  className?: string
}

/** A calm three-dot response indicator for asynchronous assistant work. */
function MessageLoading({ className = '' }: MessageLoadingProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={`lg-message-loading ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="4" cy="12" r="2" fill="currentColor">
        <animate
          id="lexisguide-loading-first"
          begin="0;lexisguide-loading-last.end+0.25s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
      <circle cx="12" cy="12" r="2" fill="currentColor">
        <animate
          begin="lexisguide-loading-first.begin+0.1s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
      <circle cx="20" cy="12" r="2" fill="currentColor">
        <animate
          id="lexisguide-loading-last"
          begin="lexisguide-loading-first.begin+0.2s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
    </svg>
  )
}

export { MessageLoading }
