import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { routeTree } from '../../routeTree.gen'

// Phase 0 컴포넌트 확인용 /preview 라우트가 dev 배포에 그대로 올라가 '컴포넌트 프리뷰 (임시)'가
// 열렸다(SCRUM-354). 라우트는 파일만 두면 트리에 들어가므로, 내부용 화면이 다시 들어오면
// 아무도 모르게 배포된다 — 그래서 트리와 라우트 파일 양쪽을 고정한다.

const ROUTES_DIR = join(__dirname, '..')

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : routeFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

describe('라우트 트리 위생', () => {
  it('[AC-ROUTE-HYGIENE-001] 라우트 트리에 /preview 가 없다', () => {
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    expect(Object.keys(router.routesById)).not.toContain('/preview')
  })

  it('[AC-ROUTE-HYGIENE-002] 어떤 라우트 파일도 임시(TEMPORARY) 화면으로 표시돼 있지 않다', () => {
    const marked = routeFiles(ROUTES_DIR).filter(path => readFileSync(path, 'utf8').includes('TEMPORARY'))
    expect(marked).toEqual([])
  })
})
