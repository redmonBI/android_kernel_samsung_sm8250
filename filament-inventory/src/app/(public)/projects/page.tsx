import { getDb } from "@/lib/db";
import { publicSrc } from "@/lib/format";

export const metadata = { title: "프로젝트" };

export default function ProjectsPage() {
  const posts = getDb().prepare("SELECT title, body, image_path FROM posts WHERE board = 'project' AND visible = 1 ORDER BY created_at DESC").all() as {
    title: string;
    body: string;
    image_path: string;
  }[];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-10">
      <h1 className="text-3xl font-medium">Projects</h1>
      <p className="mt-2 text-sm text-mute">공개된 시공 사진입니다. 현장 이름과 금액은 올리지 않습니다.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {posts.map((post) => (
          <article key={post.title} className="border border-line">
            <div className="aspect-[16/10] bg-soft">
              {post.image_path ? <img src={publicSrc(post.image_path)} alt={post.title} className="h-full w-full object-cover" /> : null}
            </div>
            <div className="px-4 py-4">
              <h2 className="text-lg">{post.title}</h2>
              <p className="mt-2 text-sm text-mute">{post.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
