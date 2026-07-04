const { tanstackRouterGenerator } = require('@tanstack/router-vite-plugin')

tanstackRouterGenerator({
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeFileIgnorePrefix: '-',
  quoteStyle: 'single',
})
