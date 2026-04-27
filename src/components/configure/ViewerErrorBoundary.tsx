"use client";
import * as React from "react";
import { MonoLabel } from "@/components/ui/MonoLabel";

type Props = { children: React.ReactNode; resetKey?: string };
type State = { error: Error | null };

/**
 * Catches render errors from the R3F preview so a bad mesh doesn't blank
 * the whole page. Clicking Retry remounts via a key bump.
 */
export class ViewerErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[viewer]", error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-6 text-center">
          <MonoLabel size="md" className="!text-black">
            Preview crashed
          </MonoLabel>
          <p className="text-[12px] font-light text-black/60 max-w-md leading-relaxed">
            We couldn&rsquo;t render this mesh. The quote and pickup flow
            still work — your part is fine, just no 3D preview.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a] hover:underline"
          >
            Retry preview
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
