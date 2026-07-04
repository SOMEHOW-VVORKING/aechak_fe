export interface CategoryTreeNode {
  key: string
  label: string
  children?: CategoryTreeNode[]
}

export interface CategoryTreeProps {
  nodes: CategoryTreeNode[]
  activeKey?: string
  onSelect: (key: string) => void
  expandedKeys: string[]
  onExpandedChange: (keys: string[]) => void
  className?: string
}

interface RowProps {
  node: CategoryTreeNode
  depth: number
  activeKey?: string
  onSelect: (key: string) => void
  expandedKeys: string[]
  onExpandedChange: (keys: string[]) => void
}

function CategoryTreeRow({ node, depth, activeKey, onSelect, expandedKeys, onExpandedChange }: RowProps) {
  const hasChildren = !!node.children?.length
  const isExpanded = expandedKeys.includes(node.key)
  const isActive = node.key === activeKey

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(node.key)
          if (hasChildren) {
            onExpandedChange(
              isExpanded ? expandedKeys.filter(k => k !== node.key) : [...expandedKeys, node.key],
            )
          }
        }}
        style={depth > 0 ? { paddingLeft: `${12 + depth * 18}px` } : undefined}
        className={[
          'w-full flex items-center gap-1.5 rounded-md px-2 py-2 text-body-sm text-left transition-colors',
          hasChildren ? 'font-semibold' : '',
          isActive ? 'bg-brand-subtle text-brand' : 'text-text-primary hover:bg-surface-hover',
        ].filter(Boolean).join(' ')}
      >
        {hasChildren ? (
          <svg
            className={`flex-none size-3.5 text-icon transition-transform ${isExpanded ? '' : '-rotate-90'}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        ) : depth > 0 ? (
          <svg className="flex-none size-3 text-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 10 4 15l5 5M4 15h11a4 4 0 0 0 4-4V4" />
          </svg>
        ) : (
          <span className="flex-none size-3.5" />
        )}
        <span className="flex-1 truncate">{node.label}</span>
      </button>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map(child => (
            <CategoryTreeRow
              key={child.key}
              node={child}
              depth={depth + 1}
              activeKey={activeKey}
              onSelect={onSelect}
              expandedKeys={expandedKeys}
              onExpandedChange={onExpandedChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CategoryTree({ nodes, activeKey, onSelect, expandedKeys, onExpandedChange, className = '' }: CategoryTreeProps) {
  return (
    <div className={className}>
      {nodes.map(node => (
        <CategoryTreeRow
          key={node.key}
          node={node}
          depth={0}
          activeKey={activeKey}
          onSelect={onSelect}
          expandedKeys={expandedKeys}
          onExpandedChange={onExpandedChange}
        />
      ))}
    </div>
  )
}
