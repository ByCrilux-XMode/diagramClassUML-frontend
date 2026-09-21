import EditorPage from "@/components/diagram/EditorPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditorPage key={id} />;
}
