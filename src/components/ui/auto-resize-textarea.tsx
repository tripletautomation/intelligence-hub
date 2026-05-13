import * as React from "react";
import { cn } from "@/lib/utils";

interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
}

export const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, Props>(
  ({ className, minRows = 3, value, onChange, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLTextAreaElement> | null) ?? innerRef;

    const resize = () => {
      const el = resolvedRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };

    React.useEffect(() => { resize(); }, [value]);

    return (
      <textarea
        ref={resolvedRef}
        value={value}
        onChange={(e) => { onChange?.(e); resize(); }}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 leading-relaxed resize-none overflow-hidden",
          className
        )}
        style={{ minHeight: `${minRows * 1.6}rem` }}
        {...props}
      />
    );
  }
);
AutoResizeTextarea.displayName = "AutoResizeTextarea";
