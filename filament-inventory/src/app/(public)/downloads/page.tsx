import { getDb } from "@/lib/db";

export const metadata = { title: "자료실" };

export default function DownloadsPage() {
  const posts = getDb().prepare("SELECT title, body FROM posts WHERE board = 'download' AND visible = 1 ORDER BY created_at DESC").all() as { title: string; body: string }[];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-10">
      <h1 className="text-3xl font-medium">Download</h1>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {posts.map((post) => (
          <li key={post.title} className="py-4">
            <h2 className="text-lg">{post.title}</h2>
            <p className="mt-1 text-sm text-mute">{post.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
