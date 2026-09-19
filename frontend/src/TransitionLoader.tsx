type Props = {
  visible: boolean
  message?: string
}

export function TransitionLoader({ visible, message = 'Loading workspace...' }: Props) {
  if (!visible) return null

  return (
    <div className="transition-overlay">
      <div className="transition-content">
        <div className="transition-dots">
          <span className="t-dot" style={{ animationDelay: '0s' }} />
          <span className="t-dot" style={{ animationDelay: '0.15s' }} />
          <span className="t-dot" style={{ animationDelay: '0.3s' }} />
        </div>
        <p className="transition-msg">{message}</p>
        <div className="transition-bar-track">
          <div className="transition-bar-fill" />
        </div>
      </div>
    </div>
  )
}
