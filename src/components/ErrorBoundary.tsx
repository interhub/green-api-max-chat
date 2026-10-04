import { WarningCircleIcon } from '@phosphor-icons/react'
import { Component, type ReactNode } from 'react'
import { Button } from '@/ui/Button'

interface ErrorBoundaryProps {
  children: ReactNode
  onReload?: () => void
}

function reloadPage() {
  window.location.reload()
}

/** A render error anywhere below shows this screen instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
        <div
          role="alert"
          className="flex max-w-[360px] flex-col items-center rounded-modal bg-panel px-8 py-7 text-center shadow-float"
        >
          <WarningCircleIcon size={40} aria-hidden="true" className="text-icon-attention" />
          <p className="mt-4 text-title text-fg">Что-то пошло не так</p>
          <Button className="mt-5" onClick={this.props.onReload ?? reloadPage}>
            Обновить страницу
          </Button>
        </div>
      </div>
    )
  }
}
