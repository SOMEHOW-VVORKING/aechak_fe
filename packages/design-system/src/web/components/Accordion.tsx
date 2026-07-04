import type { ReactNode } from 'react'

export interface AccordionItem {
  key: string
  title: string
  content: ReactNode
}

export interface AccordionProps {
  items: AccordionItem[]
  openKeys: string[]
  onChange: (openKeys: string[]) => void
  className?: string
}

export function Accordion({ items, openKeys, onChange, className = '' }: AccordionProps) {
  const toggle = (key: string) => {
    onChange(
      openKeys.includes(key)
        ? openKeys.filter(k => k !== key)
        : [...openKeys, key],
    )
  }

  return (
    <div className={className}>
      {items.map(item => {
        const isOpen = openKeys.includes(item.key)
        return (
          <div key={item.key} className="border-b border-border-subtle">
            <button
              type="button"
              onClick={() => toggle(item.key)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 py-4 px-1 text-left cursor-pointer"
            >
              <span className="flex-1 min-w-0 text-body text-text-primary">{item.title}</span>
              <svg
                className={`flex-none size-5 text-icon-muted transition-transform duration-fast ${isOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-1 pb-4 text-body-sm text-text-secondary leading-relaxed">
                {item.content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
