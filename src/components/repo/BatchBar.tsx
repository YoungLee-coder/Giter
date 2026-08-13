import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/useI18n";

type Props = {
  busy: boolean;
  refreshing: boolean;
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
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
  allSelected,
  someSelected,
  onSelectAll,
  onClearSelection,
  onAdd,
  onScan,
  onRefresh,
  onFetch,
  onUpdate,
  onRemoveSelected,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy || totalCount === 0}
        aria-pressed={allSelected}
        aria-label={t("selectAll")}
        onClick={() => {
          if (allSelected) onClearSelection();
          else onSelectAll();
        }}
      >
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          tabIndex={-1}
          className="pointer-events-none"
          aria-hidden="true"
        />
        {t("selectAll")}
      </Button>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex items-center">
          <Button
            type="button"
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
                className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
                aria-label={t("addMenu")}
                disabled={busy}
              >
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onAdd}>{t("addRepo")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onScan}>{t("scanFolder")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={busy || refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? t("refreshing") : t("refresh")}
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="destructive"
          onClick={onRemoveSelected}
          disabled={busy || selectedCount === 0}
        >
          {t("remove")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onFetch}
          disabled={busy || selectedCount === 0}
        >
          {t("fetch")}
        </Button>
        <Button type="button" onClick={onUpdate} disabled={busy || selectedCount === 0}>
          {t("update")}
        </Button>
      </div>
    </div>
  );
}
