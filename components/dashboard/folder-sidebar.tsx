'use client';

import { FolderIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Folder {
  id: string;
  name: string;
  color: string;
  linkCount: number;
}

interface FolderSidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
}

export function FolderSidebar({ folders, selectedFolderId, onSelectFolder }: FolderSidebarProps) {
  const totalLinks = folders.reduce((sum, f) => sum + f.linkCount, 0);

  return (
    <div className="w-64 border-r border-border bg-card p-4 flex flex-col shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground">文件夹</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            // TODO: Implement folder creation
            console.log('Create folder');
          }}
        >
          <FolderIcon className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-1 flex-1">
        {/* All Links */}
        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            selectedFolderId === null
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-foreground"
          )}
        >
          <FolderIcon className="w-4 h-4" />
          <span className="flex-1 text-left">全部链接</span>
          <span className="text-xs opacity-70">{totalLinks}</span>
        </button>

        {/* Folder List - Placeholder for future implementation */}
        {folders.length > 0 && folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => onSelectFolder(folder.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              selectedFolderId === folder.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            )}
          >
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: folder.color }}
            />
            <span className="flex-1 text-left truncate">{folder.name}</span>
            <span className="text-xs opacity-70">{folder.linkCount}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
