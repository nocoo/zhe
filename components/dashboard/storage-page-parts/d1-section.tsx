"use client";

import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StorageScanResult } from "@/models/storage";

export function D1Section({ data }: { data: StorageScanResult["d1"] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-sm font-medium">Cloudflare D1</h3>
        {data.connected ? (
          <Badge variant="success" className="text-[10px]">connected</Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px]">disconnected</Badge>
        )}
      </div>

      {data.connected && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Table
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                  Rows
                </th>
              </tr>
            </thead>
            <tbody>
              {data.tables.map((table) => (
                <tr
                  key={table.name}
                  className="border-t border-border hover:bg-accent/30 transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-foreground">{table.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {table.rows.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
