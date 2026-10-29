import { getDb } from "@/lib/db";

export const metadata = { title: "조달" };

export default function ProcurementPage() {
  const posts = getDb().prepare("SELECT title, body FROM posts WHERE board = 'procurement' AND visible = 1 ORDER BY created_at DESC").all() as { title: string; body: string }[];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-10">
      <h1 className="text-3xl font-medium">Procurement</h1>
      <div className="mt-6 space-y-4">
        {posts.map((post) => (
          <article key={post.title} className="border border-line px-4 py-4">
            <h2 className="text-lg">{post.title}</h2>
            <p className="mt-2 text-sm leading-6 text-mute">{post.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
