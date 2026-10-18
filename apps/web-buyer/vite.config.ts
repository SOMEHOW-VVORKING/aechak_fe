import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import path from 'path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      // 라우트 컴포넌트를 방문 시점에 로드(엔트리 청크 682→약 420 kB). vitest에선 끈다(지연 로드 청크가 CI에서 findBy 1초 타임아웃을 넘김).
      autoCodeSplitting: !process.env.VITEST,
    }),
    react(),
  ],
  optimizeDeps: {
    // 첫 방문 때 dep 최적화 리로드가 결제 결과 화면을 재마운트하지 않도록 미리 번들에 포함
    include: ['@portone/browser-sdk/v2'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // 워크스페이스 패키지(@aechak/api 등)가 자기 쪽 사본을 끌고 들어와도
    // 번들에는 앱의 단일 인스턴스만 실리도록 강제 — react/rq는 이중 로드되면 상태 통지가 유실된다
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
})
