"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

const checkboxClassName =
  "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary";

const checkboxIndicatorClassName =
  "grid place-content-center text-current transition-none [&>svg]:size-3.5";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(checkboxClassName, className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={checkboxIndicatorClassName}
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// Presentational twin of Checkbox for use inside other interactive controls
// (e.g. a toggle Button), where a nested <button role="checkbox"> is invalid HTML.
function CheckboxMark({
  checked = false,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  checked?: CheckboxPrimitive.CheckedState;
}) {
  const state =
    checked === "indeterminate" ? "indeterminate" : checked ? "checked" : "unchecked";
  return (
    <span
      data-slot="checkbox"
      data-state={state}
      aria-hidden="true"
      className={cn(checkboxClassName, "pointer-events-none", className)}
      {...props}
    >
      {state !== "unchecked" ? (
        <span
          data-slot="checkbox-indicator"
          data-state={state}
          className={checkboxIndicatorClassName}
        >
          <CheckIcon />
        </span>
      ) : null}
    </span>
  );
}

export { Checkbox, CheckboxMark };
