import { forwardRef } from 'react'
import styles from './ScrollArea.module.css'

interface ScrollAreaProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { children, className, style },
  ref
) {
  return (
    <div ref={ref} className={`${styles.root}${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  )
})

export default ScrollArea
