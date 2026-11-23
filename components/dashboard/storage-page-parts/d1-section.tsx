"use client";

import { LayerCard } from "@nocoo/basalt";
import { Badge } from "@nocoo/basalt/components/badge";
import { Database } from "@nocoo/basalt/icons";
import type { StorageScanResult } from "@/models/storage";

export function D1Section({ data }: { data: StorageScanResult["d1"] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-sm font-medium">Cloudflare D1</h3>
        {data.connected ? (
          <Badge tone="success" className="text-[10px]">
            connected
          </Badge>
        ) : (
          <Badge tone="danger" className="text-[10px]">
            disconnected
          </Badge>
        )}
      </div>

      {data.connected && (
        <LayerCard padding="none" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-basalt-secondary/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-basalt-muted-foreground">
                  Table
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-basalt-muted-foreground">
                  Rows
                </th>
              </tr>
            </thead>
            <tbody>
              {data.tables.map((table) => (
                <tr
                  key={table.name}
                  className="border-t border-basalt-border hover:bg-basalt-background/50 transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-basalt-foreground">{table.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-basalt-muted-foreground">
                    {table.rows.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </LayerCard>
      )}
    </div>
  );
}
