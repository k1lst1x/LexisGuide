import { useRef, useState, type DragEvent } from 'react'

/** Accept files dropped anywhere on the conversation. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const hasFiles = (event: DragEvent) => [...event.dataTransfer.types].includes('Files')
  return {
    dragging,
    dropProps: {
      onDragEnter: (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); depth.current += 1; setDragging(true) },
      onDragOver: (event: DragEvent) => { if (hasFiles(event)) event.preventDefault() },
      onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false) },
      onDrop: (event: DragEvent) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        depth.current = 0
        setDragging(false)
        const files = [...event.dataTransfer.files]
        if (files.length) onFiles(files)
      },
    },
  }
}
