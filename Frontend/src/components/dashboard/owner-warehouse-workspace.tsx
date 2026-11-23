"use client";

import { WarehouseAuditPanel } from "@/src/components/dashboard/warehouse/warehouse-audit-panel";
import { WarehouseMovementsPanel } from "@/src/components/dashboard/warehouse/warehouse-movements-panel";
import { WarehouseTransfersPanel } from "@/src/components/dashboard/warehouse/warehouse-transfers-panel";
import { WarehouseUnallocatedPanel } from "@/src/components/dashboard/warehouse/warehouse-unallocated-panel";

export type WarehouseSectionId =
  | "transfers"
  | "inventory-audit"
  | "unallocated"
  | "stock-movements";

interface OwnerWarehouseWorkspaceProps {
  section: WarehouseSectionId;
  onInventoryMutated?: () => void;
}

export function OwnerWarehouseWorkspace({
  section,
  onInventoryMutated,
}: OwnerWarehouseWorkspaceProps) {
  if (section === "transfers") {
    return <WarehouseTransfersPanel onInventoryMutated={onInventoryMutated} />;
  }
  if (section === "inventory-audit") {
    return <WarehouseAuditPanel onInventoryMutated={onInventoryMutated} />;
  }
  if (section === "unallocated") {
    return (
      <WarehouseUnallocatedPanel onInventoryMutated={onInventoryMutated} />
    );
  }
  return <WarehouseMovementsPanel />;
}
