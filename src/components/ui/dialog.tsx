"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fadePage } from "@/lib/motion";
import { XIcon } from "lucide-react";

type DialogMotionContextValue = {
  open: boolean;
};

const DialogMotionContext = React.createContext<DialogMotionContextValue | null>(null);

function useDialogOpen() {
  return React.useContext(DialogMotionContext)?.open ?? false;
}

const MotionOverlay = motion.create(DialogPrimitive.Overlay);
const MotionContent = motion.create(DialogPrimitive.Content);

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isControlled = open !== undefined;
  const openValue = isControlled ? !!open : uncontrolledOpen;

  return (
    <DialogMotionContext.Provider value={{ open: openValue }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={(next) => {
          if (!isControlled) setUncontrolledOpen(next);
          onOpenChange?.(next);
        }}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogMotionContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof MotionOverlay>) {
  const reduceMotion = useReducedMotion();

  return (
    <MotionOverlay
      data-slot="dialog-overlay"
      forceMount
      className={cn("fixed inset-0 isolate z-[80]", className)}
      initial={fadePage.initial}
      animate={fadePage.animate}
      exit={fadePage.exit}
      transition={reduceMotion ? { duration: 0 } : fadePage.transition}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>,
  "asChild" | "forceMount"
> & {
  showCloseButton?: boolean;
}) {
  const open = useDialogOpen();
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : fadePage.transition;

  return (
    <DialogPortal forceMount>
      <AnimatePresence>
        {open ? <DialogOverlay key="dialog-overlay" /> : null}
      </AnimatePresence>
      <AnimatePresence>
        {open ? (
          <MotionContent
            key="dialog-content"
            data-slot="dialog-content"
            forceMount
            className={cn(
              "giter-dialog fixed top-1/2 left-1/2 z-[80] grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-[var(--radius-lg)] p-4 text-sm outline-none sm:max-w-sm sm:rounded-lg",
              className,
            )}
            style={{ x: "-50%", y: "-50%" }}
            initial={fadePage.initial}
            animate={fadePage.animate}
            exit={fadePage.exit}
            transition={transition}
            {...(props as Record<string, unknown>)}
          >
            {children}
            {showCloseButton ? (
              <DialogPrimitive.Close data-slot="dialog-close" asChild>
                <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogPrimitive.Close>
            ) : null}
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-[var(--radius-lg)] border-t border-border/80 bg-muted/40 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-bold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
