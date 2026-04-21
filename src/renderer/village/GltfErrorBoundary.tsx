import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../logger";

interface Props {
  /** Rendered when the child throws during load. */
  fallback: ReactNode;
  /** Short label for logs (e.g. "zone:office", "character:mayor"). */
  label: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Small error boundary for GLB-loading subtrees. @react-three/drei's
 * `useGLTF` throws (or rejects the Suspense promise) on a permanent load
 * failure; without a boundary that blows up the whole <Canvas>. This
 * catches the error, logs it once, and renders the provided Tier 1 cube
 * fallback so the scene keeps rendering.
 */
export class GltfErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.warn("GLB load failed, falling back to cube", {
      label: this.props.label,
      error: error.message,
      componentStack: info.componentStack
    });
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
