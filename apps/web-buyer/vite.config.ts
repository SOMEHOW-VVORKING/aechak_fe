import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import path from 'path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts' }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // 워크스페이스 패키지(@aechak/api 등)가 자기 쪽 사본을 끌고 들어와도
    // 번들에는 앱의 단일 인스턴스만 실리도록 강제 — react/rq는 이중 로드되면 상태 통지가 유실된다
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
})
