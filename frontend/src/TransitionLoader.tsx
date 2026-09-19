import BarLoader from '@/components/ui/bar-loader'

type Props = {
  visible: boolean
  message?: string
}

export function TransitionLoader({ visible, message = 'Loading workspace...' }: Props) {
  if (!visible) return null

  return (
    <div className="transition-overlay">
      <div className="transition-content flex flex-col items-center gap-6">
        <BarLoader
          bars={10}
          barWidth={8}
          barHeight={64}
          color="bg-[#325238]"
          speed={1.2}
          className="my-2"
        />
        <p className="transition-msg font-serif text-lg text-[#191919]">{message}</p>
      </div>
    </div>
  )
}
