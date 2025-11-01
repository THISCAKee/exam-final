import Link from "next/link";

export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp?.status;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-6 text-green-600">
          ดำเนินการเสร็จสิ้น
        </h1>

        <p className="text-lg mb-6 text-black">{status}</p>

        <Link
          href="/"
          className="py-2 px-4 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700"
        >
          กลับไปยังหน้าแรก
        </Link>
      </div>
    </main>
  );
}
