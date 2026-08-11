import { useCallback, useMemo } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { RepoStatus } from "@/lib/tauri";

/**
 * Sortable sensors + drop handler (cc-switch style: in-place transforms, no overlay).
 * Persistence is owned by the caller — prefer optimistic cache updates so the
 * grid does not flash the pre-drag order when transforms clear on drop.
 */
export function useRepoDragSort(
  repos: RepoStatus[],
  onReorder: (paths: string[]) => void | Promise<void>,
) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const itemIds = useMemo(() => repos.map((r) => r.path), [repos]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = repos.findIndex((r) => r.path === active.id);
      const newIndex = repos.findIndex((r) => r.path === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(repos, oldIndex, newIndex);
      void onReorder(reordered.map((r) => r.path));
    },
    [repos, onReorder],
  );

  return { sensors, itemIds, handleDragEnd };
}
