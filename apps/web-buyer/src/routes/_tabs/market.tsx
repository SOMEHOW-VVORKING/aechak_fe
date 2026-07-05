import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_tabs/market')({
  component: MarketScreen,
})

function MarketScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-title font-semibold text-text-primary">마켓</h1>
    </div>
  )
}
