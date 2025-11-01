import Link from "next/link";

export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp?.status;

  return (
    <main>
      <h1>Done</h1>
      {status && <p>Status: {decodeURIComponent(status)}</p>}
      <Link href="/">ปิดออกได้เลยครับ</Link>
    </main>
  );
}
