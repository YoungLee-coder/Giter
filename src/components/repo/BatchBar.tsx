import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";

type Props = {
  busy: boolean;
  refreshing: boolean;
  selectedCount: number;
  totalCount: number;
  onAdd: () => void;
  onScan: () => void;
  onRefresh: () => void;
  onFetch: () => void;
  onUpdate: () => void;
  onRemoveSelected: () => void;
};

export function BatchBar({
  busy,
  refreshing,
  selectedCount,
  totalCount,
  onAdd,
  onScan,
  onRefresh,
  onFetch,
  onUpdate,
  onRemoveSelected,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="flex h-full w-full min-w-0 items-center gap-1.5">
      <div className="flex shrink-0 items-center gap-1">
        <div className="flex items-center">
          <Button
            type="button"
            size="sm"
            className="rounded-r-none"
            onClick={onAdd}
            disabled={busy}
          >
            {t("add")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
                aria-label={t("addMenu")}
                disabled={busy}
              >
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onAdd}>{t("addRepo")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onScan}>
                  {t("scanFolder")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={busy || refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? t("refreshing") : t("refresh")}
        </Button>
      </div>

      <div className="min-w-8 flex-1 self-stretch" data-tauri-drag-region />

      <div className="flex shrink-0 items-center gap-1">
        <span className="px-1 text-[11px] tabular-nums text-muted-foreground">
          {t("selectedCount", { selected: selectedCount, total: totalCount })}
        </span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onRemoveSelected}
          disabled={busy || selectedCount === 0}
        >
          {t("remove")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onFetch}
          disabled={busy || selectedCount === 0}
        >
          {t("fetch")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onUpdate}
          disabled={busy || selectedCount === 0}
        >
          {t("update")}
        </Button>
      </div>
    </div>
  );
}
