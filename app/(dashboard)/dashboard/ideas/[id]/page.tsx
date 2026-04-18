import { IdeaEditorPage } from "@/components/dashboard/idea-editor-page";

export default async function IdeaEditorRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ideaId = Number(id);

  if (Number.isNaN(ideaId) || ideaId <= 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">无效的想法 ID</h2>
        <p className="text-sm text-muted-foreground">请检查 URL 是否正确</p>
      </div>
    );
  }

  return <IdeaEditorPage id={ideaId} />;
}
