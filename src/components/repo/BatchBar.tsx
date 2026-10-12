import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLineIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";

type Props = {
  busy: boolean;
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onFetch: () => void;
  onUpdate: () => void;
  onRemoveSelected: () => void;
};

/**
 * Fleet lane actions for the current selection. Only on screen while something
 * is selected, so the idle list carries no disabled buttons.
 */
export function BatchBar({
  busy,
  selectedCount,
  totalCount,
  onClearSelection,
  onFetch,
  onUpdate,
  onRemoveSelected,
}: Props) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          className="batch-bar"
          role="toolbar"
          aria-label={t("batchActions")}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="batch-bar__count">
            {t("selectedCount", { selected: selectedCount, total: totalCount })}
          </span>
          <span className="batch-bar__rule" aria-hidden="true" />
          <Button type="button" variant="outline" onClick={onFetch} disabled={busy}>
            <RefreshCwIcon />
            {t("fetch")}
          </Button>
          <Button type="button" variant="signal" onClick={onUpdate} disabled={busy}>
            <ArrowDownToLineIcon />
            {t("fastForward")}
          </Button>
          <span className="batch-bar__rule" aria-hidden="true" />
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemoveSelected}
            disabled={busy}
          >
            {t("remove")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("clearSelection")}
            title={t("clearSelection")}
            onClick={onClearSelection}
            disabled={busy}
          >
            <XIcon />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
