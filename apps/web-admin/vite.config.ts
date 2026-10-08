import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import path from 'path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      // 라우트 컴포넌트를 방문 시점에 로드(엔트리 청크 482→약 400 kB). vitest에선 끈다(지연 로드 청크가 CI에서 findBy 1초 타임아웃을 넘김).
      autoCodeSplitting: !process.env.VITEST,
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
